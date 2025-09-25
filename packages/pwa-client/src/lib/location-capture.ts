/**
 * Location capture utilities for Peek communities
 * Handles GPS location capture and validation for setting community locations
 */

export interface CapturedLocation {
  latitude: number;
  longitude: number;
  accuracy: number; // In meters
  timestamp: number; // Unix timestamp in milliseconds
  altitude?: number | null;
  altitudeAccuracy?: number | null;
  heading?: number | null;
  speed?: number | null;
}

export interface LocationCaptureOptions {
  enableHighAccuracy?: boolean;
  timeout?: number; // In milliseconds
  maximumAge?: number; // In milliseconds
  requiredAccuracy?: number; // Required accuracy in meters
}

export interface LocationCaptureResult {
  success: boolean;
  location?: CapturedLocation;
  error?: string;
}

export interface LocationValidation {
  isValid: boolean;
  reason?: string;
}

/**
 * Default options for location capture
 */
const DEFAULT_OPTIONS: LocationCaptureOptions = {
  enableHighAccuracy: true,
  timeout: 30000, // 30 seconds
  maximumAge: 0, // Don't use cached position
  requiredAccuracy: 20, // 20 meters
};

/**
 * LocationCapture class for managing GPS location capture
 */
export class LocationCapture {
  private options: LocationCaptureOptions;

  constructor(options: LocationCaptureOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Capture current GPS location
   */
  async captureLocation(): Promise<LocationCaptureResult> {
    if (!navigator.geolocation) {
      return {
        success: false,
        error: 'Geolocation is not supported by this browser',
      };
    }

    try {
      const position = await this.getCurrentPosition();
      const location = this.positionToLocation(position);

      // Validate accuracy if required
      if (this.options.requiredAccuracy && location.accuracy > this.options.requiredAccuracy) {
        return {
          success: false,
          error: `Location accuracy (${location.accuracy.toFixed(1)}m) exceeds required accuracy (${this.options.requiredAccuracy}m)`,
        };
      }

      return {
        success: true,
        location,
      };
    } catch (error) {
      return {
        success: false,
        error: this.getErrorMessage(error),
      };
    }
  }

  /**
   * Watch location changes
   */
  watchLocation(
    onUpdate: (result: LocationCaptureResult) => void,
    onError?: (error: string) => void
  ): number {
    if (!navigator.geolocation) {
      onError?.('Geolocation is not supported by this browser');
      return -1;
    }

    return navigator.geolocation.watchPosition(
      (position) => {
        const location = this.positionToLocation(position);
        
        // Check accuracy requirement
        if (this.options.requiredAccuracy && location.accuracy > this.options.requiredAccuracy) {
          onUpdate({
            success: false,
            error: `Location accuracy (${location.accuracy.toFixed(1)}m) exceeds required accuracy (${this.options.requiredAccuracy}m)`,
          });
        } else {
          onUpdate({
            success: true,
            location,
          });
        }
      },
      (error) => {
        const errorMessage = this.getErrorMessage(error);
        onError?.(errorMessage);
        onUpdate({
          success: false,
          error: errorMessage,
        });
      },
      {
        enableHighAccuracy: this.options.enableHighAccuracy,
        timeout: this.options.timeout,
        maximumAge: this.options.maximumAge,
      }
    );
  }

  /**
   * Stop watching location
   */
  static clearWatch(watchId: number): void {
    if (navigator.geolocation && watchId >= 0) {
      navigator.geolocation.clearWatch(watchId);
    }
  }

  /**
   * Check if location permission is granted
   */
  static async checkPermission(): Promise<PermissionState> {
    if (!navigator.permissions) {
      return 'prompt';
    }

    try {
      const result = await navigator.permissions.query({ name: 'geolocation' });
      return result.state;
    } catch {
      return 'prompt';
    }
  }

  /**
   * Validate a captured location
   */
  static validateLocation(location: CapturedLocation): LocationValidation {
    // Check if coordinates are valid
    if (!this.isValidLatitude(location.latitude)) {
      return {
        isValid: false,
        reason: 'Invalid latitude',
      };
    }

    if (!this.isValidLongitude(location.longitude)) {
      return {
        isValid: false,
        reason: 'Invalid longitude',
      };
    }

    // Check if accuracy is reasonable (not too poor)
    if (location.accuracy > 100) {
      return {
        isValid: false,
        reason: 'Location accuracy too poor (>100m)',
      };
    }

    // Check if timestamp is recent (within last minute)
    // Note: timestamp is in seconds, convert to milliseconds for comparison
    const ageMs = Date.now() - (location.timestamp * 1000);
    if (ageMs > 60000) {
      return {
        isValid: false,
        reason: 'Location data is stale (>1 minute old)',
      };
    }

    return {
      isValid: true,
    };
  }

  /**
   * Format location for display
   */
  static formatLocation(location: CapturedLocation, precision: number = 6): string {
    const lat = location.latitude.toFixed(precision);
    const lng = location.longitude.toFixed(precision);
    return `${lat}, ${lng}`;
  }

  /**
   * Calculate distance between two locations (Haversine formula)
   */
  static calculateDistance(
    location1: Pick<CapturedLocation, 'latitude' | 'longitude'>,
    location2: Pick<CapturedLocation, 'latitude' | 'longitude'>
  ): number {
    const R = 6371000; // Earth's radius in meters
    const lat1Rad = this.toRadians(location1.latitude);
    const lat2Rad = this.toRadians(location2.latitude);
    const deltaLat = this.toRadians(location2.latitude - location1.latitude);
    const deltaLng = this.toRadians(location2.longitude - location1.longitude);

    const a =
      Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
      Math.cos(lat1Rad) *
        Math.cos(lat2Rad) *
        Math.sin(deltaLng / 2) *
        Math.sin(deltaLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  /**
   * Get human-readable accuracy level
   */
  static getAccuracyLevel(accuracy: number): string {
    if (accuracy <= 5) return 'Excellent';
    if (accuracy <= 10) return 'Very Good';
    if (accuracy <= 20) return 'Good';
    if (accuracy <= 50) return 'Fair';
    if (accuracy <= 100) return 'Poor';
    return 'Very Poor';
  }

  /**
   * Private helper methods
   */
  private getCurrentPosition(): Promise<GeolocationPosition> {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        resolve,
        reject,
        {
          enableHighAccuracy: this.options.enableHighAccuracy,
          timeout: this.options.timeout,
          maximumAge: this.options.maximumAge,
        }
      );
    });
  }

