import {
  Event,
  EventTemplate,
  finalizeEvent,
  getPublicKey,
  type VerifiedEvent,
  Filter
} from 'nostr-tools';
import { RelayManager, NIP29_KINDS } from './relay-manager';
import { IdentityMigrationService } from './identity-migration';

export interface GroupMetadata {
  id: string;
  name: string;
  picture?: string;
  about?: string;
  isPublic: boolean;
  isOpen: boolean;
}

export interface GroupMember {
  pubkey: string;
  roles: string[];
  joinedAt?: number;
}

export interface GroupRole {
  name: string;
  description?: string;
  capabilities?: string[];
}

export interface CreateGroupOptions {
  id: string;
  name: string;
  about?: string;
  picture?: string;
  isPublic?: boolean;
  isOpen?: boolean;
}

export interface JoinRequestOptions {
  reason?: string;
  inviteCode?: string;
}

export interface ModerationAction {
  kind: number;
  reason?: string;
  targetPubkey?: string;
  targetEventId?: string;
  roles?: string[];
  metadata?: Partial<GroupMetadata>;
}

export class GroupManager {
  private relayManager: RelayManager;
  private migrationService: IdentityMigrationService;
  private eventSigner?: (event: EventTemplate) => Promise<VerifiedEvent>;
  private groupCache: Map<string, {
    metadata?: GroupMetadata;
    members: Map<string, GroupMember>;
    resolvedMembers: Map<string, GroupMember>; // Deduplicated based on resolved identities
    roles: GroupRole[];
    admins: Map<string, string[]>;
    myMembership?: 'member' | 'admin' | 'none';
    lastUpdated: number;
  }>;

  constructor(relayManager: RelayManager, migrationService: IdentityMigrationService) {
    this.relayManager = relayManager;
    this.migrationService = migrationService;
    this.groupCache = new Map();

    this.setupEventHandlers();
  }

  setEventSigner(signer: (event: EventTemplate) => Promise<VerifiedEvent>) {
    this.eventSigner = signer;
  }

  private setupEventHandlers() {
    this.relayManager.onEvent('kind:39000', (event) => {
      this.handleMetadataEvent(event);
    });

    this.relayManager.onEvent('kind:39001', (event) => {
      this.handleAdminsEvent(event);
    });

    this.relayManager.onEvent('kind:39002', (event) => {
      this.handleMembersEvent(event);
    });

    this.relayManager.onEvent('kind:39003', (event) => {
      this.handleRolesEvent(event);
    });

    this.relayManager.onEvent('kind:9000', (event) => {
      this.handleUserAdded(event);
    });

    this.relayManager.onEvent('kind:9001', (event) => {
      this.handleUserRemoved(event);
    });

    // Listen for migration events
    this.relayManager.onEvent('kind:1776', (event) => {
      this.handleMigrationEvent(event);
    });
  }

  private handleMetadataEvent(event: Event) {
    const groupId = event.tags.find(t => t[0] === 'd')?.[1];
    if (!groupId) return;

    const cache = this.getOrCreateCache(groupId);

    const name = event.tags.find(t => t[0] === 'name')?.[1] || '';
    const picture = event.tags.find(t => t[0] === 'picture')?.[1];
    const about = event.tags.find(t => t[0] === 'about')?.[1];
    const isPublic = event.tags.some(t => t[0] === 'public');
    const isOpen = event.tags.some(t => t[0] === 'open');

    cache.metadata = {
      id: groupId,
      name,
      picture,
      about,
      isPublic,
      isOpen
    };
    cache.lastUpdated = Date.now();
  }

  private handleAdminsEvent(event: Event) {
    const groupId = event.tags.find(t => t[0] === 'd')?.[1];
    if (!groupId) return;

    const cache = this.getOrCreateCache(groupId);
    cache.admins.clear();

    event.tags
      .filter(t => t[0] === 'p')
      .forEach(tag => {
        const pubkey = tag[1];
        const roles = tag.slice(2);
        cache.admins.set(pubkey, roles);
      });

    this.updateMyMembership(groupId);
    cache.lastUpdated = Date.now();
  }

