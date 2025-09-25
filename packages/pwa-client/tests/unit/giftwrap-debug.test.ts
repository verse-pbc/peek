import { describe, it, expect, vi } from 'vitest';
import {
  generateSecretKey,
  getPublicKey,
  finalizeEvent,
  type EventTemplate
} from 'nostr-tools';
import { NostrLocationService } from '@/services/nostr-location';
import { RelayManager } from '@/services/relay-manager';

vi.mock('@/services/relay-manager');

describe('Gift Wrap Creation Unit Test', () => {
  it('should create valid gift wrap event structure', () => {
    const secretKey = generateSecretKey();
    const _publicKey = getPublicKey(secretKey);
    const VALIDATION_SERVICE_PUBKEY = process.env.VITE_VALIDATION_SERVICE_PUBKEY ||
      '829774829a2c9884607fc59f22762de04c1ee2ac36a504228ff1a99d6519fac2';

    const giftWrapEvent: EventTemplate = {
      kind: 1059,
      content: 'Test gift wrap content',
      tags: [['p', VALIDATION_SERVICE_PUBKEY]],
      created_at: Math.floor(Date.now() / 1000)
    };

    const signedGiftWrap = finalizeEvent(giftWrapEvent, secretKey);

    // Verify gift wrap structure
    expect(signedGiftWrap.kind).toBe(1059);
    expect(signedGiftWrap.content).toBe('Test gift wrap content');
    expect(signedGiftWrap.tags).toContainEqual(['p', VALIDATION_SERVICE_PUBKEY]);
    expect(signedGiftWrap.pubkey).toBe(_publicKey);
    expect(signedGiftWrap.sig).toBeTruthy();
    expect(signedGiftWrap.id).toBeTruthy();
  });

  it('should call RelayManager methods when sending location validation', async () => {
    const secretKey = generateSecretKey();
    const publicKey = getPublicKey(secretKey);

    // Create mock RelayManager
    const mockRelayManager = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn(),
      publish: vi.fn().mockResolvedValue(undefined),
      publishGiftWrap: vi.fn().mockResolvedValue(undefined),
      subscribeToGiftWraps: vi.fn().mockReturnValue({
        unsub: vi.fn()
      }),
      getUserPubkey: vi.fn().mockReturnValue(publicKey),
      getUserSecretKey: vi.fn().mockReturnValue(secretKey),
      isConnected: vi.fn().mockReturnValue(true)
    } as unknown as RelayManager;

    const service = new NostrLocationService(secretKey, publicKey, mockRelayManager);

    // Create test location data
    const location = {
      latitude: 37.7749,
      longitude: -122.4194,
      accuracy: 10,
      timestamp: Math.floor(Date.now() / 1000)
    };

    // Start the validation (don't await - it will timeout waiting for response)
    const validationPromise = service.validateLocation('test-community-id', location);

    // Wait briefly for the publish to be called
    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify that publishGiftWrap was called with a gift wrap event
    expect(mockRelayManager.publishGiftWrap).toHaveBeenCalled();
    const publishCall = (mockRelayManager.publishGiftWrap as ReturnType<typeof vi.fn>).mock.calls[0];
    const publishedEvent = publishCall[0];

    // Verify it's a gift wrap event
    expect(publishedEvent.kind).toBe(1059);
    expect(publishedEvent.tags).toContainEqual(['p', expect.any(String)]);
    expect(publishedEvent.content).toBeTruthy();
    expect(publishedEvent.sig).toBeTruthy();

    // Clean up the promise
    validationPromise.catch(() => {}); // Ignore timeout error
  });
});