import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { LocationPermission } from '../components/LocationPermission';
import { CommunityPreview } from '../components/CommunityPreview';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { Progress } from '../components/ui/progress';
import { 
  CheckCircle, 
  AlertCircle, 
  MapPin, 
  Users, 
  Loader2, 
  ArrowLeft,
  Shield,
  XCircle
} from 'lucide-react';
import { useNostrLogin } from '../lib/nostrify-shim';
import { IdentityModal } from '../components/IdentityModal';
import { NostrLocationService, getPreviewData, type LocationValidationResponse } from '../services/nostr-location';
import { hexToBytes } from '../lib/hex';
import { useToast } from '@/hooks/useToast';

// Types that were previously from API
export interface CommunityPreviewData {
  name: string;
  description: string;
  member_count: number;
  created_at: number;
  location?: {
    latitude: number;
    longitude: number;
  };
  is_first_scan: boolean;
}

export interface ValidateLocationResponse extends LocationValidationResponse {
  preview?: CommunityPreviewData;
}

// Join flow steps
enum JoinStep {
  LOADING = 'loading',
  PREVIEW = 'preview',
  LOCATION = 'location',
  VALIDATING = 'validating',
  SUCCESS = 'success',
  ERROR = 'error'
}

interface JoinFlowError {
  message: string;
  code?: string;
  canRetry: boolean;
}

