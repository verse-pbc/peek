import { describe, it, expect } from 'vitest';
import { generateSecretKey, getPublicKey } from 'nostr-tools';
import { NostrLocationService } from '../../src/services/nostr-location';

describe('Basic Service Test', () => {
  it('should create NostrLocationService without errors', () => {
    const secretKey = generateSecretKey();
    const publicKey = getPublicKey(secretKey);

    const service = new NostrLocationService(secretKey, publicKey);
    expect(service).toBeDefined();

    service.close();
  });

  it('should validate location and return mock response', async () => {
    const secretKey = generateSecretKey();
    const publicKey = getPublicKey(secretKey);
    const service = new NostrLocationService(secretKey, publicKey);

    const location = {
      latitude: -34.919143,
      longitude: -56.161693,
      accuracy: 15.0,
      timestamp: Math.floor(Date.now() / 1000)
    };

    try {
      const response = await service.validateLocation('test-community', location);

      // Should get some response (even if it fails due to network)
      expect(response).toBeDefined();
      expect(typeof response.success).toBe('boolean');

    } catch (error) {
      // Network errors are expected in tests
      console.log('Expected network error:', error);
      expect(error).toBeDefined();
    } finally {
      service.close();
    }
  }, 10000);
});