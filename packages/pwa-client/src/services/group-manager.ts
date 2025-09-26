import {
  Event,
  EventTemplate,
  finalizeEvent,
  getPublicKey,
  type VerifiedEvent
} from 'nostr-tools';
import { RelayManager, NIP29_KINDS } from './relay-manager';

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
  private eventSigner?: (event: EventTemplate) => Promise<VerifiedEvent>;
  private groupCache: Map<string, {
    metadata?: GroupMetadata;
    members: Map<string, GroupMember>;
    roles: GroupRole[];
    admins: Map<string, string[]>;
    myMembership?: 'member' | 'admin' | 'none';
    lastUpdated: number;
  }>;

  constructor(relayManager: RelayManager) {
    this.relayManager = relayManager;
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
    cache.lastUpdated = Date.now();
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
    cache.lastUpdated = Date.now();
  }

  private getOrCreateCache(groupId: string) {
    if (!this.groupCache.has(groupId)) {
      this.groupCache.set(groupId, {
        members: new Map(),
        admins: new Map(),
        roles: [],
        lastUpdated: Date.now()
      });
    }
    return this.groupCache.get(groupId)!;
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
    secretKey: Uint8Array,
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
   */
  async checkMembershipDirectly(groupId: string, pubkey?: string): Promise<boolean> {
    const targetPubkey = pubkey || this.relayManager.getUserPubkey();
    if (!targetPubkey) return false;

    const latestEvent = await this.relayManager.queryMembershipEvents(groupId, targetPubkey);

    if (!latestEvent) {
      // No membership events found - user was never added
      return false;
    }

    // Check if the latest event is an add (9000) or remove (9001)
    if (latestEvent.kind === 9000) {
      // User was added - they are a member
      return true;
    } else if (latestEvent.kind === 9001) {
      // User was removed - they are not a member
      return false;
    }

    // Shouldn't reach here, but default to not a member
    return false;
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

  return new GroupManager(relayManager);
}