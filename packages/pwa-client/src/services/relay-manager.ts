import {
  SimplePool,
  Relay,
  Event,
  Filter,
  finalizeEvent,
  type EventTemplate,
  type VerifiedEvent
} from 'nostr-tools';

// NIP-29 event kinds
export const NIP29_KINDS = {
  // User actions
  JOIN_REQUEST: 9021,
  LEAVE_REQUEST: 9022,

  // Moderation actions (admin/relay only)
  PUT_USER: 9000,
  REMOVE_USER: 9001,
  EDIT_METADATA: 9002,
  DELETE_EVENT: 9005,
  CREATE_GROUP: 9007,
  DELETE_GROUP: 9008,
  CREATE_INVITE: 9009,

  // Metadata events (relay-generated)
  GROUP_METADATA: 39000,
  GROUP_ADMINS: 39001,
  GROUP_MEMBERS: 39002,
  GROUP_ROLES: 39003,

  // Content events
  CHAT_MESSAGE: 9,  // Use kind 9 for NIP-29 group chat messages
  CHANNEL_MESSAGE: 42,
} as const;

export interface RelayConnectionOptions {
  url: string;
  autoConnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

interface RelayGroupMetadata {
  id: string;
  name: string;
  about?: string;
  picture?: string;
  private: boolean;
  closed: boolean;
  broadcast?: boolean;
}

interface RelayGroupMember {
  pubkey: string;
  roles: string[];
}

export interface GroupState {
  metadata?: RelayGroupMetadata;
  members: Map<string, RelayGroupMember>;
  admins: Map<string, string[]>; // pubkey -> roles
  myMembership?: RelayGroupMember;
}

type EventHandler = (event: Event) => void;
type ConnectionHandler = (connected: boolean) => void;

export class RelayManager {
  private pool: SimplePool;
  private relayUrl: string;
  private relay?: Relay;
  private subscriptions: Map<string, unknown>;
  private groupStates: Map<string, GroupState>;
  private eventHandlers: Map<string, Set<EventHandler>>;
  private connectionHandlers: Set<ConnectionHandler>;
  private reconnectInterval: number;
  private maxReconnectAttempts: number;
  private reconnectAttempts: number;
  private reconnectTimer?: NodeJS.Timeout;
  private isConnecting: boolean;
  private userPubkey?: string;
  private authHandler?: (authEvent: EventTemplate) => Promise<VerifiedEvent>;
  private eventSigner?: (event: EventTemplate) => Promise<VerifiedEvent>;
  private uuidToGroupCache: Map<string, string>; // UUID -> h-tag cache
  private readonly UUID_CACHE_KEY = 'uuid_to_group_cache';

  constructor(options: RelayConnectionOptions) {
    this.pool = new SimplePool();
    this.relayUrl = options.url;
    this.subscriptions = new Map();
    this.groupStates = new Map();
    this.eventHandlers = new Map();
    this.connectionHandlers = new Set();
    this.reconnectInterval = options.reconnectInterval || 5000;
    this.maxReconnectAttempts = options.maxReconnectAttempts || 10;
    this.reconnectAttempts = 0;
    this.isConnecting = false;

    // Load UUID cache from localStorage
    this.uuidToGroupCache = this.loadUuidCache();

    if (options.autoConnect !== false) {
      this.connect();
    }
  }

  /**
   * Set the current user's public key for membership tracking
   */
  setUserPubkey(pubkey: string) {
    this.userPubkey = pubkey;
  }

  /**
   * Set the authentication handler for NIP-42
   * The handler should sign the auth event and return a VerifiedEvent
   */
  setAuthHandler(handler: (authEvent: EventTemplate) => Promise<VerifiedEvent>) {
    this.authHandler = handler;
  }

  /**
   * Set event signer for creating events (supports NIP-07)
   */
  setEventSigner(signer: (event: EventTemplate) => Promise<VerifiedEvent>) {
    this.eventSigner = signer;
  }

  /**
   * Get the relay URL
   */
  get url(): string {
    return this.relayUrl;
  }