  private positionToLocation(position: GeolocationPosition): CapturedLocation {
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      timestamp: Math.floor(position.timestamp / 1000), // Convert from milliseconds to seconds
      altitude: position.coords.altitude,
      altitudeAccuracy: position.coords.altitudeAccuracy,
      heading: position.coords.heading,
      speed: position.coords.speed,
    };
  }

  private getErrorMessage(error: unknown): string {
    // Check if it's a GeolocationPositionError-like object
    if (error && typeof error === 'object' && 'code' in error) {
      const geoError = error as { code: number; message?: string };
      switch (geoError.code) {
        case 1: // PERMISSION_DENIED
          return 'Location permission denied';
        case 2: // POSITION_UNAVAILABLE
          return 'Location information unavailable';
        case 3: // TIMEOUT
          return 'Location request timed out';
        default:
          return geoError.message || 'Unknown location error';
      }
    }

    if (error instanceof Error) {
      return error.message;
    }

    return 'Failed to get location';
  }

  private static isValidLatitude(lat: number): boolean {
    return lat >= -90 && lat <= 90;
  }

  private static isValidLongitude(lng: number): boolean {
    return lng >= -180 && lng <= 180;
  }

  private static toRadians(degrees: number): number {
    return (degrees * Math.PI) / 180;
  }
}

/**
 * Serialize location for storage or transmission
 */
export function serializeLocation(location: CapturedLocation): string {
  return JSON.stringify({
    lat: location.latitude,
    lng: location.longitude,
    acc: location.accuracy,
    ts: location.timestamp,
  });
}

/**
 * Deserialize location from storage or transmission
 */
export function deserializeLocation(data: string): CapturedLocation | null {
  try {
    const parsed = JSON.parse(data);
    if (
      typeof parsed.lat !== 'number' ||
      typeof parsed.lng !== 'number' ||
      typeof parsed.acc !== 'number' ||
      typeof parsed.ts !== 'number'
    ) {
      return null;
    }

    return {
      latitude: parsed.lat,
      longitude: parsed.lng,
      accuracy: parsed.acc,
      timestamp: parsed.ts,
    };
  } catch {
    return null;
  }
}

/**
 * Create a location data package for API submission
 * This is just serialization, not a security proof
 */
export function createLocationData(location: CapturedLocation, communityId: string): {
  communityId: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
} {
  return {
    communityId,
    latitude: location.latitude,
    longitude: location.longitude,
    accuracy: location.accuracy,
    timestamp: location.timestamp,
  };
}