import { describe, it, expect } from 'vitest';
import {
  SimplePool,
  generateSecretKey,
  getPublicKey,
  finalizeEvent,
  type EventTemplate
} from 'nostr-tools';
import { NostrLocationService } from '@/services/nostr-location';

describe('Gift Wrap Debug Test', () => {
  it('should send gift wrap and verify it reaches the relay', async () => {
    const secretKey = generateSecretKey();
    const publicKey = getPublicKey(secretKey);
    const relay = 'ws://localhost:8090';
    const VALIDATION_SERVICE_PUBKEY = '79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';

    // First, send a regular gift wrap event (kind 1059) directly
    const pool = new SimplePool();

    const giftWrapEvent: EventTemplate = {
      kind: 1059,
      content: 'Test gift wrap content',
      tags: [['p', VALIDATION_SERVICE_PUBKEY]],
      created_at: Math.floor(Date.now() / 1000)
    };

    const signedGiftWrap = finalizeEvent(giftWrapEvent, secretKey);
    console.log('Sending gift wrap:', signedGiftWrap.id);

    // Publish the gift wrap
    await pool.publish([relay], signedGiftWrap);
    console.log('Gift wrap published');

    // Query it back
    const events = await pool.querySync([relay], {
      kinds: [1059],
      '#p': [VALIDATION_SERVICE_PUBKEY],
      limit: 10
    });

    console.log('Retrieved gift wraps:', events.length);
    console.log('Gift wrap IDs:', events.map(e => e.id));

    expect(events.length).toBeGreaterThan(0);
    expect(events.some(e => e.id === signedGiftWrap.id)).toBe(true);

    pool.close([relay]);
  }, 30000);

  it('should test NostrLocationService gift wrap creation', async () => {
    const secretKey = generateSecretKey();
    const publicKey = getPublicKey(secretKey);
    const relay = 'ws://localhost:8090';

    const service = new NostrLocationService(secretKey, publicKey, [relay]);

    // Create test location data
    const location = {
      latitude: 37.7749,
      longitude: -122.4194,
      accuracy: 10,
      timestamp: Math.floor(Date.now() / 1000)
    };

    console.log('Testing NostrLocationService with relay:', relay);

    // Don't wait for response, just check if gift wrap is sent
    const responsePromise = service.validateLocation('test-community-id', location);

    // Give it a moment to send
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Check if gift wrap was sent to relay
    const pool = new SimplePool();
    const events = await pool.querySync([relay], {
      kinds: [1059],
      since: Math.floor(Date.now() / 1000) - 10,
      limit: 10
    });

    console.log('Gift wraps on relay after validateLocation:', events.length);
    events.forEach(e => {
      console.log('Gift wrap:', e.id, 'tags:', e.tags);
    });

    pool.close([relay]);
    service.close();

    // Cancel the response promise
    responsePromise.catch(() => {}); // Ignore timeout error
  }, 30000);
});