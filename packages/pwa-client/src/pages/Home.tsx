import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { useNostrContext } from '@/hooks/useNostrContext';
import { NDKEvent, NDKKind } from '@/lib/ndk-shim';
import { nip19 } from 'nostr-tools';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  const { ndk, user } = useNostrContext();
  const { pubkey, npub, logout, login } = useNostrLogin();
  const { toast } = useToast();
  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('communities');

  useSeoMeta({
    title: 'Peek - Location-Based Communities',
    description: 'Connect with people at physical locations through QR codes',
  });

  // Fetch user's communities from NIP-29 groups
  useEffect(() => {
    if (!ndk || !user) {
      setLoading(false);
      return;
    }

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
        // Check if fetchEvents method exists
        if (!ndk.fetchEvents) {
          console.warn('NDK fetchEvents method not available');
          setCommunities([]);
          setLoading(false);
          return;
        }

        // Fetch groups where user is a member (kind 9000 with user's p-tag)
        const memberFilter = {
          kinds: [9000 as NDKKind],
          '#p': [user.pubkey],
          limit: 100
        };

        const memberEvents = await ndk.fetchEvents(memberFilter);
        const groupIds = new Set<string>();

        // Extract unique group IDs
        if (memberEvents && memberEvents.size > 0) {
          for (const event of memberEvents) {
            const hTag = event.tags.find(tag => tag[0] === 'h');
            if (hTag && hTag[1]) {
              groupIds.add(hTag[1]);
            }
          }
        }

        // For each group, fetch metadata and check admin status
        for (const groupId of groupIds) {
          const community: Community = {
            groupId,
            name: groupId.replace('peek-', 'Community '), // Default name
            memberCount: 0,
            isAdmin: false,
            joinedAt: Date.now() / 1000
          };

          // Check if user is admin (kind 9002 with permission tag)
          const adminFilter = {
            kinds: [9002 as NDKKind],
            '#h': [groupId],
            '#p': [user.pubkey],
            limit: 1
          };

          const adminEvents = await ndk.fetchEvents(adminFilter);

          for (const event of adminEvents) {
            const permissionTag = event.tags.find(tag => tag[0] === 'permission');
            if (permissionTag && permissionTag[1] === 'add-user') {
              community.isAdmin = true;
              break;
            }
          }

          // Fetch recent activity (last message in group)
          const messagesFilter = {
            kinds: [9 as NDKKind],
            '#h': [groupId],
            limit: 1
          };

          const messageEvents = await ndk.fetchEvents(messagesFilter);

          for (const event of messageEvents) {
            community.lastActivity = event.created_at;
            break;
          }

          // Count members
          const allMembersFilter = {
            kinds: [9000 as NDKKind],
            '#h': [groupId],
            limit: 500
          };

          const allMemberEvents = await ndk.fetchEvents(allMembersFilter);
          const uniqueMembers = new Set<string>();

          for (const event of allMemberEvents) {
            const pTag = event.tags.find(tag => tag[0] === 'p');
            if (pTag && pTag[1]) {
              uniqueMembers.add(pTag[1]);
            }
          }

          community.memberCount = uniqueMembers.size;

          // Try to extract location from group metadata if available
          // This would be stored in a kind 30078 event in production
          if (groupId.startsWith('peek-')) {
            // Mock location for demo
            community.location = {
              latitude: -34.919143 + Math.random() * 0.01,
              longitude: -56.161693 + Math.random() * 0.01
            };
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
  }, [ndk, user?.pubkey]); // Only depend on user.pubkey, not the whole user object

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
    // Extract community ID from group ID (e.g., "peek-uuid" -> "uuid")
    const communityId = groupId.replace('peek-', '');
    navigate(`/community/${communityId}`);
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