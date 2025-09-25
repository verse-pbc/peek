import { describe, it, expect } from 'vitest';
import {
  generateSecretKey,
  getPublicKey,
  finalizeEvent,
  nip44,
  type EventTemplate,
  type UnsignedEvent
} from 'nostr-tools';

// Use the actual validation service pubkey for tests
const VALIDATION_SERVICE_PUBKEY = process.env.VITE_VALIDATION_SERVICE_PUBKEY ||
  '829774829a2c9884607fc59f22762de04c1ee2ac36a504228ff1a99d6519fac2';
const LOCATION_VALIDATION_REQUEST_KIND = 27492;

describe('Gift Wrap Creation Unit Test', () => {
  it('should create properly formatted NIP-59 gift wrap event', () => {

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

    // Verify the gift wrap structure
    expect(signedGiftWrap.kind).toBe(1059);
    expect(signedGiftWrap.tags).toContainEqual(['p', VALIDATION_SERVICE_PUBKEY]);
    expect(signedGiftWrap.content).toBeTruthy();
    expect(signedGiftWrap.pubkey).toBe(ephemeralPubkey);
    expect(signedGiftWrap.sig).toBeTruthy();
    expect(signedGiftWrap.id).toBeTruthy();

    // Verify the seal can be decrypted from the gift wrap
    const decryptedSeal = JSON.parse(
      nip44.decrypt(signedGiftWrap.content, giftConversationKey)
    );
    expect(decryptedSeal.kind).toBe(13);
    expect(decryptedSeal.pubkey).toBe(userPublicKey);

    // Verify the rumor can be decrypted from the seal
    const decryptedRumor = JSON.parse(
      nip44.decrypt(decryptedSeal.content, conversationKey)
    );
    expect(decryptedRumor.kind).toBe(LOCATION_VALIDATION_REQUEST_KIND);
    expect(decryptedRumor.pubkey).toBe(userPublicKey);

    const content = JSON.parse(decryptedRumor.content);
    expect(content.community_id).toBe('test-community-proper');
    expect(content.location.latitude).toBe(37.7749);
  });
});