import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
import { useRelayManager } from '../contexts/RelayContext';

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
  const { relayManager, groupManager, connected, waitForConnection } = useRelayManager();

  // The group ID format for NIP-29
  const groupId = communityId ? `peek-${communityId}` : null;

  // Subscribe to group updates when connected
  useEffect(() => {
    if (relayManager && connected && groupId) {
      // Subscribe to the group to get updates
      relayManager.subscribeToGroup(groupId);

      // Listen for group metadata updates to update member count
      const unsubscribe = relayManager.onEvent(`group-metadata-${groupId}`, (event) => {
        if (event.kind === 39002) { // GROUP_MEMBERS event
          const memberCount = event.tags.filter(t => t[0] === 'p').length;
          setCommunityData(prev => prev ? { ...prev, memberCount } : prev);
        }
      });

      return () => unsubscribe();
    }
  }, [relayManager, connected, groupId]);

  // Verify user has access to this community
  useEffect(() => {
    if (!pubkey || !groupId || !groupManager || !connected) {
      if (!pubkey) {
        setLoading(false);
        setError('Please login to access communities');
      }
      // Still loading if we're waiting for connection or group manager
      return;
    }

    const verifyCommunityAccess = async () => {
      setLoading(true);
      setError(null);

      // Wait for connection to be established
      await waitForConnection();

      // First check cache for fast initial display
      let isMember = groupManager.isGroupMember(groupId);
      let isAdmin = groupManager.isGroupAdmin(groupId);

      // If not admin in cache, check localStorage as fallback
      if (!isAdmin) {
        const joinedGroupsStr = localStorage.getItem('joinedGroups');
        if (joinedGroupsStr) {
          try {
            const joinedGroups = JSON.parse(joinedGroupsStr);
            const groupInfo = joinedGroups.find((g: { groupId?: string; communityId?: string }) =>
              g.groupId === groupId || g.communityId === communityId
            );
            if (groupInfo?.isAdmin) {
              // Set initial admin status from localStorage
              groupManager.setInitialAdminStatus(groupId, pubkey);
              isAdmin = true;
              console.log('Set admin status from localStorage for group:', groupId);
            }
          } catch (e) {
            console.error('Error parsing joinedGroups:', e);
          }
        }
      }

      console.log('Initial cache check:', {
        groupId,
        isMember,
        isAdmin,
        userPubkey: pubkey
      });

      // If not in cache, do authoritative check directly from relay
      if (!isMember) {
        console.log('Member not in cache, checking relay directly...');
        isMember = await groupManager.checkMembershipDirectly(groupId);

        console.log('Direct relay check result:', {
          groupId,
          isMember,
          userPubkey: pubkey
        });
      }

      // Check if we're in the middle of a migration
      const migratingState = localStorage.getItem('identity_migrating');
      const isMigrating = (() => {
        if (!migratingState) return false;
        try {
          const state = JSON.parse(migratingState);
          // Check if this group is in the migration list
          return state.groups && state.groups.includes(groupId);
        } catch {
          return false;
        }
      })();

      // Handle membership verification results
      if (!isMember && !isMigrating) {
        // User is not a member according to relay and not migrating
        const message = 'You are not a member of this community. Please scan the QR code at the physical location to join.';

        setError(message);
        setLoading(false);

        // Redirect to home with appropriate message
        navigate('/', {
          state: { message }
        });
        return;
      }

      if (isMigrating && !isMember) {
        // Show migration in progress state instead of redirecting
        console.log('Identity migration in progress, waiting for membership update...');
      }

      // User is a member - load community data
      try {
        // Get metadata from GroupManager
        const metadata = groupManager.getGroupMetadata(groupId);
        const memberCount = groupManager.getResolvedMemberCount(groupId);

        // If members list is empty, we might not have synced yet
        // In that case, at least count ourselves
        const finalMemberCount = memberCount > 0 ? memberCount : 1;

        const community: CommunityData = {
          groupId,
          name: metadata?.name || `Community ${communityId?.slice(0, 8)}`,
          memberCount: finalMemberCount,
          isAdmin,
          isMember: true
        };

        // Get stored location from localStorage if available
        const joinedGroups = JSON.parse(localStorage.getItem('joinedGroups') || '[]');
        const cachedGroupInfo = joinedGroups.find((g: { communityId: string }) => g.communityId === communityId);
        if (cachedGroupInfo?.location) {
          community.location = cachedGroupInfo.location;
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
  }, [pubkey, groupId, communityId, groupManager, connected, navigate, waitForConnection]);

  const handleBack = () => {
    navigate('/');
  };

  const handleAdminClick = () => {
    if (communityData?.isAdmin) {
      setShowAdminPanel(true);
    }
  };

  // Check if we're in migration mode
  const migratingState = localStorage.getItem('identity_migrating');
  const isMigrating = (() => {
    if (!migratingState) return false;
    try {
      const state = JSON.parse(migratingState);
      return state.groups && state.groups.includes(groupId);
    } catch {
      return false;
    }
  })();

  if (loading || (isMigrating && !communityData)) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
            <p className="text-lg font-medium">
              {isMigrating ? 'Completing identity migration...' : 'Loading community...'}
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              {isMigrating ? 'Updating your membership' : 'Verifying your access'}
            </p>
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
              <div className="flex items-center gap-2 mr-36">
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