  private handleMembersEvent(event: Event) {
    const groupId = event.tags.find(t => t[0] === 'd')?.[1];
    if (!groupId) return;

    const cache = this.getOrCreateCache(groupId);
    cache.members.clear();

    event.tags
      .filter(t => t[0] === 'p')
      .forEach(tag => {
        const pubkey = tag[1];
        const adminRoles = cache.admins.get(pubkey);
        cache.members.set(pubkey, {
          pubkey,
          roles: adminRoles || []
        });
      });

    this.updateMyMembership(groupId);
    this.updateResolvedMembers(groupId);
    cache.lastUpdated = Date.now();

    // Check if this completes a migration
    const migratingState = localStorage.getItem('identity_migrating');
    if (migratingState) {
      try {
        const state = JSON.parse(migratingState);
        const userPubkey = this.relayManager.getUserPubkey();

        // If our new identity appears in the member list and this group was in migration
        if (userPubkey && userPubkey === state.to && state.groups.includes(groupId) && cache.members.has(userPubkey)) {
          console.log(`[GroupManager] Migration complete - new identity ${userPubkey} confirmed in group ${groupId}`);

          // Clear migrating state
          localStorage.removeItem('identity_migrating');

          // Force refresh to ensure UI updates
          window.location.reload();
        }
      } catch (e) {
        console.error('Error checking migration state:', e);
      }
    }
  }

  private handleRolesEvent(event: Event) {
    const groupId = event.tags.find(t => t[0] === 'd')?.[1];
    if (!groupId) return;

    const cache = this.getOrCreateCache(groupId);
    cache.roles = [];

    event.tags
      .filter(t => t[0] === 'role')
      .forEach(tag => {
        cache.roles.push({
          name: tag[1],
          description: tag[2]
        });
      });

    cache.lastUpdated = Date.now();
  }

  private handleUserAdded(event: Event) {
    const groupId = event.tags.find(t => t[0] === 'h')?.[1];
    if (!groupId) return;

    const userTag = event.tags.find(t => t[0] === 'p');
    if (!userTag) return;

    const pubkey = userTag[1];
    const roles = userTag.slice(2);

    const cache = this.getOrCreateCache(groupId);
    cache.members.set(pubkey, {
      pubkey,
      roles,
      joinedAt: event.created_at
    });

    if (roles.length > 0) {
      cache.admins.set(pubkey, roles);
    }

    this.updateMyMembership(groupId);
    this.updateResolvedMembers(groupId);
    cache.lastUpdated = Date.now();
  }

  private handleUserRemoved(event: Event) {
    const groupId = event.tags.find(t => t[0] === 'h')?.[1];
    if (!groupId) return;

    const pubkey = event.tags.find(t => t[0] === 'p')?.[1];
    if (!pubkey) return;

    const cache = this.getOrCreateCache(groupId);
    cache.members.delete(pubkey);
    cache.admins.delete(pubkey);

    this.updateMyMembership(groupId);
    this.updateResolvedMembers(groupId);
    cache.lastUpdated = Date.now();
  }

  private handleMigrationEvent(event: Event) {
    const oldPubkey = event.pubkey;
    const newPubkey = event.tags.find(t => t[0] === 'p')?.[1];

    if (!newPubkey) return;

    console.log(`Processing migration event: ${oldPubkey} -> ${newPubkey}`);

    // Store migration for message resolution
    const migrations = JSON.parse(localStorage.getItem('identity_migrations') || '{}');
    migrations[oldPubkey] = newPubkey;
    localStorage.setItem('identity_migrations', JSON.stringify(migrations));

    // Update cache if old pubkey was in any groups
    // The validation service will send kind 9000/9001 events to update memberships
    // We don't need to manually update here, just store the migration
  }

  private getOrCreateCache(groupId: string) {
    if (!this.groupCache.has(groupId)) {
      this.groupCache.set(groupId, {
        members: new Map(),
        resolvedMembers: new Map(),
        admins: new Map(),
        roles: [],
        lastUpdated: Date.now()
      });
    }
    return this.groupCache.get(groupId)!;
  }

  private updateResolvedMembers(groupId: string) {
    const cache = this.getOrCreateCache(groupId);
    cache.resolvedMembers.clear();

    // Build resolved member map - deduplicates based on resolved identity
    for (const [pubkey, member] of cache.members) {
      const resolvedPubkey = this.migrationService.resolveIdentity(pubkey);

      // If this resolved identity is already in the map, skip it (deduplication)
      if (!cache.resolvedMembers.has(resolvedPubkey)) {
        cache.resolvedMembers.set(resolvedPubkey, {
          ...member,
          pubkey: resolvedPubkey // Use resolved pubkey
        });
      }
    }
  }

