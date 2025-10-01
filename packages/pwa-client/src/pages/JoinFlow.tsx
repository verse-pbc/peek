import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { LocationPermission } from '../components/LocationPermission';
import { CommunityPreview } from '../components/CommunityPreview';
import { GeohashLocationPicker } from '../components/GeohashLocationPicker';
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
  Shield,
  XCircle,
  Code2,
  Crown,
  MessageSquare
} from 'lucide-react';
import { useNostrLogin, hasNip44Support, nip07Encrypt, nip07Decrypt } from '../lib/nostrify-shim';
import { NostrLocationService, type LocationValidationResponse, type EncryptionHelper } from '../services/nostr-location';
import { hexToBytes, bytesToHex } from '../lib/hex';
import { getPublicKey, generateSecretKey } from 'nostr-tools';
import { useToast } from '@/hooks/useToast';
import { useRelayManager } from '@/contexts/RelayContext';

// Types that were previously from API
export interface CommunityPreviewData {
  name: string;
  description: string;
  member_count: number;
  members?: string[];
  picture?: string;
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
  const navigate = useNavigate();
  const { pubkey, login, identity } = useNostrLogin();
  const { toast } = useToast();
  const { relayManager, groupManager, connected, waitForConnection } = useRelayManager();

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

  // Parse URL parameters - do this inside the component to ensure fresh values
  const urlParams = React.useMemo(() => new URLSearchParams(window.location.search), []);
  const isDevParam = urlParams.get('dev') === 'true';

  // Enable developer mode with ?dev=true URL parameter or in development mode
  const [devModeEnabled, setDevModeEnabled] = useState(
    import.meta.env.DEV || isDevParam
  );
  // Automatically show the map when dev=true is in URL
  const [developerMode, setDeveloperMode] = useState(isDevParam);
  const [forcedLocation, setForcedLocation] = useState<{
    latitude: number;
    longitude: number;
    accuracy: number;
    timestamp: number;
  } | null>(null);

  // Check if this is likely a first scan (for immediate title display)
  const accessedCommunities = JSON.parse(localStorage.getItem('accessedCommunities') || '[]');
  const isLikelyFirstScan = !accessedCommunities.includes(communityId);

  // Ensure developer mode stays enabled based on URL param
  useEffect(() => {
    if (isDevParam && !developerMode) {
      setDeveloperMode(true);
    }
  }, [isDevParam, developerMode]);

