import { describe, it, expect, vi } from 'vitest';
import { generateSecretKey, getPublicKey } from 'nostr-tools';
import { NostrLocationService } from '../../src/services/nostr-location';
import { RelayManager } from '../../src/services/relay-manager';

vi.mock('../../src/services/relay-manager');

describe('NostrLocationService Unit Tests', () => {
  it('should create NostrLocationService without errors', () => {
    const secretKey = generateSecretKey();
    const publicKey = getPublicKey(secretKey);

    // Create mock RelayManager
    const mockRelayManager = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      publish: vi.fn(),
      publishGiftWrap: vi.fn(),
      subscribeToGiftWraps: vi.fn().mockReturnValue({ unsub: vi.fn() }),
      getUserPubkey: vi.fn().mockReturnValue(publicKey),
      getUserSecretKey: vi.fn().mockReturnValue(secretKey),
      isConnected: vi.fn().mockReturnValue(false)
    } as unknown as RelayManager;

    const service = new NostrLocationService(secretKey, publicKey, mockRelayManager);
    expect(service).toBeDefined();
  });

  it('should create and publish gift wrap event when validating location', async () => {
    const secretKey = generateSecretKey();
    const publicKey = getPublicKey(secretKey);
    const VALIDATION_SERVICE_PUBKEY = '829774829a2c9884607fc59f22762de04c1ee2ac36a504228ff1a99d6519fac2';

    // Create mock RelayManager with response simulation
    const mockRelayManager = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn(),
      publish: vi.fn().mockResolvedValue(undefined),
      publishGiftWrap: vi.fn().mockResolvedValue(undefined),
      subscribeToGiftWraps: vi.fn().mockImplementation((callback) => {
        // Simulate receiving a response after a brief delay
        if (typeof callback === 'function') {
          setTimeout(() => {
            callback({
              kind: 1059,
              content: 'encrypted_response',
              tags: [['p', publicKey]],
              pubkey: VALIDATION_SERVICE_PUBKEY,
              created_at: Math.floor(Date.now() / 1000),
              id: 'mock-response-id',
              sig: 'mock-signature'
            });
          }, 100);
        }
        return { unsub: vi.fn() };
      }),
      getUserPubkey: vi.fn().mockReturnValue(publicKey),
      getUserSecretKey: vi.fn().mockReturnValue(secretKey),
      isConnected: vi.fn().mockReturnValue(true)
    } as unknown as RelayManager;

    const service = new NostrLocationService(secretKey, publicKey, mockRelayManager);

    const location = {
      latitude: -34.919143,
      longitude: -56.161693,
      accuracy: 15.0,
      timestamp: Math.floor(Date.now() / 1000)
    };

    // Start validation (don't await yet)
    const validationPromise = service.validateLocation('test-community', location);

    // Wait briefly for the publish to be called
    await new Promise(resolve => setTimeout(resolve, 50));

    // Verify publishGiftWrap was called
    expect(mockRelayManager.publishGiftWrap).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 1059,
        tags: expect.arrayContaining([['p', expect.any(String)]]),
        content: expect.any(String),
        sig: expect.any(String)
      })
    );

    // Clean up the promise
    validationPromise.catch(() => {}); // Ignore timeout if response handling isn't implemented
  });
});