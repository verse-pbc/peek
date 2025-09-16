import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useNostrContext } from '@nostr-dev-kit/ndk-react';
import { NDKEvent, NDKKind } from '@nostr-dev-kit/ndk';
import { CommunityFeed } from '../components/CommunityFeed';
import { AdminPanel } from '../components/AdminPanel';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Alert, AlertDescription } from '../components/ui/alert';
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
import { useToast } from '../components/ui/use-toast';
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
  const { ndk, user } = useNostrContext();
  const { pubkey } = useNostrLogin();
  const { toast } = useToast();

  const [communityData, setCommunityData] = useState<CommunityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdminPanel, setShowAdminPanel] = useState(false);

  // The group ID format for NIP-29
  const groupId = communityId ? `peek-${communityId}` : null;

  // Verify user has access to this community
  useEffect(() => {
    if (!ndk || !user || !groupId) {
      setLoading(false);
      if (!user) {
        setError('Please login to access communities');
      }
      return;
    }

    const verifyCommunityAccess = async () => {
      setLoading(true);
      setError(null);

      try {
        // Check if user is a member (kind 9000 with user's p-tag)
        const memberFilter = {
          kinds: [9000 as NDKKind],
          '#h': [groupId],
          '#p': [user.pubkey],
          limit: 1
        };

        const memberEvents = await ndk.fetchEvents(memberFilter);
        const isMember = memberEvents.size > 0;

        if (!isMember) {
          setError('You are not a member of this community. Please scan the QR code at the physical location to join.');
          setLoading(false);
          return;
        }

        // User is a member, fetch community data
        const community: CommunityData = {
          groupId,
          name: `Community ${communityId?.slice(0, 8)}`, // Default name
          memberCount: 0,
          isAdmin: false,
          isMember: true
        };

        // Check if user is admin (kind 9002)
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

        // Count total members
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

        // Try to get community metadata from group creation event (kind 9007)
        const groupCreationFilter = {
          kinds: [9007 as NDKKind],
          '#h': [groupId],
          limit: 1
        };

        const creationEvents = await ndk.fetchEvents(groupCreationFilter);

        for (const event of creationEvents) {
          community.createdAt = event.created_at;

          // Extract name from tags
          const nameTag = event.tags.find(tag => tag[0] === 'name');
          if (nameTag && nameTag[1]) {
            community.name = nameTag[1];
          }

          // Mock location for now (would come from validation service in production)
          community.location = {
            latitude: -34.919143 + Math.random() * 0.01,
            longitude: -56.161693 + Math.random() * 0.01
          };
          break;
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
  }, [ndk, user, groupId, communityId]);

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
      <div className="min-h-screen flex items-center justify-center">
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

  if (error || !communityData) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center gap-3">
              <Lock className="h-8 w-8 text-destructive" />
              <div>
                <CardTitle>Access Denied</CardTitle>
                <CardDescription>Cannot access this community</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {error || 'Community not found or you do not have access.'}
              </AlertDescription>
            </Alert>

            {error?.includes('not a member') && (
              <Alert>
                <MapPin className="h-4 w-4" />
                <AlertDescription>
                  To join this community, you must be physically present at the location.
                  Scan the QR code with your phone camera when you're there.
                </AlertDescription>
              </Alert>
            )}

            <Button onClick={handleBack} className="w-full">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Home
            </Button>
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
              <Button variant="ghost" size="icon" onClick={handleBack}>
                <ArrowLeft className="h-5 w-5" />
              </Button>

              <div>
                <h1 className="text-xl font-bold line-clamp-1">{communityData.name}</h1>
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {communityData.memberCount} members
                  </span>
                  {communityData.location && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      Location-based
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {communityData.isAdmin && (
                <>
                  <Badge variant="default" className="hidden sm:flex">
                    <Shield className="h-3 w-3 mr-1" />
                    Admin
                  </Badge>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleAdminClick}
                    title="Admin Panel"
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        <div className="max-w-4xl mx-auto">
          {/* Success Alert for New Members */}
          {window.location.search.includes('joined=true') && (
            <Alert className="mb-4 border-green-200 bg-green-50">
              <Shield className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                Welcome! You've successfully joined this community. You can now participate in discussions
                and connect with other members who've been to this location.
              </AlertDescription>
            </Alert>
          )}

          {/* Community Feed */}
          <CommunityFeed
            groupId={groupId}
            communityName={communityData.name}
            isAdmin={communityData.isAdmin}
            onMemberClick={(pubkey) => {
              // Could open member profile or actions
              console.log('Member clicked:', pubkey);
            }}
          />
        </div>
      </main>

      {/* Admin Panel Modal */}
      {communityData.isAdmin && (
        <AdminPanel
          groupId={groupId}
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