import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LocationPermission } from '../components/LocationPermission';
import { CommunityPreview } from '../components/CommunityPreview';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import {
  CheckCircle,
  AlertCircle,
  MapPin,
  Loader2,
  RefreshCw,
  ChevronLeft
} from 'lucide-react';
import { useNostrLogin } from '../lib/nostr-identity';
import { NostrLocationService, type LocationValidationResponse } from '../services/nostr-location';
import { useToast } from '@/hooks/useToast';
import { useRelayManager } from '@/contexts/RelayContext';
import { setupNostrIdentity } from '../lib/nostr-identity-helper';
import { parseValidationError, parseExceptionError } from '../lib/join-flow-errors';
import {
  isCommunityMember,
  upsertJoinedGroup
} from '../services/community-storage';
import { subscribeToCommunity } from '../services/notifications';
import { isDeviceRegistered, hasUserDisabledPush } from '../lib/pushStorage';
import { requestNotificationPermission, getFCMToken, registerDevice } from '../services/push';

// Lazy load GeohashLocationPicker and its heavy Leaflet dependencies (~185KB)
// Only loads when dev mode is enabled (?dev=true)
const GeohashLocationPicker = React.lazy(() => import('../components/GeohashLocationPicker').then(module => ({ default: module.GeohashLocationPicker })));

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

interface JoinFlowProps {
  onJoinSuccess: (groupId: string) => void;
}

