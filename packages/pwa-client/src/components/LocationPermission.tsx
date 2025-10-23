import React, { useEffect, useState, useCallback } from 'react';
import { Alert, AlertDescription } from './ui/alert';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import {
  MapPin,
  AlertCircle,
  CheckCircle,
  Loader2,
  Navigation,
  RefreshCw
} from 'lucide-react';
import { useLocationCapture } from '../lib/useLocationCapture';

interface LocationPermissionProps {
  onLocationCaptured?: (location: {
    latitude: number;
    longitude: number;
    accuracy: number;
    timestamp: number;
  }) => void;
  onPermissionDenied?: () => void;
  maxAccuracy?: number; // Maximum acceptable accuracy in meters (default: 20)
  autoStart?: boolean; // Automatically request location on mount
}

export const LocationPermission: React.FC<LocationPermissionProps> = ({
  onLocationCaptured,
  onPermissionDenied,
  maxAccuracy = 20,
  autoStart = false
}) => {
  const [hasStarted, setHasStarted] = useState(false);

  const {
    location,
    error,
    isCapturing,
    permission: permissionStatus,
    captureLocation,
    startWatching: _startWatching,
    stopWatching: _stopWatching,
    isWatching: _isWatching
  } = useLocationCapture({
    enableHighAccuracy: true,
    timeout: 30000,
    maximumAge: 0
  });

  const handleRequestLocation = useCallback(async () => {
    setHasStarted(true);
    await captureLocation();
  }, [captureLocation]);

  const handleRetry = async () => {
    await captureLocation();
  };

  // Auto-start if requested
  useEffect(() => {
    if (autoStart && !hasStarted) {
      setHasStarted(true);
      handleRequestLocation();
    }
  }, [autoStart, hasStarted, handleRequestLocation]);

  // Handle location capture - only call once when location is first captured
  useEffect(() => {
    if (location && onLocationCaptured) {
      onLocationCaptured({
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.accuracy,
        timestamp: location.timestamp
      });
    }
  }, [location, onLocationCaptured]); // Only trigger when timestamp changes (new capture)

  // Handle permission denial
  useEffect(() => {
    if (permissionStatus === 'denied' && onPermissionDenied) {
      onPermissionDenied();
    }
  }, [permissionStatus, onPermissionDenied]);

  // Determine if accuracy is acceptable
  const isAccuracyGood = location ? location.accuracy <= maxAccuracy : false;

  return (
    <Card className="w-full max-w-2xl mx-auto border-0 shadow-lg bg-card">
      <CardContent className="pt-6 space-y-6">
        {/* Permission Denied State */}
        {permissionStatus === 'denied' && (
          <Alert className="border-coral/20 bg-coral/5 dark:bg-coral/10 dark:border-coral/30">
            <AlertCircle className="h-4 w-4 text-coral" />
            <AlertDescription className="dark:text-foreground">
              <strong>Location access blocked</strong><br />
              Please enable location permissions in your browser settings to continue.
            </AlertDescription>
          </Alert>
        )}

        {/* Error State */}
        {error && permissionStatus !== 'denied' && (
          <div className="space-y-4">
            <Alert className="border-peach/30 bg-peach/10 dark:bg-peach/20 dark:border-peach/40">
              <AlertCircle className="h-4 w-4 text-coral" />
              <AlertDescription className="dark:text-foreground">
                <strong>Can't find your location</strong><br />
                {error}
              </AlertDescription>
            </Alert>

            <div className="bg-mint/10 border border-mint/20 rounded-xl p-4 dark:bg-mint/20 dark:border-mint/30">
              <h3 className="font-rubik font-semibold text-sm mb-2 dark:text-foreground">Tips to improve GPS signal:</h3>
              <ul className="space-y-1.5 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-mint mt-0.5">•</span>
                  <span>Move near a window or step outside</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-mint mt-0.5">•</span>
                  <span>Wait a moment for GPS to initialize</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-mint mt-0.5">•</span>
                  <span>Enable Wi-Fi for better location accuracy</span>
                </li>
              </ul>
            </div>

            <Button
              onClick={handleRetry}
              className="w-full bg-coral hover:bg-coral/90 text-white font-semibold rounded-full"
              size="lg"
              disabled={isCapturing}
            >
              {isCapturing ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Finding your location...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-5 w-5" />
                  Try Again
                </>
              )}
            </Button>
          </div>
        )}

        {/* Loading State */}
        {isCapturing && !location && !error && (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <div className="relative">
              <div className="w-20 h-20 bg-coral/10 rounded-full flex items-center justify-center">
                <Navigation className="h-10 w-10 text-coral" />
              </div>
              <Loader2 className="h-20 w-20 absolute inset-0 animate-spin text-coral" />
            </div>
            <p className="text-lg font-rubik font-semibold">Finding your location...</p>
            <p className="text-sm text-muted-foreground">This usually takes just a few seconds</p>
          </div>
        )}

        {/* Success State */}
        {location && !error && (
          <div className="space-y-4">
            <Alert className="border-mint/30 bg-mint/10 dark:bg-mint/20 dark:border-mint/40">
              <CheckCircle className="h-4 w-4 text-mint" />
              <AlertDescription className="dark:text-foreground">
                <strong>Location captured!</strong><br />
                GPS accuracy: {location.accuracy.toFixed(1)}m
                {isAccuracyGood ? ' ✓ Great signal' : ' - Trying to improve...'}
              </AlertDescription>
            </Alert>

            {/* Show retry button if accuracy isn't great */}
            {!isAccuracyGood && (
              <Button
                onClick={handleRetry}
                variant="outline"
                className="w-full border-coral/30 hover:bg-coral/5 rounded-full"
                disabled={isCapturing}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                {isCapturing ? 'Capturing...' : 'Try for Better Accuracy'}
              </Button>
            )}
          </div>
        )}

        {/* Initial Instructions */}
        {!hasStarted && !error && (
          <div className="space-y-4">
            <div className="text-center py-8">
              <div className="w-20 h-20 bg-coral/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <MapPin className="h-10 w-10 text-coral" />
              </div>
              <h3 className="font-rubik font-bold text-xl mb-2">Verify Your Location</h3>
              <p className="text-muted-foreground">
                We need to confirm you're physically at this location to join the community.
              </p>
            </div>

            <Alert className="bg-cream/50 border-0 dark:bg-muted">
              <AlertDescription className="dark:text-foreground">
                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 mt-0.5 text-mint flex-shrink-0" />
                    <span>Make sure you're at the QR code location</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 mt-0.5 text-mint flex-shrink-0" />
                    <span>Enable location services on your device</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 mt-0.5 text-mint flex-shrink-0" />
                    <span>For best results, stand near a window or outside</span>
                  </li>
                </ul>
              </AlertDescription>
            </Alert>

            <Button
              onClick={handleRequestLocation}
              className="w-full bg-coral hover:bg-coral/90 text-white font-semibold py-6 text-lg rounded-full"
              size="lg"
              disabled={isCapturing}
            >
              <Navigation className="mr-2 h-5 w-5" />
              Allow Location Access
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};