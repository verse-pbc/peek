import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  LocationCapture,
  CapturedLocation,
  serializeLocation,
  deserializeLocation,
  createLocationData,
} from './location-capture';

describe('LocationCapture', () => {
  let mockGeolocation: {
    getCurrentPosition: ReturnType<typeof vi.fn>;
    watchPosition: ReturnType<typeof vi.fn>;
    clearWatch: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    // Mock geolocation API
    mockGeolocation = {
      getCurrentPosition: vi.fn(),
      watchPosition: vi.fn(),
      clearWatch: vi.fn(),
    };

    // Add geolocation to navigator
    Object.defineProperty(global.navigator, 'geolocation', {
      value: mockGeolocation,
      writable: true,
    });

    // Mock permissions API
    Object.defineProperty(global.navigator, 'permissions', {
      value: {
        query: vi.fn().mockResolvedValue({ state: 'granted' }),
      },
      writable: true,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('captureLocation', () => {
    it('should capture location successfully', async () => {
      const mockPosition: GeolocationPosition = {
        coords: {
          latitude: 37.7749,
          longitude: -122.4194,
          accuracy: 10,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
          toJSON: () => ({}),
        },
        timestamp: Math.floor(Date.now() / 1000),
        toJSON: () => ({}),
      };

      mockGeolocation.getCurrentPosition.mockImplementation((success: PositionCallback) => {
        success(mockPosition);
      });

      const capture = new LocationCapture();
      const result = await capture.captureLocation();

      expect(result.success).toBe(true);
      expect(result.location).toBeDefined();
      expect(result.location?.latitude).toBe(37.7749);
      expect(result.location?.longitude).toBe(-122.4194);
      expect(result.location?.accuracy).toBe(10);
    });

    it('should fail when accuracy exceeds requirement', async () => {
      const mockPosition: GeolocationPosition = {
        coords: {
          latitude: 37.7749,
          longitude: -122.4194,
          accuracy: 30, // Poor accuracy
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
          toJSON: () => ({}),
        },
        timestamp: Math.floor(Date.now() / 1000),
        toJSON: () => ({}),
      };

      mockGeolocation.getCurrentPosition.mockImplementation((success: PositionCallback) => {
        success(mockPosition);
      });

      const capture = new LocationCapture({ requiredAccuracy: 20 });
      const result = await capture.captureLocation();

      expect(result.success).toBe(false);
      expect(result.error).toContain('exceeds required accuracy');
    });

    it('should handle permission denied error', async () => {
      const mockError: GeolocationPositionError = {
        code: 1, // PERMISSION_DENIED
        message: 'User denied Geolocation',
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      };

      mockGeolocation.getCurrentPosition.mockImplementation((_: PositionCallback, error: PositionErrorCallback) => {
        error(mockError);
      });

      const capture = new LocationCapture();
      const result = await capture.captureLocation();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Location permission denied');
    });

    it('should handle timeout error', async () => {
      const mockError: GeolocationPositionError = {
        code: 3, // TIMEOUT
        message: 'Timeout expired',
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      };

      mockGeolocation.getCurrentPosition.mockImplementation((_: PositionCallback, error: PositionErrorCallback) => {
        error(mockError);
      });

      const capture = new LocationCapture();
      const result = await capture.captureLocation();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Location request timed out. GPS might need a moment to initialize. Please try again.');
    });
  });

  describe('watchLocation', () => {
    it('should watch location changes', () => {
      const mockPosition: GeolocationPosition = {
        coords: {
          latitude: 37.7749,
          longitude: -122.4194,
          accuracy: 15,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
          toJSON: () => ({}),
        },
        timestamp: Math.floor(Date.now() / 1000),
        toJSON: () => ({}),
      };

      mockGeolocation.watchPosition.mockReturnValue(123); // Watch ID

      const capture = new LocationCapture();
      const onUpdate = vi.fn();
      const onError = vi.fn();

      const watchId = capture.watchLocation(onUpdate, onError);

      expect(watchId).toBe(123);
      expect(mockGeolocation.watchPosition).toHaveBeenCalled();

      // Simulate position update
      const successCallback = mockGeolocation.watchPosition.mock.calls[0][0];
      successCallback(mockPosition);

      expect(onUpdate).toHaveBeenCalledWith({
        success: true,
        location: expect.objectContaining({
          latitude: 37.7749,
          longitude: -122.4194,
          accuracy: 15,
        }),
      });
    });

    it('should handle watch errors', () => {
      const mockError: GeolocationPositionError = {
        code: 1,
        message: 'Permission denied',
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      };

      mockGeolocation.watchPosition.mockReturnValue(456);

      const capture = new LocationCapture();
      const onUpdate = vi.fn();
      const onError = vi.fn();

      capture.watchLocation(onUpdate, onError);

      // Simulate error
      const errorCallback = mockGeolocation.watchPosition.mock.calls[0][1];
      errorCallback(mockError);

      expect(onError).toHaveBeenCalledWith('Location permission denied');
      expect(onUpdate).toHaveBeenCalledWith({
        success: false,
        error: 'Location permission denied',
      });
    });
  });

  describe('Static methods', () => {
    describe('validateLocation', () => {
      it('should validate correct location', () => {
        const location: CapturedLocation = {
          latitude: 37.7749,
          longitude: -122.4194,
          accuracy: 15,
          timestamp: Math.floor(Date.now() / 1000),
        };

        const result = LocationCapture.validateLocation(location);
        expect(result.isValid).toBe(true);
      });

      it('should reject invalid latitude', () => {
        const location: CapturedLocation = {
          latitude: 91, // Invalid
          longitude: -122.4194,
          accuracy: 15,
          timestamp: Math.floor(Date.now() / 1000),
        };

        const result = LocationCapture.validateLocation(location);
        expect(result.isValid).toBe(false);
        expect(result.reason).toBe('Invalid latitude');
      });

      it('should reject invalid longitude', () => {
        const location: CapturedLocation = {
          latitude: 37.7749,
          longitude: 181, // Invalid
          accuracy: 15,
          timestamp: Math.floor(Date.now() / 1000),
        };

        const result = LocationCapture.validateLocation(location);
        expect(result.isValid).toBe(false);
        expect(result.reason).toBe('Invalid longitude');
      });

      it('should reject poor accuracy', () => {
        const location: CapturedLocation = {
          latitude: 37.7749,
          longitude: -122.4194,
          accuracy: 150, // Too poor
          timestamp: Math.floor(Date.now() / 1000),
        };

        const result = LocationCapture.validateLocation(location);
        expect(result.isValid).toBe(false);
        expect(result.reason).toBe('Location accuracy too poor (>100m)');
      });

      it('should reject stale timestamp', () => {
        const location: CapturedLocation = {
          latitude: 37.7749,
          longitude: -122.4194,
          accuracy: 15,
          timestamp: Math.floor(Date.now() / 1000) - 120, // 2 minutes old
        };

        const result = LocationCapture.validateLocation(location);
        expect(result.isValid).toBe(false);
        expect(result.reason).toBe('Location data is stale (>1 minute old)');
      });
    });

    describe('formatLocation', () => {
      it('should format location with default precision', () => {
        const location: CapturedLocation = {
          latitude: 37.7749294,
          longitude: -122.4194155,
          accuracy: 10,
          timestamp: Math.floor(Date.now() / 1000),
        };

        const formatted = LocationCapture.formatLocation(location);
        expect(formatted).toBe('37.774929, -122.419415');
      });

      it('should format location with custom precision', () => {
        const location: CapturedLocation = {
          latitude: 37.7749294,
          longitude: -122.4194155,
          accuracy: 10,
          timestamp: Math.floor(Date.now() / 1000),
        };

        const formatted = LocationCapture.formatLocation(location, 3);
        expect(formatted).toBe('37.775, -122.419');
      });
    });

    describe('calculateDistance', () => {
      it('should calculate distance between two points', () => {
        const location1 = {
          latitude: 37.7749,
          longitude: -122.4194,
        };

        const location2 = {
          latitude: 37.7751,
          longitude: -122.4196,
        };

        const distance = LocationCapture.calculateDistance(location1, location2);
        
        // Should be approximately 28 meters
        expect(distance).toBeGreaterThan(27);
        expect(distance).toBeLessThan(30);
      });

      it('should return 0 for same location', () => {
        const location = {
          latitude: 37.7749,
          longitude: -122.4194,
        };

        const distance = LocationCapture.calculateDistance(location, location);
        expect(distance).toBe(0);
      });
    });

    describe('getAccuracyLevel', () => {
      it('should return correct accuracy levels', () => {
        expect(LocationCapture.getAccuracyLevel(3)).toBe('Excellent');
        expect(LocationCapture.getAccuracyLevel(8)).toBe('Very Good');
        expect(LocationCapture.getAccuracyLevel(15)).toBe('Good');
        expect(LocationCapture.getAccuracyLevel(30)).toBe('Fair');
        expect(LocationCapture.getAccuracyLevel(80)).toBe('Poor');
        expect(LocationCapture.getAccuracyLevel(150)).toBe('Very Poor');
      });
    });

    describe('checkPermission', () => {
      it('should check permission state', async () => {
        const state = await LocationCapture.checkPermission();
        expect(state).toBe('granted');
        expect(navigator.permissions.query).toHaveBeenCalledWith({ name: 'geolocation' });
      });

      it('should return prompt when permissions API not available', async () => {
        Object.defineProperty(global.navigator, 'permissions', {
          value: undefined,
          writable: true,
        });

        const state = await LocationCapture.checkPermission();
        expect(state).toBe('prompt');
      });
    });

    describe('clearWatch', () => {
      it('should clear watch by ID', () => {
        LocationCapture.clearWatch(123);
        expect(mockGeolocation.clearWatch).toHaveBeenCalledWith(123);
      });

      it('should handle negative watch ID', () => {
        LocationCapture.clearWatch(-1);
        expect(mockGeolocation.clearWatch).not.toHaveBeenCalled();
      });
    });
  });

  describe('Utility functions', () => {
    describe('serializeLocation', () => {
      it('should serialize location to JSON', () => {
        const location: CapturedLocation = {
          latitude: 37.7749,
          longitude: -122.4194,
          accuracy: 15,
          timestamp: 1234567890,
        };

        const serialized = serializeLocation(location);
        const parsed = JSON.parse(serialized);

        expect(parsed.lat).toBe(37.7749);
        expect(parsed.lng).toBe(-122.4194);
        expect(parsed.acc).toBe(15);
        expect(parsed.ts).toBe(1234567890);
      });
    });

    describe('deserializeLocation', () => {
      it('should deserialize valid JSON', () => {
        const json = JSON.stringify({
          lat: 37.7749,
          lng: -122.4194,
          acc: 15,
          ts: 1234567890,
        });

        const location = deserializeLocation(json);

        expect(location).toBeDefined();
        expect(location?.latitude).toBe(37.7749);
        expect(location?.longitude).toBe(-122.4194);
        expect(location?.accuracy).toBe(15);
        expect(location?.timestamp).toBe(1234567890);
      });

      it('should return null for invalid JSON', () => {
        expect(deserializeLocation('not json')).toBeNull();
      });

      it('should return null for missing fields', () => {
        const json = JSON.stringify({ lat: 37.7749 });
        expect(deserializeLocation(json)).toBeNull();
      });
    });

    describe('createLocationData', () => {
      it('should create location data package for API', () => {
        const location: CapturedLocation = {
          latitude: 37.7749,
          longitude: -122.4194,
          accuracy: 15,
          timestamp: 1234567890,
        };

        const data = createLocationData(location, 'test-community-123');
        
        expect(data.communityId).toBe('test-community-123');
        expect(data.latitude).toBe(37.7749);
        expect(data.longitude).toBe(-122.4194);
        expect(data.accuracy).toBe(15);
        expect(data.timestamp).toBe(1234567890);
      });
    });
  });
});