export const JoinFlow: React.FC<JoinFlowProps> = ({ onJoinSuccess }) => {
  const { t } = useTranslation();
  const { communityId } = useParams<{ communityId: string }>();
  const navigate = useNavigate();
  const { pubkey, login, identity } = useNostrLogin();
  const { toast } = useToast();
  const { relayManager, groupManager, connected, waitForConnection } = useRelayManager();

  // Flow state
  const [currentStep, setCurrentStep] = useState<JoinStep>(JoinStep.LOADING);
  const [previewData, setPreviewData] = useState<CommunityPreviewData | null>(null);
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
  // Removed: now using previewData.member_count to determine if creating vs joining

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
          title: devModeEnabled ? t('join_flow.dev_mode.disabled') : t('join_flow.dev_mode.enabled'),
          description: devModeEnabled ? t('join_flow.dev_mode.disabled_desc') : t('join_flow.dev_mode.enabled_desc')
        });
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [devModeEnabled, toast]);

  // Check if user is logged in (skip for initial preview)
  useEffect(() => {
    // Only require login when actually trying to join, not for preview
    if (!pubkey && currentStep === JoinStep.LOCATION) {
      // Prompt user to login first
      setError({
        message: t('join_flow.error.not_logged_in'),
        code: 'NOT_LOGGED_IN',
        canRetry: false
      });
      setCurrentStep(JoinStep.ERROR);
    }
  }, [pubkey, currentStep]);

  const fetchPreview = useCallback(async () => {
    if (!communityId) return;

    try {
      // Set up identity and encryption using data-oriented helper (pure function)
      const identitySetup = setupNostrIdentity(identity, pubkey);

      if (!relayManager) {
        throw new Error(t('join_flow.error.not_initialized'));
      }

      const nostrService = new NostrLocationService(
        identitySetup.secretKey,
        identitySetup.publicKey,
        relayManager,
        identitySetup.encryptionHelper
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
          name: response.name || t('join_flow.title.join_generic'),
          description: response.about || t('home.description'),
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
          name: t('join_flow.title.join_generic'),
          description: t('join_flow.preview.create_prompt'),
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
        message: err instanceof Error ? err.message : t('errors.preview.failed'),
        code: 'PREVIEW_FAILED',
        canRetry: true
      });
      setCurrentStep(JoinStep.ERROR);
    }
  }, [communityId, identity?.type === 'local' ? identity.secretKey : undefined, pubkey, relayManager]);

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
        message: t('join_flow.error.invalid_community'),
        code: 'INVALID_COMMUNITY',
        canRetry: false
      });
      setCurrentStep(JoinStep.ERROR);
      return;
    }

    // Set up identity and encryption using data-oriented helper (pure function)
    const identitySetup = setupNostrIdentity(identity, pubkey);

    try {
      if (!relayManager) {
        throw new Error(t('join_flow.error.not_initialized'));
      }

      console.log('Validating location via gift wrap:', {
        communityId,
        accuracy: location.accuracy,
        userPubkey: identitySetup.publicKey,
        usingAnonymous: identitySetup.usingAnonymous
      });

      // NostrLocationService will use secretKey for gift wrap decryption
      // and encryptionHelper (if provided) for seal encryption/decryption
      const nostrService = new NostrLocationService(
        identitySetup.secretKey,
        identitySetup.publicKey,
        relayManager,
        identitySetup.encryptionHelper
      );

      // Send validation request via NIP-59 gift wrap
      const response = await nostrService.validateLocation(communityId, location);
      // No need to close - RelayManager is managed globally

      console.log('Validation response:', response);

      if (response.success) {
        // Success! User has been added to (or is already in) the NIP-29 group

        // Check if this is a re-validation (user already in localStorage)
        const wasAlreadyMember = isCommunityMember(communityId);

        // Show appropriate toast message
        if (wasAlreadyMember && !response.is_admin) {
          // Re-validation of existing member
          toast({
            title: t('join_flow.success.welcome_back'),
            description: t('join_flow.success.already_member'),
          });
        } else {
          // New member or admin
          toast({
            title: t('join_flow.success.joined'),
            description: response.is_admin
              ? t('join_flow.success.admin_welcome')
              : t('join_flow.success.member_welcome'),
          });
        }

        // Store the group information using data-oriented storage service
        if (response.group_id && response.relay_url) {
          upsertJoinedGroup({
            communityId,
            groupId: response.group_id,
            location: capturedLocation || forcedLocation || undefined,
            isAdmin: response.is_admin || false
          });
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

        // Skip SUCCESS step - go directly to community feed
        if (response.group_id) {
          console.log(`[JoinFlow] Auto-navigating to community feed`);

          // Auto-enable push notifications on first community join (if not disabled)
          if (identity && relayManager) {
            const alreadyRegistered = isDeviceRegistered()
            const userDisabled = hasUserDisabledPush()
            const permissionStatus = typeof Notification !== 'undefined' ? Notification.permission : 'denied'

            if (alreadyRegistered) {
              // Already registered - just subscribe to this community
              console.log('[JoinFlow] User has notifications enabled, subscribing to community...');
              subscribeToCommunity(response.group_id, identity, (event) => relayManager.publishEvent(event))
                .then((success) => {
                  if (success) {
                    console.log('[JoinFlow] Successfully subscribed to community notifications');
                  }
                })
                .catch((error) => {
                  console.error('[JoinFlow] Error subscribing to notifications:', error);
                });
            } else if (!userDisabled && permissionStatus === 'default') {
              // Not registered, user hasn't disabled, permission not decided
              // Auto-prompt for permission on first join
              console.log('[JoinFlow] Auto-prompting for push notification permission on first join');

              requestNotificationPermission()
                .then(async (permission) => {
                  if (permission === 'granted') {
                    console.log('[JoinFlow] Permission granted, auto-registering...');

                    // Get FCM token
                    const fcmToken = await getFCMToken();
                    if (fcmToken) {
                      // Register device
                      const registered = await registerDevice(
                        fcmToken,
                        identity,
                        (event) => relayManager.publishEvent(event)
                      );

                      if (registered) {
                        // Subscribe to this community
                        await subscribeToCommunity(
                          response.group_id!,
                          identity,
                          (event) => relayManager.publishEvent(event)
                        );
                        console.log('[JoinFlow] Auto-enabled push notifications for first community');
                      }
                    }
                  } else {
                    console.log('[JoinFlow] Permission denied, user can enable later in settings');
                  }
                })
                .catch((error) => {
                  console.error('[JoinFlow] Auto-prompt failed:', error);
                });
            }
          }

          onJoinSuccess(response.group_id);
        }
      } else {
        // Validation failed - parse error using data-oriented function
        const errorMessage = response.error || 'Location validation failed';
        const errorCode = response.error_code || 'VALIDATION_FAILED';

        const parsedError = parseValidationError(errorMessage, errorCode);
        setError(parsedError);
        setCurrentStep(JoinStep.ERROR);
      }
    } catch (err: unknown) {
      console.error('Location validation error:', err);

      // Parse exception using data-oriented function
      const parsedError = parseExceptionError(err);
      setError(parsedError);
      setCurrentStep(JoinStep.ERROR);
    }
  }, [communityId, identity?.type === 'local' ? identity.secretKey : undefined, pubkey, relayManager, toast]);

  const handleLocationCaptured = useCallback(async (location: {
    latitude: number;
    longitude: number;
    accuracy: number;
    timestamp: number;
  }) => {
    setCapturedLocation(location);

    // Show location capture success
    toast({
      title: t('location.captured.toast'),
      description: t('location.captured.toast_accuracy', { accuracy: location.accuracy.toFixed(1) }),
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
        message: t('join_flow.error.connection_failed'),
        code: 'CONNECTION_FAILED',
        canRetry: true
      });
      setCurrentStep(JoinStep.ERROR);
    }
  }, [toast, waitForConnection, validateLocation]);

  const handleLocationDenied = useCallback(() => {
    setError({
      message: t('location.permission.required'),
      code: 'PERMISSION_DENIED',
      canRetry: true
    });
    setCurrentStep(JoinStep.ERROR);
  }, [t]);

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

  return (
    <div id="app-wrapper" className="min-h-screen bg-cover bg-center p-4 pt-12 sm:p-8 sm:pt-24" style={{ backgroundImage: 'url(/sticker-wall.jpg)' }}>
      {/* Logo overlapping the wrapper */}
      <div className="container mx-auto max-w-4xl relative">
        <div className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
          <img src="/qr-chat.svg" alt="Peek Logo" className="sm:w-64 sm:h-64" style={{ width: '9rem', height: '9rem' }} />
        </div>
      </div>
      <div id="content-wrapper" className="container mx-auto px-4 py-8 max-w-4xl border-[3px] border-solid border-black" style={{ borderRadius: 0, backgroundColor: '#FFF3E4', paddingTop: '3rem', paddingBottom: '3rem' }}>
        {/* Header */}
        <div style={{ marginBottom: '2rem' }}>
          <h1 className="text-3xl font-bold mb-2 text-center text-black" style={{ fontFamily: "'Integral CF', sans-serif", fontSize: '2.2rem', lineHeight: '1.15', transform: 'rotate(-3deg)' }}>
            {previewData?.member_count === 0
              ? <>You've discovered<br /><span className="bg-coral" style={{ padding: '4px 8px', boxShadow: '5px 5px 0 0 black' }}>an unclaimed spot!</span></>
              : previewData?.name
                ? <>Join <span className="bg-coral" style={{ padding: '4px 8px', boxShadow: '5px 5px 0 0 black' }}>{previewData.name}</span></>
                : 'Join Community'}
          </h1>
          <style>{`
            @media (min-width: 640px) {
              #content-wrapper {
                padding-left: 2rem;
                padding-right: 2rem;
                max-width: 35rem;
              }
              #content-wrapper h1 {
                font-size: 3.3rem !important;
              }
            }
          `}</style>
        </div>

      <div id="join-container">
      {/* Loading State */}
      {currentStep === JoinStep.LOADING && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
            <p className="text-lg font-medium">{t('join_flow.loading.title')}</p>
            <p className="text-sm text-muted-foreground mt-2">{t('join_flow.loading.description')}</p>
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
          {/* Geohash location picker - only when developer mode is enabled */}
          {developerMode && (
            <Suspense fallback={
              <Card>
                <CardContent className="flex items-center justify-center py-12">
                  <Loader2 className="h-12 w-12 animate-spin text-primary" />
                </CardContent>
              </Card>
            }>
              <GeohashLocationPicker
                onLocationSelected={(location) => {
                  setForcedLocation(location);
                  handleLocationCaptured(location);
                }}
                initialLocation={capturedLocation || undefined}
              />
            </Suspense>
          )}

          {/* Normal location permission - show when not using forced location AND not in developer mode */}
          {!forcedLocation && !developerMode && (
            <>
              <Alert variant="info">
                <MapPin className="h-4 w-4" />
                <AlertTitle>{t('join_flow.location_step.presence_required')}</AlertTitle>
                <AlertDescription>
                  {t('join_flow.location_step.presence_description')}
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


          {/* Show forced location info */}
          {forcedLocation && (
            <Alert className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20">
              <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
              <AlertTitle className="text-green-900 dark:text-green-100">{t('join_flow.location_step.test_location')}</AlertTitle>
              <AlertDescription className="text-green-800 dark:text-green-200">
                {t('join_flow.location_step.test_coords', { lat: forcedLocation.latitude.toFixed(6), lng: forcedLocation.longitude.toFixed(6) })}
                <br />
                {t('join_flow.location_step.test_accuracy', { accuracy: forcedLocation.accuracy })}
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
              <MapPin className="h-16 w-16 text-muted-foreground" />
              <Loader2 className="h-16 w-16 absolute inset-0 animate-spin text-primary" />
            </div>
            <p className="text-lg font-medium">{t('join_flow.validating.title')}</p>
            <div className="mt-4 space-y-2 text-center">
              <p className="text-sm text-muted-foreground">
                {t('join_flow.validating.description')}
              </p>
              <p className="text-xs text-muted-foreground">
                {t('join_flow.validating.timeout_notice')}
              </p>
            </div>
            {capturedLocation && (
              <div className="mt-6 space-y-1">
                <div className="text-xs text-muted-foreground font-mono">
                  {t('join_flow.validating.accuracy_info', { accuracy: capturedLocation.accuracy.toFixed(1) })}
                  {capturedLocation.accuracy <= 20 && (
                    <span className="ml-2 text-green-600 dark:text-green-400">{t('join_flow.validating.accuracy_good')}</span>
                  )}
                  {capturedLocation.accuracy > 20 && (
                    <span className="ml-2 text-yellow-600 dark:text-yellow-400">{t('join_flow.validating.accuracy_low')}</span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {t('join_flow.validating.coords', { lat: capturedLocation.latitude.toFixed(6), lng: capturedLocation.longitude.toFixed(6) })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Success Step - Removed: now auto-navigates to community feed */}

      {/* Error Step */}
      {currentStep === JoinStep.ERROR && error && (
        <Card className="border-red-200">
          <CardHeader>
            <div className="flex items-center gap-3">
              <XCircle className="h-8 w-8 text-red-600" />
              <div>
                <CardTitle className="text-red-900">
                  {t('join_flow.error.title')}
                </CardTitle>
                <CardDescription>
                  {error.code || t('join_flow.error.code_fallback')}
                </CardDescription>
              </div>
              <h2 className="font-rubik font-bold text-2xl mb-2">
                {error.code === 'PERMISSION_DENIED' ? "Location Access Needed" :
                 error.code === 'LOCATION_TOO_FAR' ? "Too Far Away" :
                 error.code === 'ACCURACY_TOO_LOW' ? "GPS Signal Too Weak" :
                 "Unable to Join"}
              </h2>
              <p className="text-muted-foreground">
                {error.code === 'PERMISSION_DENIED'
                  ? "We need your location to verify you're at this community"
                  : error.code === 'LOCATION_TOO_FAR'
                  ? "You need to be at the physical location to join"
                  : error.code === 'ACCURACY_TOO_LOW'
                  ? "We need a clearer GPS signal to verify your location"
                  : "Something went wrong"}
              </p>
            </div>

            {/* Error Message */}
            <Alert className="border-coral/20 bg-coral/5 dark:bg-coral/10 dark:border-coral/30">
              <AlertCircle className="h-4 w-4 text-coral" />
              <AlertDescription className="dark:text-foreground">
                {error.message}
              </AlertDescription>
            </Alert>

            {/* Tips for LOCATION_TOO_FAR */}
            {error.code === 'LOCATION_TOO_FAR' && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 dark:bg-yellow-900/20 dark:border-yellow-800">
                <h3 className="font-medium text-yellow-900 mb-1 dark:text-yellow-100">{t('join_flow.error.tips_title')}</h3>
                <ul className="text-sm text-yellow-800 space-y-1 dark:text-yellow-200">
                  <li>• {t('join_flow.error.tips.at_location')}</li>
                  <li>• {t('join_flow.error.tips.stand_closer')}</li>
                  <li>• {t('join_flow.error.tips.enable_accuracy')}</li>
                </ul>
              </div>
            )}

            {/* Tips for ACCURACY_TOO_LOW */}
            {error.code === 'ACCURACY_TOO_LOW' && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 dark:bg-yellow-900/20 dark:border-yellow-800">
                <h3 className="font-medium text-yellow-900 mb-1 dark:text-yellow-100">{t('join_flow.error.improve_gps_title')}</h3>
                <ul className="text-sm text-yellow-800 space-y-1 dark:text-yellow-200">
                  <li>• {t('join_flow.error.improve_gps.open_area')}</li>
                  <li>• {t('join_flow.error.improve_gps.enable_wifi')}</li>
                  <li>• {t('join_flow.error.improve_gps.wait')}</li>
                </ul>
              </div>
            )}

            {/* Tips for PERMISSION_DENIED */}
            {error.code === 'PERMISSION_DENIED' && (
              <div className="bg-mint/10 border border-mint/20 rounded-xl p-4 dark:bg-mint/20 dark:border-mint/30">
                <h3 className="font-rubik font-semibold text-sm mb-2 dark:text-foreground">How to enable location:</h3>
                <ul className="space-y-1.5 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="text-mint mt-0.5">•</span>
                    <span>Check your browser's address bar for a location icon</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-mint mt-0.5">•</span>
                    <span>Enable location permissions in your browser settings</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-mint mt-0.5">•</span>
                    <span>Make sure location services are enabled on your device</span>
                  </li>
                </ul>
              </div>
            )}

            {/* Action Buttons */}
            <div className="space-y-3">
              {error.canRetry && (
                <Button
                  onClick={handleRetry}
                  className="w-full bg-coral hover:bg-coral/90 text-white font-semibold rounded-full"
                  size="lg"
                >
                  {t('common.buttons.retry')}
                </Button>
              )}
              <Button
                onClick={() => navigate('/')}
                variant="outline"
                className="w-full border-coral/30 hover:bg-coral/5 rounded-full"
                size="lg"
              >
                {t('common.buttons.back')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Identity modal removed - users can upgrade after joining */}
      </div>
      </div>
    </div>
  );
};