  private updateMyMembership(groupId: string) {
    const userPubkey = this.relayManager.getUserPubkey();
    if (!userPubkey) return;

    const cache = this.getOrCreateCache(groupId);

    if (cache.admins.has(userPubkey)) {
      cache.myMembership = 'admin';
    } else if (cache.members.has(userPubkey)) {
      cache.myMembership = 'member';
    } else {
      cache.myMembership = 'none';
    }
  }

  async createGroup(
    secretKey: Uint8Array,
    options: CreateGroupOptions
  ): Promise<Event> {
    const event = await this.relayManager.sendCreateGroup(
      options.id,
      secretKey
    );

    const cache = this.getOrCreateCache(options.id);
    cache.metadata = {
      id: options.id,
      name: options.name,
      picture: options.picture,
      about: options.about,
      isPublic: options.isPublic ?? true,
      isOpen: options.isOpen ?? false
    };

    const pubkey = getPublicKey(secretKey);
    cache.members.set(pubkey, {
      pubkey,
      roles: ['creator'],
      joinedAt: event.created_at
    });
    cache.admins.set(pubkey, ['creator']);
    cache.myMembership = 'admin';

    this.relayManager.subscribeToGroup(options.id);

    return event;
  }

  /**
   * Set initial admin status for a user (useful after validation service creates group)
   */
  setInitialAdminStatus(groupId: string, pubkey: string): void {
    const cache = this.getOrCreateCache(groupId);

    // Add to members and admins
    cache.members.set(pubkey, {
      pubkey,
      roles: ['admin'],
      joinedAt: Math.floor(Date.now() / 1000)
    });
    cache.admins.set(pubkey, ['admin']);

    // Update my membership if it's the current user
    const userPubkey = this.relayManager.getUserPubkey();
    if (userPubkey === pubkey) {
      cache.myMembership = 'admin';
    }
  }

  async joinGroup(
    groupId: string,
    secretKey: Uint8Array,
    options?: JoinRequestOptions
  ): Promise<Event> {
    const event = await this.relayManager.sendJoinRequest(
      groupId,
      secretKey,
      options?.reason,
      options?.inviteCode
    );

    this.relayManager.subscribeToGroup(groupId);

    return event;
  }

  async leaveGroup(
    groupId: string,
    secretKey: Uint8Array,
    reason?: string
  ): Promise<Event> {
    const event = await this.relayManager.sendLeaveRequest(
      groupId,
      secretKey,
      reason
    );

    const cache = this.groupCache.get(groupId);
    if (cache) {
      const pubkey = getPublicKey(secretKey);
      cache.members.delete(pubkey);
      cache.admins.delete(pubkey);
      cache.myMembership = 'none';
    }

    this.relayManager.unsubscribeFromGroup(groupId);

    return event;
  }

  async addUser(
    groupId: string,
    targetPubkey: string,
    secretKey?: Uint8Array,
    roles?: string[]
  ): Promise<Event> {
    return this.performModerationAction(groupId, secretKey, {
      kind: NIP29_KINDS.PUT_USER,
      targetPubkey,
      roles
    });
  }

  async removeUser(
    groupId: string,
    targetPubkey: string,
    secretKey?: Uint8Array,
    reason?: string
  ): Promise<Event> {
    return this.performModerationAction(groupId, secretKey, {
      kind: NIP29_KINDS.REMOVE_USER,
      targetPubkey,
      reason
    });
  }

  async updateMetadata(
    groupId: string,
    secretKey: Uint8Array | undefined,
    updates: Partial<GroupMetadata>
  ): Promise<Event> {
    return this.performModerationAction(groupId, secretKey, {
      kind: 9002,
      metadata: updates
    });
  }

  async deleteEvent(
    groupId: string,
    eventId: string,
    secretKey: Uint8Array,
    reason?: string
  ): Promise<Event> {
    return this.performModerationAction(groupId, secretKey, {
      kind: 9005,
      targetEventId: eventId,
      reason
    });
  }

  async createInvite(
    groupId: string,
    secretKey: Uint8Array
  ): Promise<{ event: Event; code: string }> {
    const inviteCode = this.generateInviteCode();

    const event = await this.performModerationAction(groupId, secretKey, {
      kind: 9009
    });

    return { event, code: inviteCode };
  }

