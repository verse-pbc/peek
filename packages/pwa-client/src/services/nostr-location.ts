import {
  SimplePool,
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
  getEventHash,
  nip44,
  nip19,
  type Event,
  type EventTemplate,
  type UnsignedEvent
} from 'nostr-tools';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

// Custom event kinds for Peek location validation (ephemeral range)
const LOCATION_VALIDATION_REQUEST_KIND = 27492;
const LOCATION_VALIDATION_RESPONSE_KIND = 27493;

// NIP-59 kinds
const SEAL_KIND = 13;
const GIFT_WRAP_KIND = 1059;

// Default relay URLs (should come from config)
const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.nostr.band',
  'wss://nos.lol'
];

// Validation service public key (this should come from config/env)
const VALIDATION_SERVICE_PUBKEY = import.meta.env.VITE_VALIDATION_SERVICE_PUBKEY ||
  '0000000000000000000000000000000000000000000000000000000000000000'; // Placeholder hex pubkey

// Types
type Rumor = UnsignedEvent & { id: string };

export interface LocationData {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}

export interface LocationValidationRequest {
  community_id: string;
  location: LocationData;
}

export interface LocationValidationResponse {
  success: boolean;
  invite_code?: string;  // NIP-29 invite code
  group_id?: string;
  relay_url?: string;
  is_admin?: boolean;
  is_member?: boolean;
  error?: string;
  error_code?: string;
}

// Time helpers for privacy
const TWO_DAYS = 2 * 24 * 60 * 60;
const now = () => Math.floor(Date.now() / 1000);
const randomNow = () => Math.floor(now() - (Math.random() * TWO_DAYS));

export class NostrLocationService {
  private pool: SimplePool;
  private relays: string[];
  private secretKey: Uint8Array;
  private publicKey: string;

  constructor(secretKey: Uint8Array, publicKey: string, relays?: string[]) {
    this.pool = new SimplePool();
    this.relays = relays || DEFAULT_RELAYS;
    this.secretKey = secretKey;
    this.publicKey = publicKey;
  }

  /**
   * Create an unsigned rumor event
   */
  private createRumor(
    kind: number,
    content: string,
    tags: string[][] = []
  ): Rumor {
    const rumor: UnsignedEvent = {
      kind,
      content,
      tags,
      created_at: now(),
      pubkey: this.publicKey
    };

    // Calculate ID but don't sign
    const id = getEventHash(rumor);

    return { ...rumor, id } as Rumor;
  }

  /**
   * Create a sealed event (kind 13) containing a rumor
   */
  private createSeal(
    rumor: Rumor,
    recipientPubkey: string
  ): Event {
    // Get conversation key for NIP-44 encryption
    const conversationKey = nip44.getConversationKey(
      this.secretKey,
      recipientPubkey
    );

    // Encrypt the rumor
    const encryptedContent = nip44.encrypt(
      JSON.stringify(rumor),
      conversationKey
    );

    // Create and sign the seal
    const seal: EventTemplate = {
      kind: SEAL_KIND,
      content: encryptedContent,
      tags: [], // No tags in seal to prevent metadata leaks
      created_at: randomNow() // Random time for privacy
    };

    return finalizeEvent(seal, this.secretKey);
  }

  /**
   * Create a gift wrap (kind 1059) containing a sealed event
   */
  private createGiftWrap(
    sealedEvent: Event,
    recipientPubkey: string
  ): Event {
    // Generate random ephemeral key for gift wrap
    const randomKey = generateSecretKey();
    const randomPubkey = getPublicKey(randomKey);

    // Get conversation key for the ephemeral identity
    const conversationKey = nip44.getConversationKey(
      randomKey,
      recipientPubkey
    );

    // Encrypt the sealed event
    const encryptedContent = nip44.encrypt(
      JSON.stringify(sealedEvent),
      conversationKey
    );

    // Create gift wrap with ephemeral key
    const giftWrap: EventTemplate = {
      kind: GIFT_WRAP_KIND,
      content: encryptedContent,
      tags: [
        ['p', recipientPubkey] // Only tag is recipient
      ],
      created_at: randomNow() // Random time for privacy
    };

    return finalizeEvent(giftWrap, randomKey);
  }

