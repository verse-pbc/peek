import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { LatLng } from 'leaflet';
import { useNostrContext } from '@/hooks/useNostrContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  MapPin,
  Users,
  MessageSquare,
  Clock,
  ChevronRight,
  Loader2,
  UserCircle,
  Crown,
  Sparkles,
  Navigation
} from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import { useNostrLogin } from '../lib/nostrify-shim';
import { useRelayManager } from '../contexts/RelayContext';
import { UserIdentityButton } from '@/components/UserIdentityButton';
import { DiscoveryService, DiscoveryMap as IDiscoveryMap } from '@/services/discovery-service';
import { MapLoadingSkeleton } from '@/components/map/MapLoadingSkeleton';

// Lazy load the map component to improve initial LCP
const DiscoveryMapComponent = lazy(() =>
  import('@/components/map/DiscoveryMap').then(module => ({
    default: module.DiscoveryMapComponent
  }))
);

const RELAY_URL = import.meta.env.VITE_RELAY_URL || 'wss://peek.hol.is';

interface Community {
  groupId: string;
  name: string;
  memberCount: number;
  lastActivity?: number;
  isAdmin: boolean;
  unreadCount?: number;
  location?: {
    latitude: number;
    longitude: number;
  };
  joinedAt?: number;
}

const Home = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useNostrContext();
  const { pubkey, login } = useNostrLogin();
  const { toast } = useToast();
  const { groupManager, connected } = useRelayManager();
  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejoinMessage, setRejoinMessage] = useState<string | null>(null);

  // Discovery map states
  const [discoveryMap, setDiscoveryMap] = useState<IDiscoveryMap | null>(null);
  const fogEnabled = true; // Always enabled, no toggle needed
  const [mapCenter, setMapCenter] = useState<LatLng>(new LatLng(37.7749, -122.4194)); // Default to SF, will update with user location
  const [flyToLocation, setFlyToLocation] = useState<LatLng | null>(null);
  const discoveryServiceRef = useRef<DiscoveryService | null>(null);

  // Dev mode detection - show "Create Dev Test Community" button when ?dev=true
  const urlParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const isDevMode = urlParams.get('dev') === 'true';

  useSeoMeta({
    title: 'Peek - Location-Based Communities',
    description: 'Connect with people at physical locations through QR codes',
  });

  // Check for navigation state message
  useEffect(() => {
    if (location.state?.message) {
      setRejoinMessage(location.state.message);
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  // Auto-center map on user location on load
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const userLocation = new LatLng(
            position.coords.latitude,
            position.coords.longitude
          );
          setMapCenter(userLocation);
          setFlyToLocation(userLocation);
          console.log('[Home] Auto-centered map on user location:', userLocation);
        },
        (error) => {
          console.warn('[Home] Could not get user location:', error.message);
          // Keep default SF coordinates if location access denied
        },
        {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 0
        }
      );
    }
  }, []); // Run once on mount

  // Load discovery map
  useEffect(() => {
    const loadDiscoveryMap = async () => {
      try {
        const service = new DiscoveryService(RELAY_URL);
        discoveryServiceRef.current = service;

        const map = await service.fetchDiscoveryMap();
        setDiscoveryMap(map);

        // Subscribe to updates
        const unsubscribe = service.subscribeToDiscoveryUpdates((updatedMap) => {
          setDiscoveryMap(updatedMap);
        });

        return () => {
          unsubscribe();
        };
      } catch (error) {
        console.error('Failed to load discovery map:', error);
      }
    };

    loadDiscoveryMap();

    return () => {
      if (discoveryServiceRef.current) {
        discoveryServiceRef.current.close();
      }
    };
  }, []);

  // Fetch user's communities
  useEffect(() => {
    // Wait for relay connection before fetching
    if (!connected || !groupManager) {
      return;
    }

    let isActive = true;
    let fetchCount = 0;

    const fetchCommunities = async () => {
      if (!isActive || !groupManager) return;
      fetchCount++;

      if (fetchCount === 1) {
        setLoading(true);
      }

      try {
        console.log('[Home] Fetching communities using NIP-29 events...');

        // Use GroupManager to get communities from NIP-29 events
        const userGroups = await groupManager.getUserGroups();
        console.log(`[Home] Found ${userGroups.length} communities from NIP-29 events`);

        // Convert to Community format for the UI
        const userCommunities: Community[] = userGroups.map(group => {
          // Try to get location from localStorage as fallback for UI
          const joinedGroups = JSON.parse(localStorage.getItem('joinedGroups') || '[]');
          const cachedGroupInfo = joinedGroups.find((g: { communityId: string }) => g.communityId === group.communityId);

          return {
            groupId: group.groupId,
            name: group.name,
            memberCount: group.memberCount,
            isAdmin: group.isAdmin,
            joinedAt: cachedGroupInfo?.joinedAt || Date.now() / 1000,
            location: cachedGroupInfo?.location
          };
        });

        // Sort by last activity (using joinedAt as fallback since we don't have lastActivity from NIP-29 yet)
        userCommunities.sort((a, b) => (b.joinedAt || 0) - (a.joinedAt || 0));

        if (isActive) {
          console.log('[Home] Setting communities from NIP-29 events:', userCommunities);
          setCommunities(userCommunities);
        }
      } catch (error) {
        console.error('[Home] Error fetching communities from NIP-29:', error);
        if (fetchCount === 1 && error && !(error instanceof TypeError && error.message?.includes('fetchEvents'))) {
          toast({
            title: 'Error',
            description: 'Failed to load your communities',
            variant: 'destructive'
          });
        }
        if (isActive) {
          setCommunities([]);
        }
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    };

    fetchCommunities();

    return () => {
      isActive = false;
    };
  }, [connected, groupManager, toast]);

  const formatTimeAgo = (timestamp?: number) => {
    if (!timestamp) return 'Never';

    const now = Date.now() / 1000;
    const diff = now - timestamp;

    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return new Date(timestamp * 1000).toLocaleDateString();
  };

  const handleCommunityClick = (groupId: string) => {
    navigate(`/community/${groupId}`);
  };

  const handleFlyToLocation = useCallback(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const userLocation = new LatLng(
            position.coords.latitude,
            position.coords.longitude
          );
          setFlyToLocation(userLocation);
          toast({
            title: "📍 Location found",
            description: "Centering map on your location",
          });
        },
        (error) => {
          toast({
            title: "Location error",
            description: error.message,
            variant: "destructive"
          });
        },
        {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 0
        }
      );
    }
  }, [toast]);

  const handleCreateTestCommunity = useCallback(() => {
    const uuid = crypto.randomUUID();
    navigate(`/c/${uuid}?dev=true`);
  }, [navigate]);

  if (!user || !pubkey) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md bg-card backdrop-blur shadow-2xl border-0">
          <CardHeader className="text-center pb-4">
            <div className="mx-auto w-20 h-20 bg-coral/10 rounded-full flex items-center justify-center mb-4">
              <MapPin className="h-10 w-10 text-coral" />
            </div>
            <CardTitle className="text-3xl font-rubik">Welcome to Peek</CardTitle>
            <CardDescription className="text-base">
              Connect with people at physical locations
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert className="border-coral/20 bg-coral/5 dark:bg-coral/10 dark:border-coral/30">
              <Sparkles className="h-4 w-4 text-coral" />
              <AlertDescription className="dark:text-foreground">
                Scan a Peek QR code with your phone camera to join location-based communities.
                No app installation required!
              </AlertDescription>
            </Alert>

            <Button
              onClick={login}
              className="w-full bg-coral hover:bg-coral/90 text-white font-semibold py-6 text-lg rounded-full"
              size="lg"
            >
              <UserCircle className="mr-2 h-5 w-5" />
              Login with Nostr
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              Use your existing Nostr account or create a new one
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Simplified Header */}
      <header className="bg-card/90 backdrop-blur shadow-md border-b-2 border-coral/20 sticky top-0 z-50">
        <div className="container mx-auto px-3 sm:px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 sm:w-10 sm:h-10 bg-coral rounded-full flex items-center justify-center">
                <span className="text-white font-rubik text-lg sm:text-xl font-bold">P</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-rubik font-bold">Peek</h1>
            </div>

            <div className="flex items-center gap-2">
              {isDevMode && (
                <Button
                  onClick={handleCreateTestCommunity}
                  variant="outline"
                  size="sm"
                  className="gap-2 border-coral hover:bg-coral/10"
                >
                  <MapPin className="h-4 w-4" />
                  <span className="hidden sm:inline">Create Dev Test</span>
                </Button>
              )}
              <UserIdentityButton />
            </div>
          </div>
        </div>
      </header>

      {/* Rejoin Message */}
      {rejoinMessage && (
        <div className="container mx-auto px-4 pt-4">
          <Alert className="border-peach bg-peach/10">
            <MapPin className="h-4 w-4 text-coral" />
            <AlertDescription className="text-navy">
              {rejoinMessage}
              <Button
                size="sm"
                variant="link"
                className="ml-2 p-0 h-auto text-coral hover:text-coral/70"
                onClick={() => setRejoinMessage(null)}
              >
                Dismiss
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      )}

      {/* Main Content - Map and Communities */}
      <main className="container mx-auto px-3 sm:px-4 py-3 sm:py-4">
        {/* Discovery Map Section */}
        <div className="mb-6">
          <div className="bg-card rounded-2xl shadow-lg overflow-hidden">
            {/* Map Header */}
            <div className="p-4 border-b border-border">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-rubik font-bold">
                    Discover Communities
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {discoveryMap ? `${discoveryMap.points.length} spots nearby` : 'Loading map...'}
                  </p>
                </div>
                <Button
                  onClick={handleFlyToLocation}
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-2 border-coral/30 hover:bg-coral/10"
                  title="Center on my location"
                >
                  <Navigation className="h-4 w-4" />
                  My Location
                </Button>
              </div>
            </div>

            {/* Map Container - Lazy loaded */}
            <Suspense fallback={<MapLoadingSkeleton />}>
              <DiscoveryMapComponent
                discoveryMap={discoveryMap}
                fogEnabled={fogEnabled}
                mapCenter={mapCenter}
                flyToLocation={flyToLocation}
              />
            </Suspense>
          </div>
        </div>

        {/* Your Communities Section */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-rubik font-bold">
              Your Communities
            </h2>
            <Badge className="bg-coral/10 text-coral border-0 px-3 py-1">
              {communities.length} joined
            </Badge>
          </div>

          {loading ? (
            <Card className="bg-card border-0 shadow-lg">
              <CardContent className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-coral" />
              </CardContent>
            </Card>
          ) : communities.length === 0 ? (
            <Card className="bg-card border-0 shadow-lg">
              <CardContent className="text-center py-12">
                <div className="max-w-sm mx-auto space-y-4">
                  <div className="w-24 h-24 bg-coral/10 rounded-full flex items-center justify-center mx-auto">
                    <MapPin className="h-12 w-12 text-coral" />
                  </div>
                  <div>
                    <h3 className="text-xl font-rubik font-bold mb-2">
                      No communities yet
                    </h3>
                    <p className="text-muted-foreground mb-6">
                      Find QR codes in the wild and scan them to join your first community!
                    </p>
                  </div>

                  <Alert className="text-left bg-mint/10 border-mint/20 dark:bg-mint/20 dark:border-mint/30">
                    <Crown className="h-4 w-4 text-mint" />
                    <AlertDescription className="dark:text-foreground">
                      <strong>Pro tip:</strong> Be the first to scan an unclaimed QR code
                      to become the founder with admin powers!
                    </AlertDescription>
                  </Alert>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {communities.map((community) => (
                <Card
                  key={community.groupId}
                  className="cursor-pointer bg-card hover:shadow-xl transition-all duration-200 border-0 shadow-md overflow-hidden group"
                  onClick={() => handleCommunityClick(community.groupId)}
                >
                  <CardHeader className="pb-3 bg-gradient-to-br from-coral/5 to-peach/5">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg font-rubik line-clamp-1">
                          {community.name}
                        </CardTitle>
                        <CardDescription className="flex items-center gap-2 mt-1">
                          <Users className="h-3 w-3" />
                          <span>{community.memberCount} members</span>
                        </CardDescription>
                      </div>
                      {community.isAdmin && (
                        <Badge className="bg-coral text-white border-0">
                          <Crown className="h-3 w-3 mr-1" />
                          Founder
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="pt-3">
                    <div className="space-y-3">
                      {community.location && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          <span className="text-xs">
                            Location verified
                          </span>
                        </div>
                      )}

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          <span>{formatTimeAgo(community.lastActivity)}</span>
                        </div>

                        {community.unreadCount && community.unreadCount > 0 && (
                          <Badge className="bg-coral text-white border-0 h-5 min-w-[20px] px-1">
                            {community.unreadCount}
                          </Badge>
                        )}
                      </div>

                      <Button
                        className="w-full bg-coral/10 hover:bg-coral hover:text-white text-coral transition-colors rounded-full font-semibold group-hover:bg-coral group-hover:text-white"
                        size="sm"
                      >
                        <MessageSquare className="h-4 w-4 mr-2" />
                        Open Community
                        <ChevronRight className="h-4 w-4 ml-auto" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Home;