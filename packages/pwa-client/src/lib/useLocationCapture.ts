import { useState, useCallback, useEffect, useRef } from 'react';
import {
  LocationCapture,
  CapturedLocation,
  LocationCaptureOptions,
  LocationCaptureResult,
} from './location-capture';

export interface UseLocationCaptureOptions extends LocationCaptureOptions {
  autoCapture?: boolean;
  watchMode?: boolean;
  onLocationUpdate?: (location: CapturedLocation) => void;
  onError?: (error: string) => void;
}

export interface UseLocationCaptureReturn {
  location: CapturedLocation | null;
  isCapturing: boolean;
  error: string | null;
  accuracy: number | null;
  accuracyLevel: string | null;
  permission: PermissionState;
  captureLocation: () => Promise<void>;
  startWatching: () => void;
  stopWatching: () => void;
  isWatching: boolean;
  requestPermission: () => Promise<void>;
  clearLocation: () => void;
  formatLocation: (precision?: number) => string;
}

/**
 * React hook for capturing GPS location
 */
export function useLocationCapture(
  options: UseLocationCaptureOptions = {}
): UseLocationCaptureReturn {
  const [location, setLocation] = useState<CapturedLocation | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permission, setPermission] = useState<PermissionState>('prompt');
  const [isWatching, setIsWatching] = useState(false);

  const captureRef = useRef<LocationCapture | null>(null);
  const watchIdRef = useRef<number | null>(null);

  // Initialize LocationCapture instance
  useEffect(() => {
    captureRef.current = new LocationCapture({
      enableHighAccuracy: options.enableHighAccuracy,
      timeout: options.timeout,
      maximumAge: options.maximumAge,
      requiredAccuracy: options.requiredAccuracy,
    });

    // Check initial permission state
    LocationCapture.checkPermission().then(setPermission);

    // Auto-capture if enabled
    if (options.autoCapture) {
      captureLocation();
    }

    // Start watching if enabled
    if (options.watchMode) {
      startWatching();
    }

    // Cleanup on unmount
    return () => {
      if (watchIdRef.current !== null) {
        LocationCapture.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  // Update permission state when it changes
  useEffect(() => {
    const checkPermissionInterval = setInterval(() => {
      LocationCapture.checkPermission().then(setPermission);
    }, 1000);

    return () => clearInterval(checkPermissionInterval);
  }, []);

  // Capture location
  const captureLocation = useCallback(async () => {
    if (!captureRef.current) {
      setError('Location capture not initialized');
      return;
    }

    setIsCapturing(true);
    setError(null);

    try {
      const result = await captureRef.current.captureLocation();
      
      if (result.success && result.location) {
        setLocation(result.location);
        setError(null);
        options.onLocationUpdate?.(result.location);
      } else {
        setError(result.error || 'Failed to capture location');
        options.onError?.(result.error || 'Failed to capture location');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      options.onError?.(errorMessage);
    } finally {
      setIsCapturing(false);
    }
  }, [options]);

  // Start watching location
  const startWatching = useCallback(() => {
    if (!captureRef.current || isWatching) {
      return;
    }

    const watchId = captureRef.current.watchLocation(
      (result: LocationCaptureResult) => {
        if (result.success && result.location) {
          setLocation(result.location);
          setError(null);
          options.onLocationUpdate?.(result.location);
        } else {
          setError(result.error || 'Location update failed');
        }
      },
      (error: string) => {
        setError(error);
        options.onError?.(error);
      }
    );

    if (watchId >= 0) {
      watchIdRef.current = watchId;
      setIsWatching(true);
    }
  }, [isWatching, options]);

  // Stop watching location
  const stopWatching = useCallback(() => {
    if (watchIdRef.current !== null) {
      LocationCapture.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
      setIsWatching(false);
    }
  }, []);

  // Request location permission
  const requestPermission = useCallback(async () => {
    try {
      // Trigger permission prompt by attempting to get location
      const result = await captureRef.current?.captureLocation();
      
      if (result?.success && result.location) {
        setLocation(result.location);
        setPermission('granted');
      } else if (result?.error?.includes('denied')) {
        setPermission('denied');
      }
      
      // Re-check permission state
      const state = await LocationCapture.checkPermission();
      setPermission(state);
    } catch {
      setPermission('denied');
    }
  }, []);

  // Clear location data
  const clearLocation = useCallback(() => {
    setLocation(null);
    setError(null);
  }, []);

  // Format location for display
  const formatLocation = useCallback(
    (precision?: number) => {
      if (!location) return '';
      return LocationCapture.formatLocation(location, precision);
    },
    [location]
  );

  // Calculate derived values
  const accuracy = location?.accuracy ?? null;
  const accuracyLevel = accuracy !== null ? LocationCapture.getAccuracyLevel(accuracy) : null;

  return {
    location,
    isCapturing,
    error,
    accuracy,
    accuracyLevel,
    permission,
    captureLocation,
    startWatching,
    stopWatching,
    isWatching,
    requestPermission,
    clearLocation,
    formatLocation,
  };
}

/**
 * Hook for validating location against a target
 */
export function useLocationValidation(
  targetLocation: Pick<CapturedLocation, 'latitude' | 'longitude'> | null,
  maxDistance: number = 25 // meters
) {
  const [isWithinRange, setIsWithinRange] = useState<boolean | null>(null);
  const [distance, setDistance] = useState<number | null>(null);

  const validateLocation = useCallback(
    (currentLocation: CapturedLocation) => {
      if (!targetLocation) {
        setIsWithinRange(null);
        setDistance(null);
        return null;
      }

      const dist = LocationCapture.calculateDistance(currentLocation, targetLocation);
      setDistance(dist);
      setIsWithinRange(dist <= maxDistance);
      
      return {
        isWithinRange: dist <= maxDistance,
        distance: dist,
      };
    },
    [targetLocation, maxDistance]
  );

  return {
    isWithinRange,
    distance,
    validateLocation,
  };
}

/**
 * Hook for managing community location setting (for first scanner)
 */
export function useCommunityLocationSetter(communityId: string) {
  const [communityLocation, setCommunityLocation] = useState<CapturedLocation | null>(null);
  const [isSettingLocation, setIsSettingLocation] = useState(false);

  const { location, captureLocation, error, isCapturing } = useLocationCapture({
    enableHighAccuracy: true,
    requiredAccuracy: 20,
  });

  const setLocationForCommunity = useCallback(async () => {
    if (!location) {
      await captureLocation();
      return;
    }

    setIsSettingLocation(true);

    try {
      // Validate location
      const validation = LocationCapture.validateLocation(location);
      if (!validation.isValid) {
        throw new Error(validation.reason);
      }

      setCommunityLocation(location);

      // Return location data ready for API submission
      return {
        success: true,
        location,
        data: {
          communityId,
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy: location.accuracy,
          timestamp: location.timestamp,
        },
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to set location',
      };
    } finally {
      setIsSettingLocation(false);
    }
  }, [location, captureLocation, communityId]);

  return {
    communityLocation,
    currentLocation: location,
    setLocationForCommunity,
    isSettingLocation: isSettingLocation || isCapturing,
    error,
  };
}