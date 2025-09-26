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
   */
  subscribeToGroup(groupId: string): void {
    if (!this.isConnected()) {
      console.warn('[RelayManager] Cannot subscribe: not connected');
      return;
    }

    // Ensure we have a state for this group
    if (!this.groupStates.has(groupId)) {
      this.groupStates.set(groupId, {
        members: new Map(),
        admins: new Map()
      });
    }

    console.log(`[RelayManager] Subscribing to group ${groupId} with auth handler:`, !!this.authHandler);

    // Subscribe to h-tagged events (content and moderation)
    const hFilter: Filter = {
      '#h': [groupId],
      kinds: [
        NIP29_KINDS.CHAT_MESSAGE,
        NIP29_KINDS.CHANNEL_MESSAGE,
        NIP29_KINDS.PUT_USER,
        NIP29_KINDS.REMOVE_USER,
        NIP29_KINDS.DELETE_EVENT,
        NIP29_KINDS.CREATE_INVITE,
        NIP29_KINDS.JOIN_REQUEST,
        NIP29_KINDS.LEAVE_REQUEST,
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

    // Handle moderation events that affect membership
    switch (event.kind) {
      case NIP29_KINDS.PUT_USER: {
        const pubkey = event.tags.find(t => t[0] === 'p')?.[1];
        if (pubkey) {
          const roles = event.tags
            .filter(t => t[0] === 'p' && t[1] === pubkey)
            .flatMap(t => t.slice(2));

          state.members.set(pubkey, { pubkey, roles });

          if (pubkey === this.userPubkey) {
            state.myMembership = { pubkey, roles };
          }
        }
        break;
      }

      case NIP29_KINDS.REMOVE_USER: {
        const pubkey = event.tags.find(t => t[0] === 'p')?.[1];
        if (pubkey) {
          state.members.delete(pubkey);
          if (pubkey === this.userPubkey) {
            state.myMembership = undefined;
          }
        }
        break;
      }
    }

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
    handler: (event: Event) => void
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

    const sub = this.relay.subscribe([filter], {
      onevent: (event) => {
        console.log(`[RelayManager] Received gift wrap: ${event.id}`);
        handler(event);
      },
      oneose: () => {
        console.log(`[RelayManager] End of stored gift wraps for ${recipientPubkey}`);
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
   * Clean up resources
   */
  dispose(): void {
    this.disconnect();
    this.eventHandlers.clear();
    this.connectionHandlers.clear();
    this.groupStates.clear();
  }
}