  /**
   * Query membership events directly from the relay
   * Returns the most recent event to determine current membership status
   */
  async queryMembershipEvents(groupId: string, pubkey: string): Promise<Event | null> {
    if (!this.relay || !this.relay.connected) {
      console.warn('[RelayManager] Cannot query events: not connected');
      return null;
    }

    try {
      // Query for both add-user (9000) and remove-user (9001) events
      const filter: Filter = {
        kinds: [9000, 9001],
        '#h': [groupId],
        '#p': [pubkey],
        limit: 10
      };

      console.log('[RelayManager] Querying membership events:', { groupId, pubkey });

      // Use pool.querySync to get events directly
      const events = await this.pool.querySync([this.relayUrl], filter);

      if (events.length === 0) {
        console.log('[RelayManager] No membership events found');
        return null;
      }

      // Sort by created_at to find the most recent event
      events.sort((a, b) => b.created_at - a.created_at);
      const latestEvent = events[0];

      console.log('[RelayManager] Latest membership event:', {
        kind: latestEvent.kind,
        created_at: latestEvent.created_at,
        isAddUser: latestEvent.kind === 9000
      });

      return latestEvent;
    } catch (error) {
      console.error('[RelayManager] Error querying membership events:', error);
      return null;
    }
  }

  /**
   * Query all groups where the user is a member by checking kind 39002 (GROUP_MEMBERS) events
   * Returns an array of group IDs the user belongs to
   */
  async queryUserGroups(pubkey?: string): Promise<string[]> {
    const targetPubkey = pubkey || this.userPubkey;
    if (!targetPubkey) {
      console.warn('[RelayManager] Cannot query user groups: no pubkey provided');
      return [];
    }

    if (!this.relay || !this.relay.connected) {
      console.warn('[RelayManager] Cannot query user groups: not connected');
      return [];
    }

    try {
      console.log('[RelayManager] Querying user groups for pubkey:', targetPubkey);

      // Query for all GROUP_MEMBERS (kind 39002) events that contain this user's pubkey
      const filter: Filter = {
        kinds: [NIP29_KINDS.GROUP_MEMBERS],
        '#p': [targetPubkey],
        limit: 100
      };

      const events = await this.pool.querySync([this.relayUrl], filter);
      console.log(`[RelayManager] Found ${events.length} GROUP_MEMBERS events containing user`);

      // Extract group IDs from the 'd' tags
      const groupIds: string[] = [];
      for (const event of events) {
        const dTag = event.tags.find(tag => tag[0] === 'd' && tag[1]);
        if (dTag && dTag[1]) {
          groupIds.push(dTag[1]);
          console.log(`[RelayManager] User is member of group: ${dTag[1]}`);
        }
      }

      // Remove duplicates and return
      const uniqueGroupIds = [...new Set(groupIds)];
      console.log(`[RelayManager] User belongs to ${uniqueGroupIds.length} unique groups:`, uniqueGroupIds);

      return uniqueGroupIds;
    } catch (error) {
      console.error('[RelayManager] Error querying user groups:', error);
      return [];
    }
  }

  /**
   * Check if a user is a member of a specific group by querying kind 39002 (GROUP_MEMBERS) events
   * This is the authoritative way to check current membership status
   */
  async queryGroupMembership(groupId: string, pubkey: string): Promise<boolean> {
    if (!this.relay || !this.relay.connected) {
      console.warn('[RelayManager] Cannot query group membership: not connected');
      return false;
    }

    try {
      console.log(`[RelayManager] Checking membership for user ${pubkey} in group ${groupId}`);

      // Query for the latest GROUP_MEMBERS (kind 39002) event for this group
      const filter: Filter = {
        kinds: [NIP29_KINDS.GROUP_MEMBERS],
        '#d': [groupId],
        limit: 1
      };

      const events = await this.pool.querySync([this.relayUrl], filter);

      if (events.length === 0) {
        console.log(`[RelayManager] No GROUP_MEMBERS event found for group ${groupId}`);
        return false;
      }

      const membersEvent = events[0];
      console.log(`[RelayManager] Found GROUP_MEMBERS event for ${groupId}, checking for user ${pubkey}`);

      // Check if the user's pubkey is in the 'p' tags
      const isMember = membersEvent.tags.some(tag =>
        tag[0] === 'p' && tag[1] === pubkey
      );

      console.log(`[RelayManager] User ${pubkey} ${isMember ? 'is' : 'is not'} a member of group ${groupId}`);
      return isMember;

    } catch (error) {
      console.error('[RelayManager] Error querying group membership:', error);
      return false;
    }
  }

