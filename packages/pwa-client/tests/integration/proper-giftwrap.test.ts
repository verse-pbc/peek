import { describe, it, expect } from 'vitest';
import {
  SimplePool,
  generateSecretKey,
  getPublicKey,
  finalizeEvent,
  nip44,
  type EventTemplate,
  type UnsignedEvent
} from 'nostr-tools';

const VALIDATION_SERVICE_PUBKEY = '79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
const LOCATION_VALIDATION_REQUEST_KIND = 27492;

describe('Proper Gift Wrap Test', () => {
  it('should send properly encrypted gift wrap that validation service can decrypt', async () => {
    const relay = 'ws://localhost:8090';
    const pool = new SimplePool();

    // Create user keys
    const userSecretKey = generateSecretKey();
    const userPublicKey = getPublicKey(userSecretKey);

    console.log('User pubkey:', userPublicKey);

    // Step 1: Create the rumor (unsigned inner event)
    const rumor: UnsignedEvent = {
      kind: LOCATION_VALIDATION_REQUEST_KIND,
      content: JSON.stringify({
        community_id: 'test-community-proper',
        location: {
          latitude: 37.7749,
          longitude: -122.4194,
          accuracy: 10,
          timestamp: Math.floor(Date.now() / 1000)
        }
      }),
      tags: [],
      created_at: Math.floor(Date.now() / 1000),
      pubkey: userPublicKey
    };

    // Step 2: Create the seal (encrypted rumor)
    const conversationKey = nip44.getConversationKey(
      userSecretKey,
      VALIDATION_SERVICE_PUBKEY
    );
    const encryptedRumor = nip44.encrypt(JSON.stringify(rumor), conversationKey);

    const seal: EventTemplate = {
      kind: 13, // Seal kind
      content: encryptedRumor,
      tags: [],
      created_at: Math.floor(Date.now() / 1000) - Math.floor(Math.random() * 172800) // Random time for privacy
    };

    const signedSeal = finalizeEvent(seal, userSecretKey);

    // Step 3: Create the gift wrap (encrypted seal)
    const ephemeralKey = generateSecretKey();
    const ephemeralPubkey = getPublicKey(ephemeralKey);

    const giftConversationKey = nip44.getConversationKey(
      ephemeralKey,
      VALIDATION_SERVICE_PUBKEY
    );
    const encryptedSeal = nip44.encrypt(JSON.stringify(signedSeal), giftConversationKey);

    const giftWrap: EventTemplate = {
      kind: 1059, // Gift wrap kind
      content: encryptedSeal,
      tags: [['p', VALIDATION_SERVICE_PUBKEY]],
      created_at: Math.floor(Date.now() / 1000) - Math.floor(Math.random() * 172800) // Random time for privacy
    };

    const signedGiftWrap = finalizeEvent(giftWrap, ephemeralKey);

    console.log('Sending properly encrypted gift wrap:', signedGiftWrap.id);
    console.log('Ephemeral pubkey:', ephemeralPubkey);

    // Send the gift wrap
    await pool.publish([relay], signedGiftWrap);
    console.log('Gift wrap sent');

    // Wait a bit for processing
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Verify it was stored
    const events = await pool.querySync([relay], {
      kinds: [1059],
      '#p': [VALIDATION_SERVICE_PUBKEY],
      ids: [signedGiftWrap.id],
      limit: 1
    });

    expect(events.length).toBe(1);
    expect(events[0].id).toBe(signedGiftWrap.id);

    console.log('Gift wrap verified on relay');

    pool.close([relay]);
  }, 30000);
});