import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { useNostrContext } from '@/hooks/useNostrContext';
import { NDKKind } from '@/lib/ndk-shim';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  MapPin,
  Users,
  MessageSquare,
  Shield,
  Clock,
  AlertCircle,
  ChevronRight,
  Loader2,
  UserCircle,
  Settings,
  LogOut
} from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import { useNostrLogin } from '../lib/nostrify-shim';

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
  const { ndk, user } = useNostrContext();
  const { pubkey, npub, logout, login } = useNostrLogin();
  const { toast } = useToast();
  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('communities');
  const [rejoinMessage, setRejoinMessage] = useState<string | null>(null);

  useSeoMeta({
    title: 'Peek - Location-Based Communities',
    description: 'Connect with people at physical locations through QR codes',
  });

  // Check for navigation state message (e.g., from Community page redirect)
  useEffect(() => {
    if (location.state?.message) {
      setRejoinMessage(location.state.message);
      // Clear the navigation state to prevent message from persisting on refresh
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  // Fetch user's communities from localStorage and enrich with relay data
  useEffect(() => {
    let isActive = true;
    let fetchCount = 0;

    const fetchCommunities = async () => {
      // Skip if component unmounted
      if (!isActive) return;

      fetchCount++;

      // Don't set loading on polling updates
      if (fetchCount === 1) {
        setLoading(true);
      }

      const userCommunities: Community[] = [];

      try {
        // Get joined communities from localStorage
        const joinedGroups = JSON.parse(localStorage.getItem('joinedGroups') || '[]');

        if (joinedGroups.length === 0) {
          setCommunities([]);
          setLoading(false);
          return;
        }

        // For each joined community, create a community object
        for (const groupInfo of joinedGroups) {
          const communityId = groupInfo.communityId;
          const groupId = communityId; // Use the community ID directly for navigation

          const community: Community = {
            groupId,
            name: `Community ${communityId.slice(0, 8)}`, // Default name
            memberCount: 0,
            isAdmin: groupInfo.isAdmin || false, // Get admin status from localStorage
            joinedAt: groupInfo.joinedAt || Date.now() / 1000,
            location: groupInfo.location // Include location if stored
          };

          // Try to fetch metadata from relay if ndk is available
          if (ndk && ndk.fetchEvents) {
            try {
              // Fetch group metadata (kind 39000)
              const metadataFilter = {
                kinds: [39000 as NDKKind],
                '#d': [`peek-${communityId}`], // Use full group ID for relay queries
                limit: 1
              };

              const metadataEvents = await ndk.fetchEvents(metadataFilter);

              if (metadataEvents && metadataEvents.size > 0) {
                const metadataEvent = Array.from(metadataEvents)[0];
                // Extract name from tags
                const nameTag = (metadataEvent as Event & { tags: string[][] }).tags.find(
                  (tag: string[]) => tag[0] === 'name'
                );
                if (nameTag && nameTag[1]) {
                  community.name = nameTag[1];
                }
              }
            } catch (error) {
              console.warn('Failed to fetch metadata for', communityId, error);
            }

            // Try to fetch recent activity and member count
            if (ndk && ndk.fetchEvents) {
              try {
                // Fetch recent activity (last message in group)
                const messagesFilter = {
                  kinds: [9 as NDKKind],
                  '#h': [`peek-${communityId}`],
                  limit: 1
                };

                const messageEvents = await ndk.fetchEvents(messagesFilter);

                for (const event of messageEvents) {
                  community.lastActivity = (event as Event & { created_at: number }).created_at;
                  break;
                }

                // Count members from the kind 39002 event
                const memberListFilter = {
                  kinds: [39002 as NDKKind],
                  '#d': [`peek-${communityId}`],
                  limit: 1
                };

                const memberListEvents = await ndk.fetchEvents(memberListFilter);

                if (memberListEvents && memberListEvents.size > 0) {
                  const memberListEvent = Array.from(memberListEvents)[0];
                  // Count p-tags to get member count
                  const pTags = (memberListEvent as Event & { tags: string[][] }).tags.filter(
                    (tag: string[]) => tag[0] === 'p'
                  );
                  community.memberCount = pTags.length;
                }
              } catch (error) {
                console.warn('Failed to fetch activity/members for', communityId, error);
              }
            }

          }

          userCommunities.push(community);
        }

        // Sort by last activity
        userCommunities.sort((a, b) => (b.lastActivity || 0) - (a.lastActivity || 0));
        if (isActive) {
          setCommunities(userCommunities);
        }
      } catch (error) {
        console.error('Error fetching communities:', error);
        // Only show error toast on first fetch, not on polling
        // Also don't show for missing fetchEvents method
        if (fetchCount === 1 && error && !(error instanceof TypeError && error.message?.includes('fetchEvents'))) {
          toast({
            title: 'Error',
            description: 'Failed to load your communities',
            variant: 'destructive'
          });
        }
        // Set empty communities array on error
        if (isActive) {
          setCommunities([]);
        }
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    };

    // Initial fetch
    fetchCommunities();

    // Set up polling with 2 second interval
    const pollInterval = setInterval(fetchCommunities, 2000);

    // Cleanup
    return () => {
      isActive = false;
      clearInterval(pollInterval);
    };
  }, [ndk, toast]); // Include toast and ndk as dependencies

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
    // Navigate to the community page - groupId is already the communityId from localStorage
    navigate(`/community/${groupId}`);
  };

  const handleProfileClick = () => {
    navigate('/profile');
  };

  const handleLogout = async () => {
    await logout();
    toast({
      title: 'Logged out',
      description: 'You have been logged out successfully'
    });
  };

  if (!user || !pubkey) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-blue-50 dark:from-gray-900 dark:to-gray-800">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <MapPin className="h-8 w-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">Welcome to Peek</CardTitle>
            <CardDescription>
              Connect with people at physical locations
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Scan a Peek QR code with your phone camera to join location-based communities.
                No app installation required!
              </AlertDescription>
            </Alert>

            <Button onClick={login} className="w-full" size="lg">
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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                <MapPin className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Peek</h1>
                <p className="text-xs text-muted-foreground">Location Communities</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={handleProfileClick}>
                <Settings className="h-5 w-5" />
              </Button>

              <div className="flex items-center gap-3 pl-3 border-l">
                <Avatar className="h-8 w-8">
                  <AvatarFallback>
                    {npub?.slice(4, 6).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="hidden sm:block">
                  <p className="text-sm font-medium">{npub?.slice(0, 8)}...</p>
                  <p className="text-xs text-muted-foreground">Connected</p>
                </div>
                <Button variant="ghost" size="icon" onClick={handleLogout}>
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Rejoin Message Alert */}
      {rejoinMessage && (
        <div className="container mx-auto px-4 pt-4">
          <Alert className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950">
            <MapPin className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <AlertDescription className="text-amber-900 dark:text-amber-100">
              {rejoinMessage}
              <Button
                size="sm"
                variant="link"
                className="ml-2 p-0 h-auto text-amber-700 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-200"
                onClick={() => setRejoinMessage(null)}
              >
                Dismiss
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      )}

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="communities">Communities</TabsTrigger>
            <TabsTrigger value="discover">How it Works</TabsTrigger>
          </TabsList>

          <TabsContent value="communities" className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-semibold">Your Communities</h2>
              <Badge variant="secondary">
                {communities.length} joined
              </Badge>
            </div>

            {loading ? (
              <Card>
                <CardContent className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </CardContent>
              </Card>
            ) : communities.length === 0 ? (
              <Card>
                <CardContent className="text-center py-12">
                  <MapPin className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No communities yet</h3>
                  <p className="text-sm text-muted-foreground mb-6">
                    Scan a Peek QR code with your phone camera to join your first community
                  </p>
                  <Alert className="text-left max-w-md mx-auto">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      <strong>How to join:</strong> Use your phone's camera app to scan a Peek QR code.
                      You'll be taken directly to the join page - no app download needed!
                    </AlertDescription>
                  </Alert>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {communities.map((community) => (
                  <Card
                    key={community.groupId}
                    className="cursor-pointer hover:shadow-lg transition-shadow"
                    onClick={() => handleCommunityClick(community.groupId)}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-lg line-clamp-1">
                            {community.name}
                          </CardTitle>
                          <CardDescription className="flex items-center gap-2 mt-1">
                            <Users className="h-3 w-3" />
                            <span>{community.memberCount} members</span>
                          </CardDescription>
                        </div>
                        {community.isAdmin && (
                          <Badge variant="default" className="ml-2">
                            <Shield className="h-3 w-3 mr-1" />
                            Admin
                          </Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {community.location && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <MapPin className="h-3 w-3" />
                            <span className="text-xs">
                              {community.location.latitude.toFixed(4)}, {community.location.longitude.toFixed(4)}
                            </span>
                          </div>
                        )}

                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            <span>{formatTimeAgo(community.lastActivity)}</span>
                          </div>

                          {community.unreadCount && community.unreadCount > 0 && (
                            <Badge variant="destructive" className="h-5 min-w-[20px] px-1">
                              {community.unreadCount}
                            </Badge>
                          )}
                        </div>

                        <Button
                          variant="ghost"
                          className="w-full justify-between"
                          size="sm"
                        >
                          <span className="flex items-center gap-2">
                            <MessageSquare className="h-4 w-4" />
                            Open Chat
                          </span>
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="discover" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>How Peek Works</CardTitle>
                <CardDescription>
                  Join location-based communities by proving physical presence
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-4">
                  <div className="flex gap-4">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-bold text-primary">1</span>
                    </div>
                    <div>
                      <h3 className="font-medium mb-1">Find a QR Code</h3>
                      <p className="text-sm text-muted-foreground">
                        Look for Peek QR codes at physical locations like cafes, events, or public spaces
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-bold text-primary">2</span>
                    </div>
                    <div>
                      <h3 className="font-medium mb-1">Scan with Camera</h3>
                      <p className="text-sm text-muted-foreground">
                        Use your phone's built-in camera app to scan the QR code - no special app needed
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-bold text-primary">3</span>
                    </div>
                    <div>
                      <h3 className="font-medium mb-1">Prove Your Location</h3>
                      <p className="text-sm text-muted-foreground">
                        Share your GPS location once to verify you're physically present (within 25 meters)
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-bold text-primary">4</span>
                    </div>
                    <div>
                      <h3 className="font-medium mb-1">Join & Connect</h3>
                      <p className="text-sm text-muted-foreground">
                        Once verified, you're part of the community and can chat with others who've been there
                      </p>
                    </div>
                  </div>
                </div>

                <Alert>
                  <Shield className="h-4 w-4" />
                  <AlertDescription>
                    <strong>First Scanner Bonus:</strong> If you're the first to scan a new QR code,
                    you become the community admin with moderation privileges.
                  </AlertDescription>
                </Alert>

                <Alert>
                  <MapPin className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Privacy:</strong> Communities are private and closed. Only people who
                    physically visit the location can join. Your exact location is never shared with others.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Home;