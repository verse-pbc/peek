import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QRScanner, generateQRPayload, validateQRPayload, QRPayload } from './qr-scanner';

describe('QRScanner', () => {
  describe('parseQRPayload', () => {
    it('should parse valid QR payload', () => {
      const data = JSON.stringify({
        v: 1,
        id: '123e4567-e89b-12d3-a456-426614174000',
        relay: 'wss://peek.hol.is',
        lat: 37.7749,
        lng: -122.4194,
        name: 'Test Community',
      });

      const payload = QRScanner.parseQRPayload(data);
      
      expect(payload).toBeTruthy();
      expect(payload?.v).toBe(1);
      expect(payload?.id).toBe('123e4567-e89b-12d3-a456-426614174000');
      expect(payload?.relay).toBe('wss://peek.hol.is');
      expect(payload?.lat).toBe(37.7749);
      expect(payload?.lng).toBe(-122.4194);
      expect(payload?.name).toBe('Test Community');
    });

    it('should return null for invalid JSON', () => {
      const payload = QRScanner.parseQRPayload('not json');
      expect(payload).toBeNull();
    });

    it('should return null for missing required fields', () => {
      const data = JSON.stringify({
        v: 1,
        id: '123e4567-e89b-12d3-a456-426614174000',
        // Missing relay, lat, lng
      });

      const payload = QRScanner.parseQRPayload(data);
      expect(payload).toBeNull();
    });

    it('should return null for invalid version', () => {
      const data = JSON.stringify({
        v: 2, // Unsupported version
        id: '123e4567-e89b-12d3-a456-426614174000',
        relay: 'wss://peek.hol.is',
        lat: 37.7749,
        lng: -122.4194,
      });

      const payload = QRScanner.parseQRPayload(data);
      expect(payload).toBeNull();
    });

    it('should return null for invalid UUID', () => {
      const data = JSON.stringify({
        v: 1,
        id: 'not-a-uuid',
        relay: 'wss://peek.hol.is',
        lat: 37.7749,
        lng: -122.4194,
      });

      const payload = QRScanner.parseQRPayload(data);
      expect(payload).toBeNull();
    });

    it('should return null for invalid relay URL', () => {
      const data = JSON.stringify({
        v: 1,
        id: '123e4567-e89b-12d3-a456-426614174000',
        relay: 'https://invalid.com', // Should be wss:// or ws://
        lat: 37.7749,
        lng: -122.4194,
      });

      const payload = QRScanner.parseQRPayload(data);
      expect(payload).toBeNull();
    });

    it('should return null for invalid coordinates', () => {
      const data1 = JSON.stringify({
        v: 1,
        id: '123e4567-e89b-12d3-a456-426614174000',
        relay: 'wss://peek.hol.is',
        lat: 91, // Invalid latitude
        lng: -122.4194,
      });

      const data2 = JSON.stringify({
        v: 1,
        id: '123e4567-e89b-12d3-a456-426614174000',
        relay: 'wss://peek.hol.is',
        lat: 37.7749,
        lng: 181, // Invalid longitude
      });

      expect(QRScanner.parseQRPayload(data1)).toBeNull();
      expect(QRScanner.parseQRPayload(data2)).toBeNull();
    });
  });

  describe('generateQRPayload', () => {
    it('should generate valid QR payload JSON', () => {
      const id = '123e4567-e89b-12d3-a456-426614174000';
      const lat = 37.7749;
      const lng = -122.4194;
      
      const json = generateQRPayload(id, lat, lng);
      const payload = JSON.parse(json);

      expect(payload.v).toBe(1);
      expect(payload.id).toBe(id);
      expect(payload.relay).toBe('wss://peek.hol.is');
      expect(payload.lat).toBe(lat);
      expect(payload.lng).toBe(lng);
    });

    it('should include optional name', () => {
      const json = generateQRPayload(
        '123e4567-e89b-12d3-a456-426614174000',
        37.7749,
        -122.4194,
        'wss://peek.hol.is',
        'Test Community'
      );
      
      const payload = JSON.parse(json);
      expect(payload.name).toBe('Test Community');
    });

    it('should use custom relay URL', () => {
      const json = generateQRPayload(
        '123e4567-e89b-12d3-a456-426614174000',
        37.7749,
        -122.4194,
        'wss://custom.relay'
      );
      
      const payload = JSON.parse(json);
      expect(payload.relay).toBe('wss://custom.relay');
    });
  });

  describe('validateQRPayload', () => {
    const validPayload: QRPayload = {
      v: 1,
      id: '123e4567-e89b-12d3-a456-426614174000',
      relay: 'wss://peek.hol.is',
      lat: 37.7749,
      lng: -122.4194,
    };

    it('should validate correct payload', () => {
      const result = validateQRPayload(validPayload);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject invalid version', () => {
      const result = validateQRPayload({ ...validPayload, v: 2 });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Unsupported QR version');
    });

    it('should reject invalid UUID', () => {
      const result = validateQRPayload({ ...validPayload, id: 'not-a-uuid' });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid community ID format');
    });

    it('should reject invalid relay URL', () => {
      const result = validateQRPayload({ ...validPayload, relay: 'https://invalid' });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid relay URL');
    });

    it('should reject invalid latitude', () => {
      const result = validateQRPayload({ ...validPayload, lat: 91 });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid latitude');
    });

    it('should reject invalid longitude', () => {
      const result = validateQRPayload({ ...validPayload, lng: 181 });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid longitude');
    });
  });

  describe('Camera methods', () => {
    beforeEach(() => {
      // Mock navigator.mediaDevices
      Object.defineProperty(navigator, 'mediaDevices', {
        value: {
          getUserMedia: vi.fn(),
          enumerateDevices: vi.fn(),
        },
        writable: true,
      });
    });

    describe('isCameraAvailable', () => {
      it('should return true when camera is available', async () => {
        vi.mocked(navigator.mediaDevices.enumerateDevices).mockResolvedValue([
          { kind: 'videoinput', deviceId: 'camera1', label: 'Camera', groupId: '1', toJSON: () => ({}) },
        ] as MediaDeviceInfo[]);

        const available = await QRScanner.isCameraAvailable();
        expect(available).toBe(true);
      });

      it('should return false when no camera is available', async () => {
        vi.mocked(navigator.mediaDevices.enumerateDevices).mockResolvedValue([]);

        const available = await QRScanner.isCameraAvailable();
        expect(available).toBe(false);
      });

      it('should return false on error', async () => {
        vi.mocked(navigator.mediaDevices.enumerateDevices).mockRejectedValue(new Error());

        const available = await QRScanner.isCameraAvailable();
        expect(available).toBe(false);
      });
    });

    describe('requestCameraPermission', () => {
      it('should return true when permission granted', async () => {
        const mockStream = {
          getTracks: () => [{ stop: vi.fn() }],
        } as unknown as MediaStream;

        vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue(mockStream);

        const granted = await QRScanner.requestCameraPermission();
        expect(granted).toBe(true);
      });

      it('should return false when permission denied', async () => {
        vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValue(
          new Error('Permission denied')
        );

        const granted = await QRScanner.requestCameraPermission();
        expect(granted).toBe(false);
      });
    });
  });
});