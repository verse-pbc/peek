import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { SimplePool, type Filter } from 'nostr-tools';
import { CommunityFeed } from '../components/CommunityFeed';
import { AdminPanel } from '../components/AdminPanel';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';
import { Badge } from '../components/ui/badge';
import {
  ArrowLeft,
  Settings,
  MapPin,
  Users,
  Shield,
  AlertCircle,
  Loader2,
  Lock
} from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import { useNostrLogin } from '../lib/nostrify-shim';

interface CommunityData {
  groupId: string;
  name: string;
  memberCount: number;
  location?: {
    latitude: number;
    longitude: number;
  };
  createdAt?: number;
  isAdmin: boolean;
  isMember: boolean;
}

const Community = () => {
  const { communityId } = useParams<{ communityId: string }>();
  const navigate = useNavigate();
  const { pubkey } = useNostrLogin();
  const { toast: _toast } = useToast();

  const [communityData, setCommunityData] = useState<CommunityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [pool] = useState(() => new SimplePool());

  // The group ID format for NIP-29
  const groupId = communityId ? `peek-${communityId}` : null;

  // Get relay URL - always use the configured relay
  const getRelayUrl = (): string => {
    // Always use the environment variable relay URL for now
    // Old localStorage entries might have incorrect relay URLs
    return import.meta.env.VITE_RELAY_URL || 'wss://communities2.nos.social';
  };

  // Verify user has access to this community
  useEffect(() => {
    if (!pubkey || !groupId) {
      setLoading(false);
      if (!pubkey) {
        setError('Please login to access communities');
      }
      return;
    }

    const verifyCommunityAccess = async () => {
      setLoading(true);
      setError(null);

      // First check localStorage for cached membership (for quick loading)
      const joinedGroups = JSON.parse(localStorage.getItem('joinedGroups') || '[]');
      const cachedGroupInfo = joinedGroups.find((g: { communityId: string; isAdmin?: boolean }) => g.communityId === communityId);

      // Always use the configured relay URL
      const relayUrl = getRelayUrl();
      console.log('Connecting to relay:', relayUrl, 'for group:', groupId);

      // Verify actual membership status from relay (NIP-29 spec)
      // Check for kind:9000 (put-user) and kind:9001 (remove-user) events
      let isMemberOnRelay = false;
      let wasRemoved = false;

      try {
        // Query for membership events for this user
        const membershipFilter: Filter = {
          kinds: [9000, 9001], // put-user and remove-user events
          '#h': [groupId],
          '#p': [pubkey],
          limit: 10 // Get recent events to find the latest status
        };

        const membershipEvents = await pool.querySync([relayUrl], membershipFilter);

        // Find the most recent event to determine current membership status
        if (membershipEvents.length > 0) {
          // Sort by created_at to find the latest event
          membershipEvents.sort((a, b) => b.created_at - a.created_at);
          const latestEvent = membershipEvents[0];

          if (latestEvent.kind === 9000) {
            // User was added to the group
            isMemberOnRelay = true;
            console.log('User is a member according to kind:9000 event');
          } else if (latestEvent.kind === 9001) {
            // User was removed from the group
            wasRemoved = true;
            console.log('User was removed according to kind:9001 event');
          }
        } else {
          // No membership events found - check if group is unmanaged
          // For now, we'll treat no events as not being a member
          console.log('No membership events found for user');
        }
      } catch (err) {
        console.warn('Could not verify membership status:', err);
        // If we can't verify, fall back to localStorage but show a warning
        if (cachedGroupInfo) {
          isMemberOnRelay = true; // Assume cached data is valid if relay is unreachable
        }
      }

      // Handle membership verification results
      if (!isMemberOnRelay) {
        // User is not a member according to relay

        // Clear stale localStorage entry if it exists
        if (cachedGroupInfo) {
          const filtered = joinedGroups.filter((g: { communityId: string }) => g.communityId !== communityId);
          localStorage.setItem('joinedGroups', JSON.stringify(filtered));
        }

        const message = wasRemoved
          ? 'You have been removed from this community. Please contact an admin or scan the QR code again to rejoin.'
          : 'You are not a member of this community. Please scan the QR code at the physical location to join.';

        setError(message);
        setLoading(false);

        // Redirect to home with appropriate message
        navigate('/', {
          state: { message }
        });
        return;
      }

      // User is a member - update localStorage if needed
      if (!cachedGroupInfo) {
        // User is a member but not in localStorage, add them
        const newGroupInfo = {
          communityId,
          groupId,
          relayUrl,
          joinedAt: Date.now()
        };
        joinedGroups.push(newGroupInfo);
        localStorage.setItem('joinedGroups', JSON.stringify(joinedGroups));
      }

      // Continue with loading community data
      const groupInfo = cachedGroupInfo || { isAdmin: false };

      try {
        // User's membership is verified, proceed to fetch community data

        // User is a member, fetch community data
        const community: CommunityData = {
          groupId,
          name: `Community ${communityId?.slice(0, 8)}`, // Default name
          memberCount: 0,
          isAdmin: groupInfo.isAdmin || false, // Get admin status from localStorage
          isMember: true
        };

        // Admin status is already set from localStorage above
        // We can't reliably query for it without authentication, so we trust localStorage

        // Try to get community metadata (kind 39000)
        // This may fail if authentication is required
        try {
          const metadataFilter: Filter = {
            kinds: [39000],
            '#d': [groupId],
            limit: 1
          };

          const metadataEvents = await pool.querySync([relayUrl], metadataFilter);

          if (metadataEvents.length > 0) {
            const metadata = metadataEvents[0];

            // Extract name from tags
            const nameTag = metadata.tags.find(tag => tag[0] === 'name');
            if (nameTag && nameTag[1]) {
              community.name = nameTag[1];
            }

            // Extract other metadata
            const _aboutTag = metadata.tags.find(tag => tag[0] === 'about');
            const _pictureTag = metadata.tags.find(tag => tag[0] === 'picture');

            community.createdAt = metadata.created_at;
          }
        } catch (err) {
          console.log('Could not fetch metadata (authentication may be required):', err);
          // Use default values set above
        }

        // Try to count members (kind 39002 or count kind 9000 events)
        // This may also fail if authentication is required
        try {
          const allMembersFilter: Filter = {
            kinds: [9000],
            '#h': [groupId],
            limit: 500
          };

          const allMemberEvents = await pool.querySync([relayUrl], allMembersFilter);
          const uniqueMembers = new Set<string>();

          for (const event of allMemberEvents) {
            const pTag = event.tags.find(tag => tag[0] === 'p');
            if (pTag && pTag[1]) {
              uniqueMembers.add(pTag[1]);
            }
          }

          if (uniqueMembers.size > 0) {
            community.memberCount = uniqueMembers.size;
          }
        } catch (err) {
          console.log('Could not fetch member count (authentication may be required):', err);
          // Keep default member count
        }

        // Get stored location from localStorage (set during join)
        if (groupInfo?.location) {
          community.location = groupInfo.location;
        }

        setCommunityData(community);
      } catch (err) {
        console.error('Error fetching community data:', err);

        // Check if this is a membership/access error
        const errorMessage = err instanceof Error ? err.message : String(err);
        if (errorMessage.includes('not a member') ||
            errorMessage.includes('access denied') ||
            errorMessage.includes('authentication') ||
            errorMessage.includes('unauthorized')) {
          // User was likely removed from the group - clear stale localStorage
          const joinedGroups = JSON.parse(localStorage.getItem('joinedGroups') || '[]');
          const filtered = joinedGroups.filter((g: { communityId: string }) => g.communityId !== communityId);
          localStorage.setItem('joinedGroups', JSON.stringify(filtered));

          // Redirect to home with message
          navigate('/', {
            state: {
              message: 'You need to scan the QR code at the location to rejoin this community'
            }
          });
        } else {
          setError('Failed to load community data. Please try again.');
        }
      } finally {
        setLoading(false);
      }
    };

    verifyCommunityAccess();

    // Cleanup
    return () => {
      pool.close([getRelayUrl()]);
    };
  }, [pubkey, groupId, communityId, pool, navigate]);

  const handleBack = () => {
    navigate('/');
  };

  const handleAdminClick = () => {
    if (communityData?.isAdmin) {
      setShowAdminPanel(true);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
            <p className="text-lg font-medium">Loading community...</p>
            <p className="text-sm text-muted-foreground mt-2">Verifying your access</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center gap-2 text-destructive">
              <Lock className="h-5 w-5" />
              <CardTitle>Access Denied</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <Alert className="border-destructive/20">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
            <div className="mt-4 flex gap-2">
              <Button onClick={handleBack} variant="outline" className="flex-1">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Home
              </Button>
              <Button
                onClick={() => navigate(`/join/${communityId}`)}
                className="flex-1"
              >
                Join Community
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!communityData) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                onClick={handleBack}
                variant="ghost"
                size="sm"
                className="gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <div>
                <h1 className="text-xl font-semibold">{communityData.name}</h1>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {communityData.memberCount} members
                  </span>
                  {communityData.location && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      Location verified
                    </span>
                  )}
                </div>
              </div>
            </div>
            {communityData.isAdmin && (
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="gap-1">
                  <Shield className="h-3 w-3" />
                  Admin
                </Badge>
                <Button
                  onClick={handleAdminClick}
                  variant="outline"
                  size="sm"
                  className="gap-2"
                >
                  <Settings className="h-4 w-4" />
                  Manage
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="grid gap-6">
          {/* Community Info Card */}
          <Card>
            <CardHeader>
              <CardTitle>Welcome to the Community</CardTitle>
              <CardDescription>
                This is a location-based group for people who have visited this place
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Alert>
                  <MapPin className="h-4 w-4" />
                  <AlertTitle>Location Verified Community</AlertTitle>
                  <AlertDescription>
                    All members have physically visited this location.
                    New members must be present at the location to join.
                  </AlertDescription>
                </Alert>

                {communityData.isAdmin && (
                  <Alert className="border-purple-200 bg-purple-50">
                    <Shield className="h-4 w-4 text-purple-600" />
                    <AlertTitle className="text-purple-900">You're an Admin</AlertTitle>
                    <AlertDescription className="text-purple-800">
                      You have admin privileges for this community.
                      You can manage members and moderate content.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Feed */}
          <CommunityFeed
            groupId={communityData.groupId}
            communityName={communityData.name}
            isAdmin={communityData.isAdmin}
          />
        </div>
      </div>

      {/* Admin Panel Modal */}
      {showAdminPanel && communityData && (
        <AdminPanel
          groupId={communityData.groupId}
          communityName={communityData.name}
          communityLocation={communityData.location}
          open={showAdminPanel}
          onOpenChange={setShowAdminPanel}
        />
      )}
    </div>
  );
};

export default Community;