  // Add keyboard shortcut to enable dev mode (Ctrl+Shift+D)
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        setDevModeEnabled(prev => !prev);
        toast({
          title: devModeEnabled ? "Developer mode disabled" : "Developer mode enabled",
          description: devModeEnabled ? "Test location controls hidden" : "Test location controls are now available"
        });
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [devModeEnabled, toast]);

  // Check if user is already a member and skip join flow
  useEffect(() => {
    if (!communityId) return;

    // Check if user is already a member of this community
    const joinedGroups = JSON.parse(localStorage.getItem('joinedGroups') || '[]');
    const existingMembership = joinedGroups.find((g: { communityId: string }) => g.communityId === communityId);

    if (existingMembership) {
      console.log('User is already a member, redirecting to community page');
      // Skip join flow, go directly to community
      navigate(`/community/${communityId}`, { replace: true });
      return;
    }
  }, [communityId, navigate]);

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

  const fetchPreview = useCallback(async () => {
    if (!communityId) return;

    try {
      // Create a temporary NostrLocationService for fetching preview
      let secretKey: Uint8Array | null = null;
      let publicKey: string;
      let encryptionHelper: EncryptionHelper | undefined;

      if (identity?.secretKey && pubkey) {
        publicKey = pubkey;

        // Check if using NIP-07 browser extension with nip44 support
        if (identity.secretKey === 'NIP07_EXTENSION' && hasNip44Support()) {
          // Use NIP-07 nip44 encryption with real identity
          console.log('[JoinFlow] Using NIP-07 nip44 encryption with real identity (preview)');

          // For gift wrap decryption, we still need a local key since the wrap uses ephemeral keys
          // But for the seal (inner layer), we'll use NIP-07
          const ANON_KEY = 'peek_anonymous_identity';
          const anonIdentity = localStorage.getItem(ANON_KEY);

          if (!anonIdentity) {
            const newSecretKey = generateSecretKey();
            const newPublicKey = getPublicKey(newSecretKey);
            localStorage.setItem(ANON_KEY, JSON.stringify({
              secretKey: bytesToHex(newSecretKey),
              publicKey: newPublicKey,
              createdAt: Date.now()
            }));
            secretKey = newSecretKey;
          } else {
            const parsed = JSON.parse(anonIdentity);
            secretKey = hexToBytes(parsed.secretKey);
          }

          // Set up NIP-07 encryption helper
          encryptionHelper = {
            encrypt: nip07Encrypt,
            decrypt: nip07Decrypt
          };
        } else if (identity.secretKey === 'NIP07_EXTENSION') {
          // NIP-07 without nip44 support - use anonymous key for encryption but real pubkey for identity
          console.log('[JoinFlow] NIP-07 extension without nip44 - using anonymous encryption with real pubkey (preview)');
          const ANON_KEY = 'peek_anonymous_identity';
          const anonIdentity = localStorage.getItem(ANON_KEY);

          if (!anonIdentity) {
            const newSecretKey = generateSecretKey();
            const newPublicKey = getPublicKey(newSecretKey);
            localStorage.setItem(ANON_KEY, JSON.stringify({
              secretKey: bytesToHex(newSecretKey),
              publicKey: newPublicKey,
              createdAt: Date.now()
            }));
            secretKey = newSecretKey;
          } else {
            const parsed = JSON.parse(anonIdentity);
            secretKey = hexToBytes(parsed.secretKey);
          }
          // IMPORTANT: Keep real pubkey for identity (publicKey stays as the real one from line 167)
        } else {
          // User has real keys, use them
          secretKey = hexToBytes(identity.secretKey);
        }
      } else {
        // User is not logged in, use the same anonymous identity as RelayContext
        const ANON_KEY = 'peek_anonymous_identity';
        const anonIdentity = localStorage.getItem(ANON_KEY);

        if (!anonIdentity) {
          // Generate new anonymous identity (matching RelayContext)
          const newSecretKey = generateSecretKey();
          const newPublicKey = getPublicKey(newSecretKey);

          localStorage.setItem(ANON_KEY, JSON.stringify({
            secretKey: bytesToHex(newSecretKey),
            publicKey: newPublicKey,
            createdAt: Date.now(),
            isAutoGenerated: true
          }));

          secretKey = newSecretKey;
          publicKey = newPublicKey;
          console.log('[JoinFlow] Generated new anonymous identity:', newPublicKey.slice(0, 8) + '...');
        } else {
          const parsed = JSON.parse(anonIdentity);
          secretKey = hexToBytes(parsed.secretKey);
          publicKey = parsed.publicKey;
          console.log('[JoinFlow] Using existing anonymous identity:', publicKey.slice(0, 8) + '...');
        }
      }

      if (!relayManager) {
        throw new Error('Relay manager not initialized');
      }

      const nostrService = new NostrLocationService(
        secretKey,
        publicKey,
        relayManager,
        encryptionHelper
      );

      console.log('Fetching community preview via gift wrap:', {
        communityId
      });

      // Fetch community preview via NIP-59 gift wrap
      const response = await nostrService.getCommunityPreview(communityId);
      // No need to close - RelayManager is managed globally

      console.log('Preview response:', response);

      if (response.success) {
        const previewData: CommunityPreviewData = {
          name: response.name || 'Community',
          description: response.about || 'Location-based community',
          member_count: response.member_count || 0,
          members: response.members,
          picture: response.picture,
          created_at: response.created_at || Math.floor(Date.now() / 1000),
          is_first_scan: response.member_count === 0
        };

        setPreviewData(previewData);
        setCurrentStep(JoinStep.PREVIEW);
      } else if (response.error?.toLowerCase().includes('not found') ||
                 response.error?.toLowerCase().includes('group not found')) {
        // Group doesn't exist - this is a first scanner who will create it
        const previewData: CommunityPreviewData = {
          name: `New Community`,
          description: 'Be the first to create this location-based community. You will become the admin.',
          member_count: 0,
          members: [],
          picture: undefined,
          created_at: Math.floor(Date.now() / 1000),
          is_first_scan: true
        };

        setPreviewData(previewData);
        setCurrentStep(JoinStep.PREVIEW);
      } else {
        throw new Error(response.error || 'Failed to fetch preview');
      }
    } catch (err) {
      console.error('Preview fetch error:', err);

      // Show error - preview request failed (likely timeout)
      setError({
        message: err instanceof Error ? err.message : 'Unable to fetch community information. Please try again.',
        code: 'PREVIEW_FAILED',
        canRetry: true
      });
      setCurrentStep(JoinStep.ERROR);
    }
  }, [communityId, identity?.secretKey, pubkey, relayManager]);

  // Initial load - fetch preview data with a test location
  useEffect(() => {
    if (communityId && currentStep === JoinStep.LOADING && relayManager && connected) {
      fetchPreview();
    }
  }, [communityId, currentStep, relayManager, connected, fetchPreview]);

  // Handle transition to location step after login
  useEffect(() => {
    if (waitingForLogin && pubkey && currentStep === JoinStep.PREVIEW) {
      setWaitingForLogin(false);
      setCurrentStep(JoinStep.LOCATION);
    }
  }, [waitingForLogin, pubkey, currentStep]);

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

  const validateLocation = useCallback(async (location: {
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

    let secretKey: Uint8Array | null = null;
    let userPubkey: string;
    let encryptionHelper: EncryptionHelper | undefined;

    if (identity?.secretKey && pubkey) {
      userPubkey = pubkey;

      // Check if using NIP-07 browser extension with nip44 support
      if (identity.secretKey === 'NIP07_EXTENSION' && hasNip44Support()) {
        // Use NIP-07 nip44 encryption with real identity
        console.log('[JoinFlow] Using NIP-07 nip44 encryption with real identity (validation)');

        // For gift wrap decryption, we still need a local key since the wrap uses ephemeral keys
        const ANON_KEY = 'peek_anonymous_identity';
        const anonIdentity = localStorage.getItem(ANON_KEY);

        if (!anonIdentity) {
          const newSecretKey = generateSecretKey();
          const newPublicKey = getPublicKey(newSecretKey);
          localStorage.setItem(ANON_KEY, JSON.stringify({
            secretKey: bytesToHex(newSecretKey),
            publicKey: newPublicKey,
            createdAt: Date.now(),
            isAutoGenerated: true
          }));
          secretKey = newSecretKey;
        } else {
          const parsed = JSON.parse(anonIdentity);
          secretKey = hexToBytes(parsed.secretKey);
        }

        // Set up NIP-07 encryption helper
        encryptionHelper = {
          encrypt: nip07Encrypt,
          decrypt: nip07Decrypt
        };
      } else if (identity.secretKey === 'NIP07_EXTENSION') {
        // NIP-07 without nip44 support - use anonymous key for encryption but real pubkey for identity
        console.log('[JoinFlow] NIP-07 extension without nip44 - using anonymous encryption with real pubkey');
        const ANON_KEY = 'peek_anonymous_identity';
        const anonIdentity = localStorage.getItem(ANON_KEY);

        if (!anonIdentity) {
          const newSecretKey = generateSecretKey();
          const newPublicKey = getPublicKey(newSecretKey);
          localStorage.setItem(ANON_KEY, JSON.stringify({
            secretKey: bytesToHex(newSecretKey),
            publicKey: newPublicKey,
            createdAt: Date.now(),
            isAutoGenerated: true
          }));
          secretKey = newSecretKey;
        } else {
          const parsed = JSON.parse(anonIdentity);
          secretKey = hexToBytes(parsed.secretKey);
        }
        // IMPORTANT: Keep real pubkey for group membership (userPubkey stays as the real one)
      } else {
        // User has real keys, use them for both signing and encryption
        secretKey = hexToBytes(identity.secretKey);
      }
    } else {
      // User is not logged in, use the same anonymous identity as RelayContext
      const ANON_KEY = 'peek_anonymous_identity';
      const anonIdentity = localStorage.getItem(ANON_KEY);

      if (!anonIdentity) {
        // Generate new anonymous identity (matching RelayContext)
        const newSecretKey = generateSecretKey();
        const newPublicKey = getPublicKey(newSecretKey);

        localStorage.setItem(ANON_KEY, JSON.stringify({
          secretKey: bytesToHex(newSecretKey),
          publicKey: newPublicKey,
          createdAt: Date.now(),
          isAutoGenerated: true
        }));

        secretKey = newSecretKey;
        userPubkey = newPublicKey;
        console.log('[JoinFlow] Generated new anonymous identity for validation:', newPublicKey.slice(0, 8) + '...');
      } else {
        const parsed = JSON.parse(anonIdentity);
        secretKey = hexToBytes(parsed.secretKey);
        userPubkey = parsed.publicKey;
        console.log('[JoinFlow] Using existing anonymous identity for validation:', userPubkey.slice(0, 8) + '...');
      }
    }

    try {

      if (!relayManager) {
        throw new Error('Relay manager not initialized');
      }

      console.log('Validating location via gift wrap:', {
        communityId,
        accuracy: location.accuracy,
        userPubkey,
        usingNIP07: identity?.secretKey === 'NIP07_EXTENSION',
        hasNip44: hasNip44Support()
      });

      // NostrLocationService will use secretKey for gift wrap decryption
      // and encryptionHelper (if provided) for seal encryption/decryption
      const nostrService = new NostrLocationService(
        secretKey,
        userPubkey,
        relayManager,
        encryptionHelper
      );

      // Send validation request via NIP-59 gift wrap
      const response = await nostrService.validateLocation(communityId, location);
      // No need to close - RelayManager is managed globally

      console.log('Validation response:', response);
      setValidationResponse(response);

      if (response.success) {
        // Success! User has been added to (or is already in) the NIP-29 group
        setCurrentStep(JoinStep.SUCCESS);

        // Check if this is a re-validation (user already in localStorage)
        const existingGroups = JSON.parse(
          localStorage.getItem('joinedGroups') || '[]'
        );
        const wasAlreadyMember = existingGroups.some(
          (g: { communityId: string }) => g.communityId === communityId
        );

        // Show appropriate toast message
        if (wasAlreadyMember && !response.is_admin) {
          // Re-validation of existing member
          toast({
            title: "Welcome Back! 👋",
            description: "You're already a member of this community.",
          });
        } else {
          // New member or admin
          toast({
            title: "Successfully Joined! 🎉",
            description: response.is_admin
              ? "You're the founding admin of this community!"
              : "You're now a member of this community.",
          });
        }

        // Store the group information for later use
        if (response.group_id && response.relay_url) {
          // Check if this group is already in localStorage
          const existingGroups = JSON.parse(
            localStorage.getItem('joinedGroups') || '[]'
          );
          const existingIndex = existingGroups.findIndex(
            (g: { communityId: string }) => g.communityId === communityId
          );

          const groupInfo = {
            communityId,
            groupId: response.group_id,
            relayUrl: response.relay_url,
            isAdmin: response.is_admin || false,
            joinedAt: existingIndex >= 0 ? existingGroups[existingIndex].joinedAt : Date.now()
          };

          if (existingIndex >= 0) {
            // Update existing entry
            existingGroups[existingIndex] = groupInfo;
          } else {
            // Add new entry
            existingGroups.push(groupInfo);
          }

          localStorage.setItem('joinedGroups', JSON.stringify(existingGroups));
        }

        console.log('Successfully joined community!', {
          group_id: response.group_id,
          relay: response.relay_url,
          is_admin: response.is_admin
        });

        // Cache the UUID → h-tag mapping for future lookups
        if (response.group_id && relayManager && communityId) {
          relayManager.cacheUuidToGroup(communityId, response.group_id);
          console.log(`Cached UUID ${communityId} → group ${response.group_id}`);
        }

        // If user is admin, immediately update the cache
        if (response.is_admin && response.group_id && groupManager && pubkey) {
          groupManager.setInitialAdminStatus(response.group_id, pubkey);
          console.log('Set initial admin status in cache for group:', response.group_id);
        }
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
          userMessage = 'Invalid QR code format';
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
    } catch (err: unknown) {
      console.error('Location validation error:', err);

      // Check for relay connection issues
      if ((err as Error).message?.includes('not initialized') || (err as Error).message?.includes('not connected')) {
        setError({
          message: 'Connection issue. Please wait a moment and try again.',
          code: 'NETWORK_ERROR',
          canRetry: true
        });
        setCurrentStep(JoinStep.ERROR);
        return;
      }

      // Check for timeout
      if ((err as Error).message?.includes('timeout') || (err as Error).message?.includes('Validation timeout')) {
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
  }, [communityId, identity?.secretKey, pubkey, relayManager, toast]);

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

    // Wait for relay connection if not already connected
    try {
      await waitForConnection();
      console.log('Relay connection confirmed, proceeding with validation');

      // Validate location with the server
      await validateLocation(location);
    } catch (err) {
      console.error('Failed to establish relay connection:', err);
      setError({
        message: 'Connection failed. Please check your internet and try again.',
        code: 'CONNECTION_FAILED',
        canRetry: true
      });
      setCurrentStep(JoinStep.ERROR);
    }
  }, [toast, waitForConnection, validateLocation]);

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
        <h1 className="text-3xl font-bold mb-2">
          {(previewData?.is_first_scan || isLikelyFirstScan)
            ? 'Create a Community'
            : `Join ${previewData?.name}!`}
        </h1>
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
          {/* Developer mode toggle - only when enabled */}
          {devModeEnabled && (
            <div className="flex items-center justify-between p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-center gap-2">
                <Code2 className="h-4 w-4 text-yellow-600" />
                <span className="text-sm font-medium text-yellow-900">Developer Mode</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeveloperMode(!developerMode)}
                className="text-xs"
              >
                {developerMode ? 'Hide' : 'Show'} Test Location Map
              </Button>
            </div>
          )}

          {/* Geohash location picker - only when developer mode is enabled */}
          {developerMode && (
            <GeohashLocationPicker
              onLocationSelected={(location) => {
                setForcedLocation(location);
                handleLocationCaptured(location);
              }}
              initialLocation={capturedLocation || undefined}
            />
          )}

          {/* Normal location permission - show when not using forced location AND not in developer mode */}
          {!forcedLocation && !developerMode && (
            <>
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
            </>
          )}

          {/* Show a button to use real location when in dev mode */}
          {!forcedLocation && developerMode && (
            <div className="flex flex-col items-center gap-2 p-4 border-2 border-dashed border-orange-300 rounded-lg bg-orange-50">
              <p className="text-sm font-medium text-orange-900">Or use your real location instead of test location:</p>
              <Button
                onClick={() => setDeveloperMode(false)}
                variant="outline"
                className="border-orange-300 hover:bg-orange-100"
              >
                <MapPin className="h-4 w-4 mr-2" />
                Use Real GPS Location
              </Button>
            </div>
          )}

          {/* Show forced location info */}
          {forcedLocation && (
            <Alert className="border-green-200 bg-green-50">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertTitle className="text-green-900">Using Test Location</AlertTitle>
              <AlertDescription className="text-green-800">
                📍 {forcedLocation.latitude.toFixed(6)}, {forcedLocation.longitude.toFixed(6)}
                <br />
                🎯 Accuracy: {forcedLocation.accuracy}m
              </AlertDescription>
            </Alert>
          )}
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
        <Card className="border-0 shadow-xl bg-white/95 backdrop-blur">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto w-20 h-20 bg-mint/10 rounded-full flex items-center justify-center mb-4">
              <CheckCircle className="h-10 w-10 text-mint" />
            </div>
            <CardTitle className="text-2xl font-rubik text-navy">
              Welcome to the Community!
            </CardTitle>
            <CardDescription className="text-navy/60">
              You're now connected with this location
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {validationResponse.is_admin && (
              <Alert className="border-coral/20 bg-coral/5">
                <Crown className="h-4 w-4 text-coral" />
                <AlertTitle className="text-navy font-rubik">You're the Founder!</AlertTitle>
                <AlertDescription className="text-navy/70">
                  As the first person here, you have admin privileges.
                  Shape the culture and vibe of your community.
                </AlertDescription>
              </Alert>
            )}

            <div className="bg-cream rounded-xl p-4">
              <h3 className="font-rubik font-semibold text-navy mb-3">What happens now?</h3>
              <ul className="space-y-2.5 text-sm text-navy/70">
                <li className="flex items-start gap-2">
                  <Users className="h-4 w-4 mt-0.5 text-coral" />
                  <span>Connect with others who visit this spot</span>
                </li>
                <li className="flex items-start gap-2">
                  <MessageSquare className="h-4 w-4 mt-0.5 text-coral" />
                  <span>Share stories and updates with the group</span>
                </li>
                {validationResponse.is_admin && (
                  <li className="flex items-start gap-2">
                    <Shield className="h-4 w-4 mt-0.5 text-coral" />
                    <span>Manage your community as it grows</span>
                  </li>
                )}
              </ul>
            </div>

            <Button
              onClick={() => navigate(`/community/${communityId}`, { state: { fromJoin: true } })}
              className="w-full bg-coral hover:bg-coral/90 text-white font-semibold py-6 text-lg rounded-full"
              size="lg"
            >
              <Users className="mr-2 h-5 w-5" />
              Enter Your Community
            </Button>
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
                onClick={() => navigate('/')}
                variant="outline"
                className={error.canRetry ? 'flex-1' : 'w-full'}
              >
                Go to Home
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Identity modal removed - users can upgrade after joining */}
    </div>
  );
};