  private async performModerationAction(
    groupId: string,
    secretKey: Uint8Array | undefined,
    action: ModerationAction
  ): Promise<Event> {
    const tags: string[][] = [
      ['h', groupId]
    ];

    const previousEvents = this.relayManager.getRecentEventIds(groupId);
    if (previousEvents.length > 0) {
      tags.push(['previous', ...previousEvents]);
    }

    if (action.targetPubkey) {
      const pTag = ['p', action.targetPubkey];
      if (action.roles) {
        pTag.push(...action.roles);
      }
      tags.push(pTag);
    }

    if (action.targetEventId) {
      tags.push(['e', action.targetEventId]);
    }

    if (action.metadata) {
      if (action.metadata.name) {
        tags.push(['name', action.metadata.name]);
      }
      if (action.metadata.about) {
        tags.push(['about', action.metadata.about]);
      }
      if (action.metadata.picture) {
        tags.push(['picture', action.metadata.picture]);
      }
      if (action.metadata.isPublic !== undefined) {
        tags.push([action.metadata.isPublic ? 'public' : 'private']);
      }
      if (action.metadata.isOpen !== undefined) {
        tags.push([action.metadata.isOpen ? 'open' : 'closed']);
      }
    }

    const eventTemplate: EventTemplate = {
      kind: action.kind,
      content: action.reason || '',
      tags,
      created_at: Math.floor(Date.now() / 1000)
    };

    // Use event signer if available (NIP-07), otherwise use provided secret key
    let event: VerifiedEvent;
    if (this.eventSigner) {
      event = await this.eventSigner(eventTemplate);
    } else if (secretKey) {
      event = finalizeEvent(eventTemplate, secretKey) as VerifiedEvent;
    } else {
      throw new Error('No signing method available for moderation action');
    }

    await this.relayManager.publishEvent(event);

    return event;
  }

  getGroupMetadata(groupId: string): GroupMetadata | undefined {
    return this.groupCache.get(groupId)?.metadata;
  }

  getGroupMembers(groupId: string): GroupMember[] {
    const cache = this.groupCache.get(groupId);
    if (!cache) return [];
    return Array.from(cache.members.values());
  }

  /**
   * Get deduplicated group members after resolving identity migrations
   */
  getResolvedGroupMembers(groupId: string): GroupMember[] {
    const cache = this.groupCache.get(groupId);
    if (!cache) return [];
    return Array.from(cache.resolvedMembers.values());
  }

  /**
   * Get accurate member count after deduplicating migrated identities
   */
  getResolvedMemberCount(groupId: string): number {
    const cache = this.groupCache.get(groupId);
    if (!cache) return 0;
    return cache.resolvedMembers.size;
  }

  getGroupAdmins(groupId: string): GroupMember[] {
    const cache = this.groupCache.get(groupId);
    if (!cache) return [];

    return Array.from(cache.admins.entries()).map(([pubkey, roles]) => ({
      pubkey,
      roles
    }));
  }

  getGroupRoles(groupId: string): GroupRole[] {
    return this.groupCache.get(groupId)?.roles || [];
  }

  isGroupMember(groupId: string, pubkey?: string): boolean {
    const cache = this.groupCache.get(groupId);
    if (!cache) return false;

    const targetPubkey = pubkey || this.relayManager.getUserPubkey();
    if (!targetPubkey) return false;

    return cache.members.has(targetPubkey);
  }

  isGroupAdmin(groupId: string, pubkey?: string): boolean {
    const cache = this.groupCache.get(groupId);
    if (!cache) return false;

    const targetPubkey = pubkey || this.relayManager.getUserPubkey();
    if (!targetPubkey) return false;

    return cache.admins.has(targetPubkey);
  }

  getMyMembership(groupId: string): 'member' | 'admin' | 'none' {
    return this.groupCache.get(groupId)?.myMembership || 'none';
  }

