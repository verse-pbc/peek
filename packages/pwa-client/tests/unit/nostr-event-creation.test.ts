import { describe, it, expect } from 'vitest';
import { generateSecretKey, getPublicKey, finalizeEvent, type EventTemplate } from 'nostr-tools';

describe('Nostr Event Creation Test', () => {
  it('should create valid signed nostr event', () => {
    const secretKey = generateSecretKey();
    const _publicKey = getPublicKey(secretKey);

    // Create a simple text note event
    const event: EventTemplate = {
      kind: 1,
      content: 'Test message from integration test',
      tags: [],
      created_at: Math.floor(Date.now() / 1000)
    };

    const signedEvent = finalizeEvent(event, secretKey);

    // Verify the event structure
    expect(signedEvent.kind).toBe(1);
    expect(signedEvent.content).toBe('Test message from integration test');
    expect(signedEvent.tags).toEqual([]);
    expect(signedEvent.pubkey).toBe(_publicKey);
    expect(signedEvent.sig).toBeTruthy();
    expect(signedEvent.id).toBeTruthy();
    expect(signedEvent.created_at).toBeCloseTo(Math.floor(Date.now() / 1000), 5);
  });
});