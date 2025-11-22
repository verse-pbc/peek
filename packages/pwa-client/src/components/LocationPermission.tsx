import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  const [hasStarted, setHasStarted] = useState(false);
  const [permissionRequestTime, setPermissionRequestTime] = useState<number | null>(null);
  const [isWaitingForPermission, setIsWaitingForPermission] = useState(false);
  
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
    setPermissionRequestTime(Date.now());
    setIsWaitingForPermission(true);
    await captureLocation();
    setIsWaitingForPermission(false);
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

  // Handle permission denial with grace period to avoid false positives on iOS
  useEffect(() => {
    if (permissionStatus === 'denied' && onPermissionDenied) {
      // Add grace period: only treat as denied if 3+ seconds have passed since request
      // This prevents iOS from showing error while native dialog is still open
      const gracePeriod = 3000; // 3 seconds
      const timeSinceRequest = permissionRequestTime ? Date.now() - permissionRequestTime : Infinity;

      if (timeSinceRequest > gracePeriod) {
        onPermissionDenied();
      } else {
        // Still in grace period - likely the native dialog is open
        // Wait and check again
        const remaining = gracePeriod - timeSinceRequest;
        setTimeout(() => {
          if (permissionStatus === 'denied' && onPermissionDenied) {
            onPermissionDenied();
          }
        }, remaining);
      }
    }
  }, [permissionStatus, onPermissionDenied, permissionRequestTime]);

  // Determine if accuracy is acceptable
  const isAccuracyGood = location ? location.accuracy <= maxAccuracy : false;

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Navigation className="h-5 w-5" />
          {t('location.verification_title')}
        </CardTitle>
        <CardDescription>
          {t('location.verification_desc')}
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Permission Status */}
        {permissionStatus === 'denied' && (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertTitle>{t('location.permission.denied_title')}</AlertTitle>
            <AlertDescription>
              {t('location.permission.denied_desc')}
            </AlertDescription>
          </Alert>
        )}

        {/* Waiting for Permission State (iOS grace period) */}
        {isWaitingForPermission && !location && !error && (
          <Alert className="border-blue-200 bg-blue-50">
            <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
            <AlertTitle className="text-blue-800">{t('location.permission.waiting_title')}</AlertTitle>
            <AlertDescription className="text-blue-700">
              {t('location.permission.waiting_desc')}
            </AlertDescription>
          </Alert>
        )}

        {/* Error Alert */}
        {error && permissionStatus !== 'denied' && !isWaitingForPermission && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>{t('location.error_title')}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Loading State */}
        {isCapturing && !location && !isWaitingForPermission && (
          <div className="flex flex-col items-center justify-center py-8 space-y-4">
            <div className="relative">
              <MapPin className="h-12 w-12 text-gray-400" />
              <Loader2 className="h-12 w-12 absolute inset-0 animate-spin text-primary" />
            </div>
            <p className="text-sm text-gray-600">{t('location.capturing.title')}</p>
            <p className="text-xs text-gray-500">{t('location.capturing.description')}</p>
          </div>
        )}

        {/* Location Details */}
        {location && (
          <div className="space-y-4">
            <Alert className="border-green-200 bg-green-50">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertTitle className="text-green-800">{t('location.captured.title')}</AlertTitle>
              <AlertDescription className="text-green-700">
                {t('location.captured.description')}
              </AlertDescription>
            </Alert>

            {/* GPS Accuracy Indicator */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{t('location.accuracy.title')}</span>
                <Badge variant={getAccuracyBadgeVariant(accuracyStatus)}>
                  {accuracyStatus === 'excellent' && t('location.accuracy.excellent')}
                  {accuracyStatus === 'good' && t('location.accuracy.good')}
                  {accuracyStatus === 'fair' && t('location.accuracy.fair')}
                  {accuracyStatus === 'poor' && t('location.accuracy.poor')}
                </Badge>
              </div>

              <Progress value={accuracyPercentage} className="h-2" />

              <div className="flex items-center justify-between text-sm">
                <span className={getAccuracyColor(accuracyStatus)}>
                  {t('location.accuracy.current', { accuracy: currentAccuracy.toFixed(1) })}
                </span>
                <span className="text-gray-500">
                  {t('location.accuracy.required', { maxAccuracy })}
                </span>
              </div>
            </div>

            {/* Location Info */}
            <div className="grid grid-cols-2 gap-4 pt-2">
              <div className="space-y-1">
                <p className="text-xs text-gray-500">{t('common.labels.latitude')}</p>
                <p className="font-mono text-sm">{location.latitude?.toFixed(6)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-gray-500">{t('common.labels.longitude')}</p>
                <p className="font-mono text-sm">{location.longitude?.toFixed(6)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-gray-500">{t('common.labels.altitude')}</p>
                <p className="font-mono text-sm">
                  {location.altitude ? `${location.altitude.toFixed(1)}m` : t('common.labels.na')}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-gray-500">{t('common.labels.timestamp')}</p>
                <p className="font-mono text-sm">
                  {location?.timestamp ? new Date(location.timestamp).toLocaleTimeString() : t('common.labels.na')}
                </p>
              </div>
            </div>

            {/* Warning for poor accuracy */}
            {accuracyStatus === 'poor' && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {t('location.accuracy.warning')}
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
                  {t('location.buttons.requesting')}
                </>
              ) : (
                <>
                  <MapPin className="mr-2 h-4 w-4" />
                  {t('location.buttons.allow')}
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
                  {isCapturing ? t('location.buttons.capturing') : t('location.buttons.recapture')}
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
                <li>{t('location.instructions.at_location')}</li>
                <li>{t('location.instructions.enable_gps')}</li>
                <li>{t('location.instructions.best_accuracy')}</li>
                <li>{t('location.instructions.grant_permission')}</li>
              </ul>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
};