  /**
   * Check membership status directly from the relay (bypasses cache)
   * This is the authoritative way to check if a user is a member
   * Prioritizes kind 39002 (GROUP_MEMBERS) events over kind 9000/9001 (moderation) events
   */
  async checkMembershipDirectly(groupId: string, pubkey?: string): Promise<boolean> {
    const targetPubkey = pubkey || this.relayManager.getUserPubkey();
    if (!targetPubkey) return false;

    console.log(`[GroupManager] Checking membership directly for ${targetPubkey} in ${groupId}`);

    try {
      // PRIORITY 1: Check current membership via kind 39002 (GROUP_MEMBERS) events
      // This is the most reliable source as it reflects the current state
      const isMemberViaGroupEvents = await this.relayManager.queryGroupMembership(groupId, targetPubkey);

      if (isMemberViaGroupEvents) {
        console.log(`[GroupManager] User confirmed as member via kind 39002 events`);
        return true;
      }

      console.log(`[GroupManager] User not found in kind 39002 events, checking moderation timeline...`);

      // PRIORITY 2: Fallback to moderation events (kind 9000/9001) for membership timeline
      const latestEvent = await this.relayManager.queryMembershipEvents(groupId, targetPubkey);

      if (!latestEvent) {
        console.log(`[GroupManager] No membership events found - user was never added`);
        return false;
      }

      // Check if the latest event is an add (9000) or remove (9001)
      if (latestEvent.kind === 9000) {
        console.log(`[GroupManager] Latest moderation event shows user was added`);
        return true;
      } else if (latestEvent.kind === 9001) {
        console.log(`[GroupManager] Latest moderation event shows user was removed`);
        return false;
      }

      // PRIORITY 3: Final fallback for development testing - check localStorage
      // Need to extract UUID from group metadata first
      console.log(`[GroupManager] Checking localStorage as final fallback...`);

      try {
        const filter: Filter = {
          kinds: [39000],
          '#d': [groupId],
          limit: 1
        };

        const metadataEvents = await this.relayManager.queryEventsDirectly(filter);
        if (metadataEvents.length > 0) {
          const communityId = this.extractUuidFromMetadata(metadataEvents[0]);
          if (communityId) {
            const joinedGroups = JSON.parse(localStorage.getItem('joinedGroups') || '[]');
            const isInLocalStorage = joinedGroups.some((g: { communityId: string }) => g.communityId === communityId);

            if (isInLocalStorage) {
              console.log(`[GroupManager] Found community ${communityId} in localStorage, allowing access for testing`);
              return true;
            }
          }
        }
      } catch (e) {
        console.error('[GroupManager] Error checking localStorage fallback:', e);
      }

      console.log(`[GroupManager] User is not a member according to all checks`);
      return false;

    } catch (error) {
      console.error('[GroupManager] Error checking membership directly:', error);
      return false;
    }
  }

  getAllGroups(): Map<string, GroupMetadata> {
    const groups = new Map<string, GroupMetadata>();

    for (const [groupId, cache] of this.groupCache) {
      if (cache.metadata) {
        groups.set(groupId, cache.metadata);
      }
    }

    return groups;
  }

  /**
   * Get all groups where the current user is a member using NIP-29 events
   * Returns an array of community objects with metadata
   */
  async getUserGroups(): Promise<Array<{
    groupId: string;
    communityId: string;
    name: string;
    memberCount: number;
    isAdmin: boolean;
    metadata?: GroupMetadata;
  }>> {
    const userPubkey = this.relayManager.getUserPubkey();
    if (!userPubkey) {
      console.warn('[GroupManager] Cannot get user groups: no pubkey available');
      return [];
    }

    try {
      // Query the relay for all groups this user belongs to
      const groupIds = await this.relayManager.queryUserGroups(userPubkey);

      console.log(`[GroupManager] Found ${groupIds.length} groups for user:`, groupIds);

      const userGroups: Array<{
        groupId: string;
        communityId: string;
        name: string;
        memberCount: number;
        isAdmin: boolean;
        metadata?: GroupMetadata;
      }> = [];

      for (const groupId of groupIds) {
        // Check if this is a Peek group (starts with 'peek-')
        if (!groupId.startsWith('peek-')) {
          continue; // Skip non-Peek groups
        }

        // Need to fetch metadata to extract UUID from i-tag
        // Query for kind 39000 metadata event
        const filter: Filter = {
          kinds: [39000],
          '#d': [groupId],
          limit: 1
        };

        const metadataEvents = await this.relayManager.queryEventsDirectly(filter);
        if (metadataEvents.length === 0) {
          console.warn(`[GroupManager] No metadata found for group ${groupId}`);
          continue;
        }

        const metadataEvent = metadataEvents[0];

        // Extract UUID from i-tag
        const communityId = this.extractUuidFromMetadata(metadataEvent);
        if (!communityId) {
          console.warn(`[GroupManager] No UUID found in i-tag for group ${groupId}`);
          continue;
        }

        console.log(`[GroupManager] Extracted UUID ${communityId} from group ${groupId}`);

        // Get metadata from cache first
        let metadata = this.getGroupMetadata(groupId);
        const memberCount = this.getResolvedMemberCount(groupId);

        // If not in cache, process the metadata event we just fetched
        if (!metadata || !metadata.name) {
          console.log(`[GroupManager] Processing metadata event for ${groupId}`);
          this.handleMetadataEvent(metadataEvent);
          metadata = this.getGroupMetadata(groupId);

          // Also start subscription for future updates
          this.relayManager.subscribeToGroup(groupId);
        }

        // Check if user is admin
        const isAdmin = this.isGroupAdmin(groupId, userPubkey);

        const userGroup = {
          groupId: communityId, // Use communityId (UUID) for navigation
          communityId,
          name: metadata?.name || `Community ${communityId.slice(0, 8)}`,
          memberCount: memberCount > 0 ? memberCount : 1,
          isAdmin,
          metadata
        };

        userGroups.push(userGroup);
        console.log(`[GroupManager] Added user group:`, userGroup);
      }

      console.log(`[GroupManager] Returning ${userGroups.length} user groups`);
      return userGroups;

    } catch (error) {
      console.error('[GroupManager] Error getting user groups:', error);
      return [];
    }
  }