  /**
   * Query events directly using the pool
   */
  async queryEventsDirectly(filter: Filter): Promise<Event[]> {
    const startTime = Date.now();
    const filterStr = JSON.stringify(filter);

    console.log(`[RelayManager] 🔍 Query START - Filter: ${filterStr.substring(0, 100)}...`);

    if (!this.relay || !this.relay.connected) {
      console.error('[RelayManager] ❌ Query FAILED - Relay not connected', {
        hasRelay: !!this.relay,
        isConnected: this.relay?.connected,
        filter: filterStr
      });
      return [];
    }

    try {
      console.log(`[RelayManager] 📡 Querying pool (connected: ${this.relay.connected})`);
      const events = await this.pool.querySync([this.relayUrl], filter);
      const duration = Date.now() - startTime;

      console.log(`[RelayManager] ✅ Query SUCCESS - ${events.length} events in ${duration}ms`, {
        filter: filterStr.substring(0, 80),
        eventCount: events.length,
        duration
      });

      return events;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[RelayManager] ❌ Query ERROR after ${duration}ms:`, {
        error,
        filter: filterStr.substring(0, 80),
        relayConnected: this.relay?.connected,
        relayUrl: this.relayUrl
      });
      return [];
    }
  }

  /**
   * Get the timestamp of the last activity (chat message) in a group
   * Uses NIP-01 limit semantics: limit:1 returns the newest event by created_at
   */
  async getGroupLastActivity(groupId: string): Promise<number | null> {
    try {
      const events = await this.pool.querySync([this.relayUrl], {
        kinds: [NIP29_KINDS.CHAT_MESSAGE],
        '#h': [groupId],
        limit: 1
      });

      if (events.length > 0) {
        return events[0].created_at;
      }
      return null;
    } catch (error) {
      console.error(`[RelayManager] Error getting last activity for group ${groupId}:`, error);
      return null;
    }
  }

  /**
   * Get last activity timestamps for multiple groups in a single batched query
   * More efficient than calling getGroupLastActivity() individually for each group
   * Includes caching with 5-minute TTL to avoid redundant queries
   */
  async getMultipleGroupsLastActivity(groupIds: string[]): Promise<Map<string, number>> {
    const lastActivityMap = new Map<string, number>();

    if (groupIds.length === 0) {
      return lastActivityMap;
    }

    // Check cache first
    const CACHE_KEY = 'group_last_activity_cache';
    const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
    const now = Date.now();

    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const cacheData: { timestamp: number; data: Record<string, number> } = JSON.parse(cached);
        if (now - cacheData.timestamp < CACHE_TTL) {
          // Cache is still valid, use it
          const groupsToFetch: string[] = [];

          for (const groupId of groupIds) {
            if (cacheData.data[groupId] !== undefined) {
              lastActivityMap.set(groupId, cacheData.data[groupId]);
            } else {
              groupsToFetch.push(groupId);
            }
          }

          // If all groups were in cache, return immediately
          if (groupsToFetch.length === 0) {
            console.log(`[RelayManager] All ${groupIds.length} groups found in cache`);
            return lastActivityMap;
          }

          // Update groupIds to only fetch missing ones
          groupIds = groupsToFetch;
          console.log(`[RelayManager] ${lastActivityMap.size} groups from cache, ${groupIds.length} to fetch`);
        }
      }
    } catch (error) {
      console.error('[RelayManager] Error reading last activity cache:', error);
    }

    try {
      console.log(`[RelayManager] Fetching last activity for ${groupIds.length} groups in batch`);

      // Single query with multiple #h filters
      const events = await this.pool.querySync([this.relayUrl], {
        kinds: [NIP29_KINDS.CHAT_MESSAGE],
        '#h': groupIds
      });

      console.log(`[RelayManager] Received ${events.length} chat messages for batched groups`);

      // Group events by #h tag and find the latest for each group
      for (const event of events) {
        const groupId = event.tags.find(t => t[0] === 'h')?.[1];
        if (!groupId) continue;

        const existing = lastActivityMap.get(groupId);
        if (!existing || event.created_at > existing) {
          lastActivityMap.set(groupId, event.created_at);
        }
      }

      console.log(`[RelayManager] Found last activity for ${lastActivityMap.size} groups`);

      // Update cache with new data
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        const cacheData = cached ? JSON.parse(cached).data : {};

        // Merge new data with existing cache
        for (const [groupId, timestamp] of lastActivityMap) {
          cacheData[groupId] = timestamp;
        }

        localStorage.setItem(CACHE_KEY, JSON.stringify({
          timestamp: now,
          data: cacheData
        }));
      } catch (error) {
        console.error('[RelayManager] Error updating last activity cache:', error);
      }

      return lastActivityMap;

    } catch (error) {
      console.error(`[RelayManager] Error getting batched last activity:`, error);
      return lastActivityMap;
    }
  }

  /**
   * Load UUID cache from localStorage
   */
  private loadUuidCache(): Map<string, string> {
    try {
      const stored = localStorage.getItem(this.UUID_CACHE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        console.log(`[RelayManager] Loaded ${Object.keys(parsed).length} UUID mappings from cache`);
        return new Map(Object.entries(parsed));
      }
    } catch (error) {
      console.warn('[RelayManager] Failed to load UUID cache:', error);
    }
    return new Map();
  }

  /**
   * Save UUID cache to localStorage
   */
  private saveUuidCache(): void {
    try {
      const obj = Object.fromEntries(this.uuidToGroupCache);
      localStorage.setItem(this.UUID_CACHE_KEY, JSON.stringify(obj));
    } catch (error) {
      console.warn('[RelayManager] Failed to save UUID cache:', error);
    }
  }

  /**
   * Find a group's h-tag by its UUID using NIP-73 i-tag
   * Returns the group_id (h-tag) if found, null otherwise
   */
  async findGroupByUuid(uuid: string): Promise<string | null> {
    // Check cache first
    if (this.uuidToGroupCache.has(uuid)) {
      const cached = this.uuidToGroupCache.get(uuid)!;
      console.log(`[RelayManager] Found cached group ${cached} for UUID ${uuid}`);
      return cached;
    }

    if (!this.relay || !this.relay.connected) {
      console.warn('[RelayManager] Cannot find group by UUID: not connected');
      return null;
    }

    try {
      console.log(`[RelayManager] Looking up group for UUID ${uuid}`);

      // Query for kind 39000 (GROUP_METADATA) with i-tag containing the UUID
      const filter: Filter = {
        kinds: [NIP29_KINDS.GROUP_METADATA],
        '#i': [`peek:uuid:${uuid}`],
        limit: 1
      };

      const events = await this.pool.querySync([this.relayUrl], filter);

      if (events.length === 0) {
        console.log(`[RelayManager] No group found for UUID ${uuid}`);
        return null;
      }

      // Extract d-tag which contains the group h-tag
      const dTag = events[0].tags.find(t => t[0] === 'd')?.[1];
      if (dTag) {
        console.log(`[RelayManager] Found group ${dTag} for UUID ${uuid}`);
        // Cache the mapping and persist to localStorage
        this.uuidToGroupCache.set(uuid, dTag);
        this.saveUuidCache();
        return dTag;
      }

      console.warn('[RelayManager] Found event but no d-tag for UUID', uuid);
      return null;
    } catch (error) {
      console.error('[RelayManager] Error finding group by UUID:', error);
      return null;
    }
  }

  /**
   * Cache a UUID to h-tag mapping (useful when received from validation response)
   */
  cacheUuidToGroup(uuid: string, groupId: string): void {
    this.uuidToGroupCache.set(uuid, groupId);
    this.saveUuidCache();
  }

  /**
   * Connect to the relay
   */
  async connect(): Promise<void> {
    if (this.isConnecting || this.isConnected()) {
      return;
    }

    this.isConnecting = true;

    try {
      console.log(`[RelayManager] Connecting to ${this.relayUrl}...`);

      // Get relay instance from pool
      this.relay = await this.pool.ensureRelay(this.relayUrl);

      // Wait for connection
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, 10000);

        const checkConnection = setInterval(() => {
          if (this.relay && this.relay.connected) {
            clearInterval(checkConnection);
            clearTimeout(timeout);
            resolve();
          }
        }, 100);
      });

      console.log(`[RelayManager] Connected to ${this.relayUrl}`);

      // Handle NIP-42 authentication if the relay sent an AUTH challenge
      if (this.authHandler && this.relay && (this.relay as unknown as { challenge?: string }).challenge) {
        console.log('[RelayManager] AUTH challenge detected, authenticating...');
        try {
          await (this.relay as { auth?: (handler: unknown) => Promise<unknown> }).auth?.(this.authHandler);
          console.log('[RelayManager] Successfully authenticated');
        } catch (error) {
          console.error('[RelayManager] Authentication failed:', error);
        }
      }

      this.reconnectAttempts = 0;
      this.isConnecting = false;

      // Only notify connection AFTER authentication completes (if needed)
      // This ensures private group queries work immediately when connected=true
      this.notifyConnectionHandlers(true);

      // Subscribe to group metadata for all groups
      this.subscribeToAllGroupMetadata();

    } catch (error) {
      console.error(`[RelayManager] Failed to connect to ${this.relayUrl}:`, error);
      this.isConnecting = false;
      this.notifyConnectionHandlers(false);
      this.scheduleReconnect();
    }
  }

  /**
   * Disconnect from the relay
   */
  disconnect(): void {
    console.log(`[RelayManager] Disconnecting from ${this.relayUrl}`);

    // Clear reconnect timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    // Close all subscriptions
    this.subscriptions.forEach(sub => (sub as { close?: () => void })?.close?.());
    this.subscriptions.clear();

    // Close relay connection
    if (this.relay) {
      this.relay.close();
      this.relay = undefined;
    }

    this.notifyConnectionHandlers(false);
  }

  /**
   * Check if connected to the relay
   */
  isConnected(): boolean {
    return this.relay?.connected === true;
  }

  /**
   * Subscribe to connection status changes
   */
  onConnectionChange(handler: ConnectionHandler): () => void {
    this.connectionHandlers.add(handler);
    // Immediately notify of current status
    handler(this.isConnected());

    return () => {
      this.connectionHandlers.delete(handler);
    };
  }

  /**
   * Subscribe to all group metadata events
   */
  private subscribeToAllGroupMetadata(): void {
    if (!this.isConnected()) return;

    const filter: Filter = {
      kinds: [
        NIP29_KINDS.GROUP_METADATA,
        NIP29_KINDS.GROUP_ADMINS,
        NIP29_KINDS.GROUP_MEMBERS,
        NIP29_KINDS.GROUP_ROLES
      ]
    };

    const sub = this.pool.subscribeMany(
      [this.relayUrl],
      [filter],
      {
        onevent: (event) => this.handleMetadataEvent(event),
        oneose: () => console.log('[RelayManager] Initial metadata sync complete')
      }
    );

    this.subscriptions.set('metadata', sub);
  }

  /**
   * Subscribe to a specific group's events
   * @param groupId - The group ID to subscribe to
   * @param force - Force re-subscription even if already subscribed (useful after identity change)
   */
  subscribeToGroup(groupId: string, force = false): void {
    if (!this.isConnected()) {
      console.warn('[RelayManager] Cannot subscribe: not connected');
      return;
    }

    // Check if already subscribed to this group
    if (this.subscriptions.has(`group-${groupId}`)) {
      if (!force) {
        console.log(`[RelayManager] Already subscribed to group ${groupId}`);
        return;
      }
      // Force re-subscription: unsubscribe first
      console.log(`[RelayManager] Force re-subscribing to group ${groupId}`);
      this.unsubscribeFromGroup(groupId);
    }

    // Ensure we have a state for this group
    if (!this.groupStates.has(groupId)) {
      this.groupStates.set(groupId, {
        members: new Map(),
        admins: new Map()
      });
    }

    console.log(`[RelayManager] Subscribing to group ${groupId} with auth handler:`, !!this.authHandler);

    // Subscribe to h-tagged events (content + moderation)
    const hFilter: Filter = {
      '#h': [groupId],
      kinds: [
        NIP29_KINDS.PUT_USER,
        NIP29_KINDS.REMOVE_USER,
        NIP29_KINDS.CHAT_MESSAGE,
        NIP29_KINDS.CHANNEL_MESSAGE,
        NIP29_KINDS.DELETE_EVENT,
        NIP29_KINDS.CREATE_INVITE,
        NIP29_KINDS.JOIN_REQUEST,
        NIP29_KINDS.LEAVE_REQUEST,
        1776 // Migration events for this group
      ]
    };

    // Subscribe to d-tagged metadata events for this group
    const dFilter: Filter = {
      '#d': [groupId],
      kinds: [
        NIP29_KINDS.GROUP_METADATA,
        NIP29_KINDS.GROUP_ADMINS,
        NIP29_KINDS.GROUP_MEMBERS,
        NIP29_KINDS.GROUP_ROLES
      ]
    };

    const sub = this.pool.subscribeMany(
      [this.relayUrl],
      [hFilter, dFilter],
      {
        onevent: (event) => this.handleGroupEvent(groupId, event),
        oneose: () => console.log(`[RelayManager] Synced with group ${groupId}`),
        onauth: this.authHandler
      }
    );

    this.subscriptions.set(`group-${groupId}`, sub);
  }

  /**
   * Unsubscribe from a group's events
   */
  unsubscribeFromGroup(groupId: string): void {
    const sub = this.subscriptions.get(`group-${groupId}`);
    if (sub) {
      (sub as { close?: () => void })?.close?.();
      this.subscriptions.delete(`group-${groupId}`);
    }
  }

  /**
   * Send a join request to a group
   */
  async sendJoinRequest(
    groupId: string,
    secretKey: Uint8Array,
    reason?: string,
    inviteCode?: string
  ): Promise<Event> {
    if (!this.isConnected()) {
      throw new Error('Not connected to relay');
    }

    const tags: string[][] = [['h', groupId]];
    if (inviteCode) {
      tags.push(['code', inviteCode]);
    }

    const event: EventTemplate = {
      kind: NIP29_KINDS.JOIN_REQUEST,
      content: reason || '',
      tags,
      created_at: Math.floor(Date.now() / 1000)
    };

    const signedEvent = finalizeEvent(event, secretKey);

    await this.publishEvent(signedEvent);
    return signedEvent;
  }

  /**
   * Send a leave request from a group
   */
  async sendLeaveRequest(
    groupId: string,
    secretKey: Uint8Array,
    reason?: string
  ): Promise<Event> {
    if (!this.isConnected()) {
      throw new Error('Not connected to relay');
    }

    const event: EventTemplate = {
      kind: NIP29_KINDS.LEAVE_REQUEST,
      content: reason || '',
      tags: [['h', groupId]],
      created_at: Math.floor(Date.now() / 1000)
    };

    const signedEvent = finalizeEvent(event, secretKey);

    await this.publishEvent(signedEvent);
    return signedEvent;
  }

  /**
   * Send a chat message to a group
   */
  async sendMessage(
    groupId: string,
    content: string,
    secretKey?: Uint8Array,
    replyTo?: string
  ): Promise<Event> {
    if (!this.isConnected()) {
      throw new Error('Not connected to relay');
    }

    const tags: string[][] = [['h', groupId]];

    // Add reply tag if replying to another message
    if (replyTo) {
      tags.push(['e', replyTo, '', 'reply']);
    }

    // Add previous event references for timeline integrity
    const previousEvents = this.getRecentEventIds(groupId, 3);
    if (previousEvents.length > 0) {
      tags.push(['previous', ...previousEvents]);
    }

    const event: EventTemplate = {
      kind: NIP29_KINDS.CHAT_MESSAGE,
      content,
      tags,
      created_at: Math.floor(Date.now() / 1000)
    };

    // Use event signer if available (NIP-07), otherwise use provided secret key
    let signedEvent: VerifiedEvent;
    if (this.eventSigner) {
      signedEvent = await this.eventSigner(event);
    } else if (secretKey) {
      signedEvent = finalizeEvent(event, secretKey) as VerifiedEvent;
    } else {
      throw new Error('No signing method available');
    }

    await this.publishEvent(signedEvent);
    return signedEvent;
  }

  /**
   * Send create group event (kind 9007)
   */
  async sendCreateGroup(
    groupId: string,
    secretKey: Uint8Array
  ): Promise<Event> {
    if (!this.isConnected()) {
      throw new Error('Not connected to relay');
    }

    const eventTemplate: EventTemplate = {
      kind: NIP29_KINDS.CREATE_GROUP,
      content: '',
      tags: [
        ['h', groupId]
      ],
      created_at: Math.floor(Date.now() / 1000)
    };

    const event = finalizeEvent(eventTemplate, secretKey);
    await this.publishEvent(event);

    return event;
  }

  /**
   * Get user's public key if set
   */
  getUserPubkey(): string | undefined {
    return this.userPubkey;
  }

  /**
   * Publish an event to the relay
   */
  async publishEvent(event: Event): Promise<void> {
    if (!this.relay) {
      throw new Error('Not connected to relay');
    }

    await this.relay.publish(event);

    console.log(`[RelayManager] Published event ${event.id} (kind ${event.kind})`);
  }

  /**
   * Get recent event IDs from a group for timeline references
   */
  getRecentEventIds(groupId: string, _count: number = 3): string[] {
    // This would need to be implemented with actual event tracking
    // For now, return empty array
    return [];
  }

  /**
   * Handle metadata events
   */
  private handleMetadataEvent(event: Event): void {
    const dTag = event.tags.find(t => t[0] === 'd')?.[1];
    if (!dTag) return;

    // Get or create group state
    let state = this.groupStates.get(dTag);
    if (!state) {
      state = { members: new Map(), admins: new Map() };
      this.groupStates.set(dTag, state);
    }

    switch (event.kind) {
      case NIP29_KINDS.GROUP_METADATA:
        state.metadata = this.parseGroupMetadata(event);
        break;

      case NIP29_KINDS.GROUP_ADMINS:
        state.admins = this.parseGroupAdmins(event);
        break;

      case NIP29_KINDS.GROUP_MEMBERS:
        state.members = this.parseGroupMembers(event);
        // Update my membership status if I'm in the list
        if (this.userPubkey && state.members.has(this.userPubkey)) {
          state.myMembership = state.members.get(this.userPubkey);
        }
        break;
    }

    // Notify handlers
    this.notifyEventHandlers(`group-metadata-${dTag}`, event);
  }

  /**
   * Handle events for a specific group
   */
  private handleGroupEvent(groupId: string, event: Event): void {
    console.log(`[RelayManager] Received event for group ${groupId}:`, event.kind, event.id);

    const state = this.groupStates.get(groupId);
    if (!state) return;

    // Note: Membership is tracked via 39xxx replaceable events
    // We don't need to handle individual PUT_USER/REMOVE_USER events

    // Notify handlers for this event type
    this.notifyEventHandlers(`group-${groupId}`, event);
    this.notifyEventHandlers(`kind-${event.kind}`, event);
  }

  /**
   * Parse group metadata from event
   */
  private parseGroupMetadata(event: Event): RelayGroupMetadata {
    const metadata: RelayGroupMetadata = {
      id: event.tags.find(t => t[0] === 'd')?.[1] || '',
      name: event.tags.find(t => t[0] === 'name')?.[1] || '',
      about: event.tags.find(t => t[0] === 'about')?.[1],
      picture: event.tags.find(t => t[0] === 'picture')?.[1],
      private: event.tags.some(t => t[0] === 'private'),
      closed: event.tags.some(t => t[0] === 'closed'),
      broadcast: event.tags.some(t => t[0] === 'broadcast')
    };

    return metadata;
  }

  /**
   * Parse group admins from event
   */
  private parseGroupAdmins(event: Event): Map<string, string[]> {
    const admins = new Map<string, string[]>();

    event.tags
      .filter(t => t[0] === 'p')
      .forEach(tag => {
        const pubkey = tag[1];
        const roles = tag.slice(2);
        admins.set(pubkey, roles);
      });

    return admins;
  }

  /**
   * Parse group members from event
   */
  private parseGroupMembers(event: Event): Map<string, RelayGroupMember> {
    const members = new Map<string, RelayGroupMember>();

    event.tags
      .filter(t => t[0] === 'p')
      .forEach(tag => {
        const pubkey = tag[1];
        members.set(pubkey, {
          pubkey,
          roles: ['member'] // Basic membership, roles come from admins list
        });
      });

    return members;
  }

  /**
   * Subscribe to events of a specific kind or pattern
   */
  onEvent(pattern: string, handler: EventHandler): () => void {
    if (!this.eventHandlers.has(pattern)) {
      this.eventHandlers.set(pattern, new Set());
    }

    this.eventHandlers.get(pattern)!.add(handler);

    return () => {
      this.eventHandlers.get(pattern)?.delete(handler);
    };
  }

  /**
   * Get the current state of a group
   */
  getGroupState(groupId: string): GroupState | undefined {
    return this.groupStates.get(groupId);
  }

  /**
   * Get all known groups
   */
  getAllGroups(): Map<string, GroupState> {
    return new Map(this.groupStates);
  }

  /**
   * Check if user is member of a group
   */
  isMemberOf(groupId: string): boolean {
    const state = this.groupStates.get(groupId);
    return state?.myMembership !== undefined;
  }

  /**
   * Check if user is admin of a group
   */
  isAdminOf(groupId: string): boolean {
    if (!this.userPubkey) return false;
    const state = this.groupStates.get(groupId);
    return state?.admins.has(this.userPubkey) || false;
  }

  /**
   * Notify connection handlers
   */
  private notifyConnectionHandlers(connected: boolean): void {
    this.connectionHandlers.forEach(handler => handler(connected));
  }

  /**
   * Notify event handlers
   */
  private notifyEventHandlers(pattern: string, event: Event): void {
    this.eventHandlers.get(pattern)?.forEach(handler => handler(event));
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[RelayManager] Max reconnection attempts reached');
      return;
    }

    const delay = Math.min(
      this.reconnectInterval * Math.pow(2, this.reconnectAttempts),
      60000 // Max 60 seconds
    );

    console.log(`[RelayManager] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++;
      this.connect();
    }, delay);
  }

