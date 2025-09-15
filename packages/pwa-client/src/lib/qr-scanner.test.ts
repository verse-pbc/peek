import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QRScanner, generateQRUrl, generateCommunityId, validateQRData, QRData } from './qr-scanner';

describe('QRScanner', () => {
  describe('parseQRData', () => {
    it('should parse valid QR URL', () => {
      const url = 'https://peek.com/c/123e4567-e89b-12d3-a456-426614174000';
      const data = QRScanner.parseQRData(url);
      
      expect(data).toBeTruthy();
      expect(data?.url).toBe(url);
      expect(data?.communityId).toBe('123e4567-e89b-12d3-a456-426614174000');
    });

    it('should parse URL with query parameters', () => {
      const url = 'https://peek.com/c/test-community-123?ref=poster';
      const data = QRScanner.parseQRData(url);
      
      expect(data).toBeTruthy();
      expect(data?.url).toBe(url);
      expect(data?.communityId).toBe('test-community-123');
    });

    it('should parse relative URL path', () => {
      const path = '/c/abc-123-def';
      const data = QRScanner.parseQRData(path);
      
      expect(data).toBeTruthy();
      expect(data?.url).toBe(path);
      expect(data?.communityId).toBe('abc-123-def');
    });

    it('should return null for invalid URL format', () => {
      const data = QRScanner.parseQRData('not a url');
      expect(data).toBeNull();
    });

    it('should return null for URL without community path', () => {
      const data = QRScanner.parseQRData('https://peek.com/about');
      expect(data).toBeNull();
    });

    it('should return null for community ID with invalid characters', () => {
      const data = QRScanner.parseQRData('https://peek.com/c/invalid@id!');
      expect(data).toBeNull();
    });

    it('should return null for community ID that is too short', () => {
      const data = QRScanner.parseQRData('https://peek.com/c/short');
      expect(data).toBeNull();
    });

    it('should return null for community ID that is too long', () => {
      const longId = 'a'.repeat(65);
      const data = QRScanner.parseQRData(`https://peek.com/c/${longId}`);
      expect(data).toBeNull();
    });
  });

  describe('generateQRUrl', () => {
    it('should generate valid QR URL', () => {
      const communityId = '123e4567-e89b-12d3-a456-426614174000';
      const url = generateQRUrl(communityId);
      
      expect(url).toContain('/c/');
      expect(url).toContain(communityId);
    });

    it('should use custom base URL', () => {
      const communityId = '123e4567-e89b-12d3-a456-426614174000';
      const baseUrl = 'https://custom.peek.com';
      const url = generateQRUrl(communityId, baseUrl);
      
      expect(url).toBe(`${baseUrl}/c/${communityId}`);
    });

    it('should throw error for invalid community ID', () => {
      expect(() => generateQRUrl('short')).toThrow('Invalid community ID format');
      expect(() => generateQRUrl('invalid@id')).toThrow('Invalid community ID format');
      expect(() => generateQRUrl('a'.repeat(65))).toThrow('Invalid community ID format');
    });
  });

  describe('generateCommunityId', () => {
    it('should generate valid UUID-like ID', () => {
      const id = generateCommunityId();
      
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    it('should generate unique IDs', () => {
      const id1 = generateCommunityId();
      const id2 = generateCommunityId();
      
      expect(id1).not.toBe(id2);
    });
  });

  describe('validateQRData', () => {
    const validData: QRData = {
      url: 'https://peek.com/c/123e4567-e89b-12d3-a456-426614174000',
      communityId: '123e4567-e89b-12d3-a456-426614174000',
    };

    it('should validate correct data', () => {
      const result = validateQRData(validData);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject missing URL', () => {
      const result = validateQRData({ ...validData, url: '' });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Missing URL');
    });

    it('should reject invalid community ID format', () => {
      const result = validateQRData({ ...validData, communityId: 'short' });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid community ID format');
    });

    it('should reject community ID with invalid characters', () => {
      const result = validateQRData({ ...validData, communityId: 'invalid@id!' });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid community ID format');
    });

    it('should reject community ID that is too long', () => {
      const result = validateQRData({ ...validData, communityId: 'a'.repeat(65) });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid community ID format');
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