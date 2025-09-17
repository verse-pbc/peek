import { describe, it, expect } from 'vitest';
import { SimplePool, generateSecretKey, getPublicKey, finalizeEvent, type EventTemplate } from 'nostr-tools';

describe('WebSocket Connectivity Test', () => {
  it('should connect to relay and send event', async () => {
    const pool = new SimplePool();
    const relay = 'ws://localhost:8090';
    const secretKey = generateSecretKey();
    const publicKey = getPublicKey(secretKey);

    // Create a simple text note event
    const event: EventTemplate = {
      kind: 1,
      content: 'Test message from integration test',
      tags: [],
      created_at: Math.floor(Date.now() / 1000)
    };

    const signedEvent = finalizeEvent(event, secretKey);
    console.log('Sending event:', signedEvent.id);

    // Try to publish the event
    try {
      await pool.publish([relay], signedEvent);
      console.log('Event published successfully');
    } catch (error) {
      console.error('Failed to publish:', error);
      throw error;
    }

    // Try to fetch it back
    const events = await pool.querySync([relay], {
      ids: [signedEvent.id],
      limit: 1
    });

    console.log('Retrieved events:', events.length);
    expect(events.length).toBe(1);
    expect(events[0].id).toBe(signedEvent.id);

    pool.close([relay]);
  });
});