  /**
   * Publish a gift wrap event (NIP-59)
   * Reuses existing authenticated connection
   */
  async publishGiftWrap(giftWrap: Event): Promise<void> {
    if (!this.relay) {
      throw new Error('Not connected to relay');
    }

    await this.relay.publish(giftWrap);
    console.log(`[RelayManager] Published gift wrap ${giftWrap.id}`);
  }

  /**
   * Subscribe to gift wrap events for a specific recipient
   * @param recipientPubkey The public key of the recipient
   * @param handler Function to call when a gift wrap is received
   * @returns Subscription ID for later cleanup
   */
  subscribeToGiftWraps(
    recipientPubkey: string,
    handler: (event: Event) => void,
    onlyAfterEose = true // Only process events after EOSE by default
  ): string {
    if (!this.relay) {
      throw new Error('Not connected to relay');
    }

    const subId = `gift-wraps-${Date.now()}`;
    const filter: Filter = {
      kinds: [1059], // NIP-59 gift wrap kind
      '#p': [recipientPubkey],
      since: Math.floor(Date.now() / 1000) - (2 * 24 * 60 * 60), // Last 2 days (NIP-59 max timestamp randomization)
      limit: 100, // Additional safety limit to avoid fetching too many events
    };

    let eoseReceived = false;

    const sub = this.relay.subscribe([filter], {
      onevent: (event) => {
        console.log(`[RelayManager] Received gift wrap: ${event.id}`);

        // If onlyAfterEose is true, skip events until EOSE is received
        if (onlyAfterEose && !eoseReceived) {
          // Silently skip historical events before EOSE
          return;
        }

        handler(event);
      },
      oneose: () => {
        console.log(`[RelayManager] End of stored gift wraps for ${recipientPubkey}`);
        eoseReceived = true;
      }
    });

    this.subscriptions.set(subId, sub);
    return subId;
  }