  /**
   * Extract UUID from a metadata event's i-tag (NIP-73)
   * Returns null if no i-tag found
   */
  private extractUuidFromMetadata(event: Event): string | null {
    const iTag = event.tags.find(t => t[0] === 'i' && t[1]?.startsWith('peek:uuid:'));
    if (iTag && iTag[1]) {
      const uuid = iTag[1].replace('peek:uuid:', '');
      return uuid;
    }
    return null;
  }

  /**
   * Fetch group metadata directly from relay without relying on subscriptions
   */
  private async fetchGroupMetadataDirectly(groupId: string): Promise<GroupMetadata | null> {
    try {
      // Use RelayManager to directly query for kind 39000 metadata
      if (!this.relayManager.isConnected()) {
        console.warn('[GroupManager] Cannot fetch metadata: relay not connected');
        return null;
      }

      // Query for the metadata event
      const filter: Filter = {
        kinds: [39000],
        '#d': [groupId],
        limit: 1
      };

      // Use RelayManager's queryEventsDirectly method
      const events = await this.relayManager.queryEventsDirectly(filter);

      if (events.length === 0) {
        console.log(`[GroupManager] No metadata event found for ${groupId}`);
        return null;
      }

      const event = events[0];
      console.log(`[GroupManager] Found metadata event for ${groupId}:`, event);

      // Parse the metadata from tags
      const metadata: GroupMetadata = {
        id: groupId,
        name: '',
        isPublic: false,
        isOpen: false
      };

      for (const tag of event.tags) {
        if (tag[0] === 'name' && tag[1]) {
          metadata.name = tag[1];
        } else if (tag[0] === 'about' && tag[1]) {
          metadata.about = tag[1];
        } else if (tag[0] === 'picture' && tag[1]) {
          metadata.picture = tag[1];
        } else if (tag[0] === 'public') {
          metadata.isPublic = true;
        } else if (tag[0] === 'private') {
          metadata.isPublic = false;
        } else if (tag[0] === 'open') {
          metadata.isOpen = true;
        } else if (tag[0] === 'closed') {
          metadata.isOpen = false;
        }
      }

      console.log(`[GroupManager] Parsed metadata for ${groupId}:`, metadata);
      return metadata;

    } catch (error) {
      console.error('[GroupManager] Error fetching group metadata directly:', error);
      return null;
    }
  }

  refreshGroup(groupId: string) {
    this.relayManager.subscribeToGroup(groupId);
  }

  private generateInviteCode(): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  clearCache(groupId?: string) {
    if (groupId) {
      this.groupCache.delete(groupId);
    } else {
      this.groupCache.clear();
    }
  }

  dispose() {
    this.groupCache.clear();
  }
}

export function createGroupManager(relayUrl?: string): GroupManager {
  const relayManager = new RelayManager({
    url: relayUrl || 'wss://peek.hol.is',
    autoConnect: true
  });

  const migrationService = new IdentityMigrationService(relayManager);
  return new GroupManager(relayManager, migrationService);
}