export const JoinFlow: React.FC = () => {
  const { communityId } = useParams<{ communityId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { pubkey, npub, login, createNewIdentity, importIdentity, showIdentityModal, setShowIdentityModal, identity } = useNostrLogin();
  const { toast } = useToast();
  
  // Flow state
  const [currentStep, setCurrentStep] = useState<JoinStep>(JoinStep.LOADING);
  const [previewData, setPreviewData] = useState<CommunityPreviewData | null>(null);
  const [validationResponse, setValidationResponse] = useState<ValidateLocationResponse | null>(null);
  const [error, setError] = useState<JoinFlowError | null>(null);
  const [capturedLocation, setCapturedLocation] = useState<{
    latitude: number;
    longitude: number;
    accuracy: number;
    timestamp: number;
  } | null>(null);
  const [waitingForLogin, setWaitingForLogin] = useState(false);

  // Check if user is logged in (skip for initial preview)
  useEffect(() => {
    // Only require login when actually trying to join, not for preview
    if (!pubkey && currentStep === JoinStep.LOCATION) {
      // Prompt user to login first
      setError({
        message: 'Please login with your Nostr account to join communities',
        code: 'NOT_LOGGED_IN',
        canRetry: false
      });
      setCurrentStep(JoinStep.ERROR);
    }
  }, [pubkey, currentStep]);

  // Initial load - fetch preview data with a test location
  useEffect(() => {
    if (communityId && currentStep === JoinStep.LOADING) {
      fetchPreview();
    }
  }, [communityId]);

  // Handle transition to location step after login
  useEffect(() => {
    if (waitingForLogin && pubkey && currentStep === JoinStep.PREVIEW) {
      setWaitingForLogin(false);
      setCurrentStep(JoinStep.LOCATION);
    }
  }, [waitingForLogin, pubkey, currentStep]);

  const fetchPreview = async () => {
    if (!communityId) return;
    
    try {
      // For preview, we get community info via Nostr
      // This could be a separate event type or included in validation response
      const previewData = await getPreviewData(
        communityId,
        identity?.secretKey ? hexToBytes(identity.secretKey) : new Uint8Array(32),
        pubkey || 'preview-only'
      );

      if (previewData) {
        setPreviewData(previewData);
        setCurrentStep(JoinStep.PREVIEW);
      } else {
        throw new Error('Community not found');
      }
    } catch (err) {
      // MOCK MODE: If API fails, use mock data for testing
      console.log('API failed, using mock data for testing');
      const mockPreview: CommunityPreviewData = {
        name: "Test Community Hub",
        description: "This is a test community for development. In production, this would show real community data from the validation service.",
        member_count: Math.floor(Math.random() * 50) + 1,
        created_at: Math.floor(Date.now() / 1000) - 86400 * 3, // 3 days ago
        location: {
          latitude: -34.919143,
          longitude: -56.161693
        },
        is_first_scan: communityId === 'new-community' || Math.random() > 0.7
      };
      
      setPreviewData(mockPreview);
      setCurrentStep(JoinStep.PREVIEW);
      
      // Only show error in production
      if (import.meta.env.PROD) {
        setError({
          message: 'Failed to load community information. The QR code may be invalid.',
          code: 'PREVIEW_FAILED',
          canRetry: true
        });
        setCurrentStep(JoinStep.ERROR);
      }
    }
  };

  const handleJoinClick = async () => {
    if (!pubkey) {
      // Prompt to login
      setWaitingForLogin(true);
      await login();
      // After login, we need to wait for the next render to get the updated pubkey
      // The useEffect below will handle transitioning to location step
      return;
    }
    setCurrentStep(JoinStep.LOCATION);
  };

  const handleLocationCaptured = useCallback(async (location: {
    latitude: number;
    longitude: number;
    accuracy: number;
    timestamp: number;
  }) => {
    setCapturedLocation(location);

    // Show location capture success
    toast({
      title: "Location captured",
      description: `GPS accuracy: ${location.accuracy.toFixed(1)}m`,
    });

    setCurrentStep(JoinStep.VALIDATING);

    // Validate location with the server
    await validateLocation(location);
  }, [communityId, pubkey, toast]);

  const validateLocation = async (location: {
    latitude: number;
    longitude: number;
    accuracy: number;
    timestamp: number;
  }) => {
    if (!communityId) {
      setError({
        message: 'Invalid community ID',
        code: 'INVALID_COMMUNITY',
        canRetry: false
      });
      setCurrentStep(JoinStep.ERROR);
      return;
    }

    if (!identity?.secretKey) {
      setError({
        message: 'Please login with your Nostr account to join communities',
        code: 'NOT_LOGGED_IN',
        canRetry: false
      });
      setCurrentStep(JoinStep.ERROR);
      return;
    }

    try {
      // Use Nostr event-based validation via gift wraps
      const secretKey = hexToBytes(identity.secretKey);

      // Get relay URL from environment or use local for testing
      const relayUrl = import.meta.env.VITE_DEV_MODE === 'true'
        ? 'ws://localhost:8090'
        : (import.meta.env.VITE_RELAY_URL || 'wss://peek.hol.is');

      console.log('Validating location via gift wrap:', {
        communityId,
        relay: relayUrl,
        accuracy: location.accuracy,
        userPubkey: pubkey
      });

      const nostrService = new NostrLocationService(
        secretKey,
        pubkey!,
        [relayUrl] // Use configured relay
      );

      // Send validation request via NIP-59 gift wrap
      const response = await nostrService.validateLocation(communityId, location);
      nostrService.close();

      console.log('Validation response:', response);
      setValidationResponse(response);

      if (response.success) {
        // Success! User has been added to the NIP-29 group
        setCurrentStep(JoinStep.SUCCESS);

        // Show success toast
        toast({
          title: "Successfully Joined! 🎉",
          description: response.is_admin
            ? "You're the founding admin of this community!"
            : "You're now a member of this community.",
        });

        // Store the group information for later use
        if (response.group_id && response.relay_url) {
          // Save to local storage so Community page can connect
          const groupInfo = {
            communityId,
            groupId: response.group_id,
            relayUrl: response.relay_url,
            isAdmin: response.is_admin || false,
            joinedAt: Date.now()
          };

          // Store in localStorage for persistence
          const existingGroups = JSON.parse(
            localStorage.getItem('joinedGroups') || '[]'
          );
          existingGroups.push(groupInfo);
          localStorage.setItem('joinedGroups', JSON.stringify(existingGroups));
        }

        console.log('Successfully joined community!', {
          group_id: response.group_id,
          relay: response.relay_url,
          is_admin: response.is_admin
        });
      } else {
        // Validation failed - show specific error
        const errorMessage = response.error || 'Location validation failed';
        const errorCode = response.error_code || 'VALIDATION_FAILED';

        // Parse specific error types for better UX
        let userMessage = errorMessage;
        let canRetry = true;

        if (errorCode === 'LOCATION_INVALID') {
          if (errorMessage.includes('Too far from location')) {
            userMessage = errorMessage; // Already user-friendly
            canRetry = true;
          } else if (errorMessage.includes('GPS accuracy too poor')) {
            userMessage = errorMessage; // Already user-friendly
            canRetry = true;
          }
        } else if (errorCode === 'INVALID_ID') {
          userMessage = 'This QR code is invalid or expired';
          canRetry = false;
        } else if (errorCode === 'COMMUNITY_ERROR') {
          userMessage = 'Failed to access community information';
          canRetry = true;
        }

        setError({
          message: userMessage,
          code: errorCode,
          canRetry
        });
        setCurrentStep(JoinStep.ERROR);
      }
    } catch (err: any) {
      console.error('Location validation error:', err);

      // Check for timeout
      if (err.message?.includes('timeout') || err.message?.includes('Validation timeout')) {
        setError({
          message: 'Validation timed out. The service may be unavailable.',
          code: 'TIMEOUT',
          canRetry: true
        });
      } else {
        setError({
          message: 'Failed to validate location. Please check your connection and try again.',
          code: 'NETWORK_ERROR',
          canRetry: true
        });
      }
      setCurrentStep(JoinStep.ERROR);
    }
  };

  const handleLocationDenied = useCallback(() => {
    setError({
      message: 'Location permission is required to join location-based communities',
      code: 'PERMISSION_DENIED',
      canRetry: true
    });
    setCurrentStep(JoinStep.ERROR);
  }, []);

  const handleRetry = () => {
    setError(null);
    if (error?.code === 'PREVIEW_FAILED') {
      setCurrentStep(JoinStep.LOADING);
      fetchPreview();
    } else if (error?.code === 'PERMISSION_DENIED' || error?.code === 'ACCURACY_TOO_LOW') {
      setCurrentStep(JoinStep.LOCATION);
    } else {
      setCurrentStep(JoinStep.PREVIEW);
    }
  };

  const handleBack = () => {
    navigate('/');
  };

  const getProgressValue = () => {
    switch (currentStep) {
      case JoinStep.LOADING: return 20;
      case JoinStep.PREVIEW: return 40;
      case JoinStep.LOCATION: return 60;
      case JoinStep.VALIDATING: return 80;
      case JoinStep.SUCCESS: return 100;
      case JoinStep.ERROR: return 0;
      default: return 0;
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <Button
          variant="ghost"
          onClick={handleBack}
          className="mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        
        <h1 className="text-3xl font-bold mb-2">Join Community</h1>
        <Progress value={getProgressValue()} className="h-2" />
      </div>

      {/* Loading State */}
      {currentStep === JoinStep.LOADING && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
            <p className="text-lg font-medium">Loading community...</p>
            <p className="text-sm text-gray-500 mt-2">Fetching community information</p>
          </CardContent>
        </Card>
      )}

      {/* Preview Step */}
      {currentStep === JoinStep.PREVIEW && previewData && (
        <CommunityPreview
          communityId={communityId || ''}
          previewData={previewData}
          onJoin={handleJoinClick}
          isFirstScanner={previewData.is_first_scan}
        />
      )}

      {/* Location Permission Step */}
      {currentStep === JoinStep.LOCATION && (
        <div className="space-y-6">
          <Alert className="border-blue-200 bg-blue-50">
            <MapPin className="h-4 w-4 text-blue-600" />
            <AlertTitle className="text-blue-900">Physical Presence Required</AlertTitle>
            <AlertDescription className="text-blue-800">
              To join this community, you need to prove you're physically at the location.
              Please ensure you're within 25 meters of the QR code location.
            </AlertDescription>
          </Alert>

          <LocationPermission
            onLocationCaptured={handleLocationCaptured}
            onPermissionDenied={handleLocationDenied}
            maxAccuracy={20}
            autoStart={true}
          />
        </div>
      )}

      {/* Validating Step */}
      {currentStep === JoinStep.VALIDATING && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="relative mb-6">
              <MapPin className="h-16 w-16 text-gray-400" />
              <Loader2 className="h-16 w-16 absolute inset-0 animate-spin text-primary" />
            </div>
            <p className="text-lg font-medium">Validating your location...</p>
            <div className="mt-4 space-y-2 text-center">
              <p className="text-sm text-gray-600">
                Sending encrypted location proof via Nostr
              </p>
              <p className="text-xs text-gray-500">
                This may take up to 30 seconds
              </p>
            </div>
            {capturedLocation && (
              <div className="mt-6 space-y-1">
                <div className="text-xs text-gray-500 font-mono">
                  📍 Accuracy: {capturedLocation.accuracy.toFixed(1)}m
                  {capturedLocation.accuracy <= 20 && (
                    <span className="ml-2 text-green-600">✓ Good</span>
                  )}
                  {capturedLocation.accuracy > 20 && (
                    <span className="ml-2 text-yellow-600">⚠ Low</span>
                  )}
                </div>
                <div className="text-xs text-gray-400">
                  Lat: {capturedLocation.latitude.toFixed(6)},
                  Lng: {capturedLocation.longitude.toFixed(6)}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Success Step */}
      {currentStep === JoinStep.SUCCESS && validationResponse && (
        <Card className="border-green-200">
          <CardHeader>
            <div className="flex items-center gap-3">
              <CheckCircle className="h-8 w-8 text-green-600" />
              <div>
                <CardTitle className="text-green-900">
                  Successfully Joined!
                </CardTitle>
                <CardDescription>
                  You're now a member of this community
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {validationResponse.is_admin && (
              <Alert className="border-purple-200 bg-purple-50">
                <Shield className="h-4 w-4 text-purple-600" />
                <AlertTitle className="text-purple-900">You're an Admin!</AlertTitle>
                <AlertDescription className="text-purple-800">
                  As the first person to scan this QR code, you have admin privileges
                  for this community. You can manage members and settings.
                </AlertDescription>
              </Alert>
            )}

            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-medium mb-2">What's next?</h3>
              <ul className="space-y-2 text-sm text-gray-600">
                <li className="flex items-start gap-2">
                  <Users className="h-4 w-4 mt-0.5 text-gray-400" />
                  <span>Connect with other members who visit this location</span>
                </li>
                <li className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 mt-0.5 text-gray-400" />
                  <span>Share updates and messages with the community</span>
                </li>
                {validationResponse.is_admin && (
                  <li className="flex items-start gap-2">
                    <Shield className="h-4 w-4 mt-0.5 text-gray-400" />
                    <span>Manage community settings and moderate content</span>
                  </li>
                )}
              </ul>
            </div>

            <div className="flex gap-3">
              <Button 
                onClick={() => navigate(`/community/${communityId}`)}
                className="flex-1"
              >
                <Users className="mr-2 h-4 w-4" />
                Go to Community
              </Button>
              <Button 
                onClick={() => navigate('/')}
                variant="outline"
                className="flex-1"
              >
                Back to Home
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error Step */}
      {currentStep === JoinStep.ERROR && error && (
        <Card className="border-red-200">
          <CardHeader>
            <div className="flex items-center gap-3">
              <XCircle className="h-8 w-8 text-red-600" />
              <div>
                <CardTitle className="text-red-900">
                  Unable to Join
                </CardTitle>
                <CardDescription>
                  {error.code || 'ERROR'}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error.message}</AlertDescription>
            </Alert>

            {error.code === 'LOCATION_TOO_FAR' && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <h3 className="font-medium text-yellow-900 mb-1">Tips:</h3>
                <ul className="text-sm text-yellow-800 space-y-1">
                  <li>• Make sure you're at the physical location</li>
                  <li>• Stand closer to where the QR code is displayed</li>
                  <li>• Enable high-accuracy mode in your GPS settings</li>
                </ul>
              </div>
            )}

            {error.code === 'ACCURACY_TOO_LOW' && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <h3 className="font-medium text-yellow-900 mb-1">Improve GPS Accuracy:</h3>
                <ul className="text-sm text-yellow-800 space-y-1">
                  <li>• Move to an open area with clear sky view</li>
                  <li>• Enable Wi-Fi and Bluetooth for better positioning</li>
                  <li>• Wait a moment for GPS to stabilize</li>
                </ul>
              </div>
            )}

            <div className="flex gap-3">
              {error.canRetry && (
                <Button 
                  onClick={handleRetry}
                  className="flex-1"
                >
                  Try Again
                </Button>
              )}
              <Button 
                onClick={handleBack}
                variant="outline"
                className={error.canRetry ? 'flex-1' : 'w-full'}
              >
                Back to Home
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Identity Modal */}
      <IdentityModal
        open={showIdentityModal}
        onOpenChange={setShowIdentityModal}
        onCreateNew={createNewIdentity}
        onImport={importIdentity}
        existingNpub={npub || undefined}
      />
    </div>
  );
};