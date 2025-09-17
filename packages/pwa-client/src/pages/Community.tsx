import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { SimplePool, type Event, type Filter } from 'nostr-tools';
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
  const { toast } = useToast();

  const [communityData, setCommunityData] = useState<CommunityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [pool] = useState(() => new SimplePool());

  // The group ID format for NIP-29
  const groupId = communityId ? `peek-${communityId}` : null;

  // Get relay URL from stored group info or use default
  const getRelayUrl = (): string => {
    const joinedGroups = JSON.parse(localStorage.getItem('joinedGroups') || '[]');
    const groupInfo = joinedGroups.find((g: any) => g.communityId === communityId);
    return groupInfo?.relayUrl || import.meta.env.VITE_RELAY_URL || 'ws://localhost:8090';
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

      const relayUrl = getRelayUrl();
      console.log('Connecting to relay:', relayUrl, 'for group:', groupId);

      try {
        // Check if user is a member (kind 9000 put-user events with user's p-tag)
        const memberFilter: Filter = {
          kinds: [9000],
          '#h': [groupId],
          '#p': [pubkey],
          limit: 1
        };

        const memberEvents = await pool.querySync([relayUrl], memberFilter);
        const isMember = memberEvents.length > 0;

        if (!isMember) {
          // Check localStorage as fallback (user just joined)
          const joinedGroups = JSON.parse(localStorage.getItem('joinedGroups') || '[]');
          const isInLocal = joinedGroups.some((g: any) => g.communityId === communityId);

          if (!isInLocal) {
            setError('You are not a member of this community. Please scan the QR code at the physical location to join.');
            setLoading(false);
            return;
          }
        }

        // User is a member, fetch community data
        const community: CommunityData = {
          groupId,
          name: `Community ${communityId?.slice(0, 8)}`, // Default name
          memberCount: 0,
          isAdmin: false,
          isMember: true
        };

        // Check if user is admin (kind 9002 edit-metadata permission or kind 39001 listing)
        const adminFilter: Filter = {
          kinds: [39001],
          '#d': [groupId],
          limit: 1
        };

        const adminEvents = await pool.querySync([relayUrl], adminFilter);

        for (const event of adminEvents) {
          // Check if user's pubkey is in the admin list
          const isAdminInEvent = event.tags.some(tag =>
            tag[0] === 'p' && tag[1] === pubkey
          );
          if (isAdminInEvent) {
            community.isAdmin = true;
            break;
          }
        }

        // Get community metadata (kind 39000)
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
          const aboutTag = metadata.tags.find(tag => tag[0] === 'about');
          const pictureTag = metadata.tags.find(tag => tag[0] === 'picture');

          community.createdAt = metadata.created_at;
        }

        // Count members (kind 39002 or count kind 9000 events)
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

        community.memberCount = uniqueMembers.size || 1; // At least the current user

        // Get stored location from localStorage (set during join)
        const joinedGroups = JSON.parse(localStorage.getItem('joinedGroups') || '[]');
        const groupInfo = joinedGroups.find((g: any) => g.communityId === communityId);
        if (groupInfo?.location) {
          community.location = groupInfo.location;
        }

        setCommunityData(community);
      } catch (err) {
        console.error('Error fetching community data:', err);
        setError('Failed to load community data. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    verifyCommunityAccess();

    // Cleanup
    return () => {
      pool.close([getRelayUrl()]);
    };
  }, [pubkey, groupId, communityId, pool]);

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
            relayUrl={getRelayUrl()}
            userPubkey={pubkey || ''}
            isAdmin={communityData.isAdmin}
          />
        </div>
      </div>

      {/* Admin Panel Modal */}
      {showAdminPanel && (
        <AdminPanel
          groupId={communityData.groupId}
          relayUrl={getRelayUrl()}
          onClose={() => setShowAdminPanel(false)}
        />
      )}
    </div>
  );
};

export default Community;