import React, { useEffect, useState, useCallback } from 'react';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { 
  MapPin, 
  AlertCircle, 
  CheckCircle, 
  Loader2, 
  Navigation,
  XCircle,
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

  // Determine accuracy status
  const getAccuracyStatus = (accuracy: number) => {
    if (accuracy <= maxAccuracy) return 'excellent';
    if (accuracy <= maxAccuracy * 1.5) return 'good';
    if (accuracy <= maxAccuracy * 2) return 'fair';
    return 'poor';
  };

  const getAccuracyColor = (status: string) => {
    switch (status) {
      case 'excellent': return 'text-green-600';
      case 'good': return 'text-blue-600';
      case 'fair': return 'text-yellow-600';
      case 'poor': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getAccuracyBadgeVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case 'excellent': return 'default';
      case 'good': return 'secondary';
      case 'fair': return 'outline';
      case 'poor': return 'destructive';
      default: return 'outline';
    }
  };

  const currentAccuracy = location?.accuracy || 0;
  const accuracyStatus = location ? getAccuracyStatus(currentAccuracy) : '';
  const accuracyPercentage = location 
    ? Math.max(0, Math.min(100, (1 - (currentAccuracy - maxAccuracy) / (maxAccuracy * 2)) * 100))
    : 0;

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Navigation className="h-5 w-5" />
          Location Verification
        </CardTitle>
        <CardDescription>
          We need to verify you're at the physical location to join this community
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Permission Status */}
        {permissionStatus === 'denied' && (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertTitle>Location Permission Denied</AlertTitle>
            <AlertDescription>
              You need to enable location permissions in your browser settings to join this community.
              Please check your browser's address bar or settings.
            </AlertDescription>
          </Alert>
        )}

        {/* Error Alert */}
        {error && permissionStatus !== 'denied' && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Location Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Loading State */}
        {isCapturing && !location && (
          <div className="flex flex-col items-center justify-center py-8 space-y-4">
            <div className="relative">
              <MapPin className="h-12 w-12 text-gray-400" />
              <Loader2 className="h-12 w-12 absolute inset-0 animate-spin text-primary" />
            </div>
            <p className="text-sm text-gray-600">Capturing your location...</p>
            <p className="text-xs text-gray-500">This may take a few seconds</p>
          </div>
        )}

        {/* Location Details */}
        {location && (
          <div className="space-y-4">
            <Alert className="border-green-200 bg-green-50">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertTitle className="text-green-800">Location Captured</AlertTitle>
              <AlertDescription className="text-green-700">
                Your location has been successfully detected
              </AlertDescription>
            </Alert>

            {/* GPS Accuracy Indicator */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">GPS Accuracy</span>
                <Badge variant={getAccuracyBadgeVariant(accuracyStatus)}>
                  {accuracyStatus.charAt(0).toUpperCase() + accuracyStatus.slice(1)}
                </Badge>
              </div>
              
              <Progress value={accuracyPercentage} className="h-2" />
              
              <div className="flex items-center justify-between text-sm">
                <span className={getAccuracyColor(accuracyStatus)}>
                  {currentAccuracy.toFixed(1)}m accuracy
                </span>
                <span className="text-gray-500">
                  Required: ≤{maxAccuracy}m
                </span>
              </div>
            </div>

            {/* Location Info */}
            <div className="grid grid-cols-2 gap-4 pt-2">
              <div className="space-y-1">
                <p className="text-xs text-gray-500">Latitude</p>
                <p className="font-mono text-sm">{location.latitude?.toFixed(6)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-gray-500">Longitude</p>
                <p className="font-mono text-sm">{location.longitude?.toFixed(6)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-gray-500">Altitude</p>
                <p className="font-mono text-sm">
                  {location.altitude ? `${location.altitude.toFixed(1)}m` : 'N/A'}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-gray-500">Timestamp</p>
                <p className="font-mono text-sm">
                  {location?.timestamp ? new Date(location.timestamp).toLocaleTimeString() : 'N/A'}
                </p>
              </div>
            </div>

            {/* Warning for poor accuracy */}
            {accuracyStatus === 'poor' && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Your GPS accuracy is too low. Try moving to an open area with clear sky view,
                  or wait a moment for better GPS signal.
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2 pt-2">
          {!hasStarted || permissionStatus === 'denied' ? (
            <Button 
              onClick={handleRequestLocation}
              className="flex-1"
              disabled={isCapturing}
            >
              {isCapturing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Requesting Location...
                </>
              ) : (
                <>
                  <MapPin className="mr-2 h-4 w-4" />
                  Allow Location Access
                </>
              )}
            </Button>
          ) : (
            <>
              {location && (
                <Button 
                  onClick={handleRetry}
                  variant="outline"
                  className="flex-1"
                  disabled={isCapturing}
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  {isCapturing ? 'Capturing...' : 'Recapture Location'}
                </Button>
              )}
            </>
          )}
        </div>

        {/* Instructions */}
        {!location && !error && (
          <Alert>
            <AlertDescription>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>Make sure you're at the physical location of the QR code</li>
                <li>Enable GPS/Location services on your device</li>
                <li>For best accuracy, step outside or near a window</li>
                <li>Grant location permission when prompted</li>
              </ul>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
};