  /**
   * Wait for a gift wrap response with a specific request ID
   * @param requestId The ID to look for in the unwrapped content
   * @param recipientPubkey The public key expecting the response
   * @param timeout Timeout in milliseconds
   * @returns Promise that resolves with the gift wrap event
   */
  async waitForGiftWrapResponse(
    requestId: string,
    recipientPubkey: string,
    timeout: number = 30000
  ): Promise<Event> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        if (subId) {
          this.unsubscribe(subId);
        }
        reject(new Error(`Gift wrap response timeout for request ${requestId}`));
      }, timeout);

      let subId: string | null = null;

      subId = this.subscribeToGiftWraps(recipientPubkey, (event) => {
        // The handler would need to check if this is the expected response
        // This is simplified - actual implementation would need to decrypt and check
        clearTimeout(timeoutId);
        if (subId) {
          this.unsubscribe(subId);
        }
        resolve(event);
      });
    });
  }

  /**
   * Unsubscribe from a specific subscription
   */
  unsubscribe(subId: string): void {
    const sub = this.subscriptions.get(subId);
    if (sub) {
      (sub as { close?: () => void })?.close?.();
      this.subscriptions.delete(subId);
      console.log(`[RelayManager] Unsubscribed from ${subId}`);
    }
  }

  /**
   * Query events from the relay with a filter
   */
  async queryEvents(filter: Filter): Promise<Event[]> {
    return new Promise((resolve, reject) => {
      if (!this.relay || !this.isConnected()) {
        reject(new Error('Not connected to relay'));
        return;
      }

      const events: Event[] = [];
      const subId = `query-${Date.now()}`;

      // Create subscription with filter
      const sub = this.relay.subscribe(
        [filter],
        {
          onevent: (event: Event) => {
            events.push(event);
          },
          oneose: () => {
            // End of stored events
            this.unsubscribe(subId);
            resolve(events);
          }
        }
      );

      this.subscriptions.set(subId, sub);

      // Timeout after 5 seconds
      setTimeout(() => {
        this.unsubscribe(subId);
        resolve(events);
      }, 5000);
    });
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.disconnect();
    this.eventHandlers.clear();
    this.connectionHandlers.clear();
    this.groupStates.clear();
  }
}