  /**
   * Unwrap a gift wrap and unseal the inner rumor
   */
  private unwrapAndUnseal(giftWrap: Event): Rumor | null {
    try {
      // First, decrypt the gift wrap to get the seal
      const conversationKey = nip44.getConversationKey(
        this.secretKey,
        giftWrap.pubkey
      );

      const decryptedWrap = nip44.decrypt(
        giftWrap.content,
        conversationKey
      );

      const seal = JSON.parse(decryptedWrap) as Event;

      // Verify it's a seal
      if (seal.kind !== SEAL_KIND) {
        console.error('Invalid seal kind:', seal.kind);
        return null;
      }

      // Decrypt the seal to get the rumor
      const sealConversationKey = nip44.getConversationKey(
        this.secretKey,
        seal.pubkey
      );

      const decryptedSeal = nip44.decrypt(
        seal.content,
        sealConversationKey
      );

      return JSON.parse(decryptedSeal) as Rumor;
    } catch (error) {
      console.error('Failed to unwrap gift wrap:', error);
      return null;
    }
  }

  /**
   * Send location validation request via NIP-59 gift wrap
   */
  async validateLocation(
    communityId: string,
    location: LocationData
  ): Promise<LocationValidationResponse> {
    try {
      // Create the validation request rumor
      const requestData: LocationValidationRequest = {
        community_id: communityId,
        location
      };

      const rumor = this.createRumor(
        LOCATION_VALIDATION_REQUEST_KIND,
        JSON.stringify(requestData)
      );

      // Seal it for the validation service
      const seal = this.createSeal(rumor, VALIDATION_SERVICE_PUBKEY);

      // Gift wrap it
      const giftWrap = this.createGiftWrap(seal, VALIDATION_SERVICE_PUBKEY);

      console.log('Sending location validation request:', {
        rumorId: rumor.id,
        giftWrapId: giftWrap.id
      });

      // Publish to relays
      await Promise.all(
        this.relays.map(relay =>
          this.pool.publish([relay], giftWrap)
        )
      );

      // Wait for response
      const response = await this.waitForValidationResponse(rumor.id);

      return response;
    } catch (error) {
      console.error('Location validation error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        error_code: 'VALIDATION_ERROR'
      };
    }
  }

  /**
   * Wait for validation response gift wrap
   */
  private async waitForValidationResponse(
    requestId: string
  ): Promise<LocationValidationResponse> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        sub.close();
        reject(new Error('Validation timeout'));
      }, 30000); // 30 second timeout

      // Subscribe to gift wraps for us
      const sub = this.pool.subscribeMany(
        this.relays,
        [
          {
            kinds: [GIFT_WRAP_KIND],
            '#p': [this.publicKey],
            since: Math.floor(Date.now() / 1000) - 60 // Last minute
          }
        ],
        {
          onevent: async (event: Event) => {
            // Try to unwrap and unseal
            const rumor = this.unwrapAndUnseal(event);

            if (!rumor) return;

            // Check if it's a validation response
            if (rumor.kind !== LOCATION_VALIDATION_RESPONSE_KIND) return;

            try {
              const response = JSON.parse(rumor.content) as LocationValidationResponse;

              // Could verify it's responding to our request by checking tags
              // For now, accept any validation response

              clearTimeout(timeout);
              sub.close();
              resolve(response);
            } catch (error) {
              console.error('Failed to parse response:', error);
            }
          },
          oneose: () => {
            console.log('Waiting for validation response...');
          }
        }
      );
    });
  }

  /**
   * Get user's DM relay preferences (NIP-17 kind 10050)
   */
  async getUserDMRelays(pubkey: string): Promise<string[]> {
    const events = await this.pool.querySync(
      this.relays,
      {
        kinds: [10050],
        authors: [pubkey],
        limit: 1
      }
    );

    if (events.length === 0) {
      return this.relays; // Fall back to default relays
    }

    const dmRelays = events[0].tags
      .filter(tag => tag[0] === 'relay')
      .map(tag => tag[1])
      .filter(Boolean);

    return dmRelays.length > 0 ? dmRelays : this.relays;
  }

  /**
   * Close all relay connections
   */
  close() {
    this.pool.close(this.relays);
  }
}

/**
 * Helper to get preview data (for now returns mock)
 * In production, this could be a separate request or included in validation
 */
export async function getPreviewData(
  communityId: string,
  secretKey: Uint8Array,
  publicKey: string
): Promise<any> {
  // For now, return mock data
  // In production, could send a preview request via gift wrap
  return {
    name: "Community",
    description: "Location-based community",
    member_count: 0,
    created_at: Math.floor(Date.now() / 1000),
    is_first_scan: false
  };
}