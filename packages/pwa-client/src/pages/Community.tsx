import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CommunityFeed } from "../components/CommunityFeed";
import { AdminPanel } from "../components/AdminPanel";
import { JoinFlow } from "./JoinFlow";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Alert, AlertDescription } from "../components/ui/alert";
import {
  ChevronLeft,
  Users,
  AlertCircle,
  Loader2,
  Lock,
} from "lucide-react";
import { isCommunityMember } from "../services/community-storage";
import { useToast } from "@/hooks/useToast";
import { useNostrLogin } from "../lib/nostrify-shim";
import { useRelayManager } from "../contexts/RelayContext";
import { useMigrationState } from "../hooks/useMigrationState";
import { useMigrationPolling } from "../hooks/useMigrationPolling";
import { UserProfileModal } from "@/components/UserProfileModal";
import { MembersListModal } from "@/components/MembersListModal";
import { IOSInstallBanner } from "@/components/IOSInstallBanner";

interface CommunityData {
  groupId: string;
  name: string;
  memberCount: number;
  picture?: string;
  location?: {
    latitude: number;
    longitude: number;
  };
  createdAt?: number;
  isAdmin: boolean;
  isMember: boolean;
}

const Community = () => {
  const { t } = useTranslation();
  const { communityId } = useParams<{ communityId: string }>();
  const navigate = useNavigate();
  const { pubkey } = useNostrLogin();
  const { toast: _toast } = useToast();

  const [communityData, setCommunityData] = useState<CommunityData | null>(
    null,
  );

  // Store member count from 39002 events early (before communityData exists)
  const memberCountRef = useRef<number>(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [showJoinFlow, setShowJoinFlow] = useState(false);
  const [selectedMemberPubkey, setSelectedMemberPubkey] = useState<string | null>(null);
  const [showMembersList, setShowMembersList] = useState(false);
  const { relayManager, groupManager, connected, waitForConnection } =
    useRelayManager();

  // Resolve UUID to h-tag for NIP-29 group
  const [groupId, setGroupId] = useState<string | null>(null);
  const nameRef = useRef<string | undefined>(undefined);

  // Migration state management (data-oriented hook)
  const { isMigrating, clearMigration } = useMigrationState(groupId);

  // Reset name ref when community changes
  useEffect(() => {
    nameRef.current = undefined;
  }, [communityId]);

  // Resolve UUID to group h-tag
  useEffect(() => {
    if (!communityId || !relayManager || !connected) {
      setGroupId(null);
      return;
    }

    const resolveGroupId = async () => {
      // First check localStorage for recently joined groups
      const joinedGroups = JSON.parse(localStorage.getItem('joinedGroups') || '[]');
      const joinedGroup = joinedGroups.find((g: { communityId: string; groupId?: string }) =>
        g.communityId === communityId
      );

      if (joinedGroup?.groupId) {
        setGroupId(joinedGroup.groupId);
        return;
      }

      // Fallback to relay lookup
      const resolved = await relayManager.findGroupByUuid(communityId);
      if (resolved) {
        setGroupId(resolved);
      } else {
        console.warn(
          `[Community] Could not resolve UUID ${communityId} to group`,
        );
        setGroupId(null);
      }
    };

    resolveGroupId();
  }, [communityId, relayManager, connected]);

  // Subscribe to metadata updates when connected (dedicated subscription)
  useEffect(() => {
    if (!relayManager || !connected || !groupId) return;

    // Create dedicated subscription for metadata (receives historical + live events)
    const unsubscribe = relayManager.subscribeToMetadata(groupId, (event) => {
      // Reduced verbosity: only log in verbose debug mode
      // console.log(`[Community] Received metadata event:`, event.kind);

      if (event.kind === 39000) {
        // GROUP_METADATA event
        const nameTag = event.tags.find((t) => t[0] === "name");
        if (nameTag && nameTag[1]) {
          const nextName = nameTag[1];

          // Store in ref for early access (before communityData exists)
          if (nameRef.current !== nextName) {
            nameRef.current = nextName;
          }

          // Also update communityData if it exists (idempotent)
          setCommunityData((prev) => {
            if (!prev) {
              return prev;
            }
            if (prev.name !== nextName) {
              return { ...prev, name: nextName };
            }
            return prev; // No change, avoid re-render
          });
        }

        // Also update other metadata
        const aboutTag = event.tags.find((t) => t[0] === "about");
        const pictureTag = event.tags.find((t) => t[0] === "picture");

        setCommunityData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            ...(aboutTag && aboutTag[1] ? { about: aboutTag[1] } : {}),
            ...(pictureTag && pictureTag[1] ? { picture: pictureTag[1] } : {}),
          };
        });
      } else if (event.kind === 39002) {
        // GROUP_MEMBERS event
        const memberCount = event.tags.filter((t) => t[0] === "p").length;
        // Reduced verbosity
        // console.log("[Community] 📝 Updating member count from 39002:", memberCount);

        // Store in ref for immediate use (before communityData exists)
        memberCountRef.current = memberCount;

        // Update communityData if it exists
        setCommunityData((prev) => {
          if (!prev) {
            // Reduced verbosity
            // console.log("[Community] 📊 Member count stored in ref:", memberCount);
            return prev;
          }
          return { ...prev, memberCount };
        });
      } else if (event.kind === 39001) {
        // GROUP_ADMINS event - refresh admin status
        if (pubkey && groupManager) {
          const isAdmin = groupManager.isGroupAdmin(groupId);
          setCommunityData((prev) => {
            if (!prev) return prev;
            if (prev.isAdmin !== isAdmin) {
              return { ...prev, isAdmin };
            }
            return prev;
          });
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [relayManager, connected, groupId]);

  // Verify membership and load community data
  const verifyCommunityAccess = useCallback(async () => {
    if (!pubkey || !groupId || !groupManager) return;

    // Only show loading spinner if we don't have data yet
    // This prevents flicker on reconnect - React diffs will handle updates
    if (!communityData) {
      setLoading(true);
    }
    setError(null);

    await waitForConnection();

    // Check cache first
    let isMember = groupManager.isGroupMember(groupId);
    let isAdmin = groupManager.isGroupAdmin(groupId);

    // Check localStorage for admin status if not in cache
    if (!isAdmin) {
      const joinedGroupsStr = localStorage.getItem("joinedGroups");
      if (joinedGroupsStr) {
        try {
          const joinedGroups = JSON.parse(joinedGroupsStr);
          const groupInfo = joinedGroups.find(
            (g: { groupId?: string; communityId?: string }) =>
              g.groupId === groupId || g.communityId === communityId,
          );
          if (groupInfo?.isAdmin) {
            groupManager.setInitialAdminStatus(groupId, pubkey);
            isAdmin = true;
          }
        } catch (e) {
          console.error("Error parsing joinedGroups:", e);
        }
      }
    }

    // If not in cache and NOT migrating, check relay
    if (!isMember && !isMigrating) {
      isMember = await groupManager.checkMembershipDirectly(groupId);
    }

    // Handle non-members (not migrating)
    if (!isMember && !isMigrating) {
      setShowJoinFlow(true);
      setLoading(false);
      return;
    }

    // If migrating and not member yet, polling hook will handle it
    if (isMigrating && !isMember) {
      return; // Keep loading state
    }

    // User is a member - load community data
    try {
      // Get metadata from GroupManager
      const metadata = groupManager.getGroupMetadata(groupId);

      // Use member count from ref (set by 39002 event listener)
      const memberCount = memberCountRef.current;

      const community: CommunityData = {
        groupId,
        // Priority: nameRef (from early 39000) > metadata cache > UUID fallback
        name: nameRef.current || metadata?.name || `Community ${communityId?.slice(0, 8)}`,
        memberCount, // From ref, set by 39002 event
        picture: metadata?.picture, // From metadata cache, updated live by subscription
        isAdmin,
        isMember: true,
      };

      // Get stored location from localStorage if available
      const joinedGroups = JSON.parse(
        localStorage.getItem("joinedGroups") || "[]",
      );
      const cachedGroupInfo = joinedGroups.find(
        (g: { communityId: string }) => g.communityId === communityId,
      );
      if (cachedGroupInfo?.location) {
        community.location = cachedGroupInfo.location;
      }

      setCommunityData(community);
    } catch (err) {
      console.error("Error fetching community data:", err);

      // Check if this is a membership/access error
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (
        errorMessage.includes("not a member") ||
        errorMessage.includes("access denied") ||
        errorMessage.includes("authentication") ||
        errorMessage.includes("unauthorized")
      ) {
        // User was likely removed from the group - clear stale localStorage
        const joinedGroups = JSON.parse(
          localStorage.getItem("joinedGroups") || "[]",
        );
        const filtered = joinedGroups.filter(
          (g: { communityId: string }) => g.communityId !== communityId,
        );
        localStorage.setItem("joinedGroups", JSON.stringify(filtered));

        // Redirect to home with message
        navigate("/", {
          state: {
            message:
              "You need to scan the QR code at the location to rejoin this community",
          },
        });
      } else {
        setError("Failed to load community data. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }, [
    pubkey,
    groupId,
    communityId,
    groupManager,
    navigate,
    waitForConnection,
    isMigrating,
  ]);

  // Migration polling (data-oriented hook)
  useMigrationPolling(
    async () => {
      if (!groupManager || !groupId) return false;
      return await groupManager.checkMembershipDirectly(groupId);
    },
    () => {
      clearMigration();
      setCommunityData(null); // Clear to allow re-fetch with updated membership
      verifyCommunityAccess();
    },
    () => {
      console.warn("Migration polling timed out");
      clearMigration();
      setCommunityData(null); // Clear to allow re-fetch
      verifyCommunityAccess();
    },
    {
      enabled: isMigrating && !communityData?.isMember,
    },
  );

  // Verify access when dependencies change
  useEffect(() => {
    // Only run verification if we don't have community data yet
    // Once loaded, event listeners handle updates to prevent stale cache overwrites
    if (pubkey && groupId && groupManager && connected && !communityData) {
      verifyCommunityAccess();
    }
  }, [pubkey, groupId, groupManager, connected, communityData, verifyCommunityAccess]);

  // Fallback: if stuck loading after relay connection, show JoinFlow
  useEffect(() => {
    if (connected && loading && !communityData && !showJoinFlow) {
      const timeout = setTimeout(() => {
        if (loading && !communityData && !showJoinFlow) {
          // Check localStorage before defaulting to JoinFlow (prevents premature join screen)
          // This is especially important on slower devices/networks (iOS Safari)
          const isMember = communityId ? isCommunityMember(communityId) : false;

          if (!isMember) {
            setShowJoinFlow(true);
            setLoading(false);
          }
          // Don't show JoinFlow if user is a member, just slow to load
        }
      }, 5000);
      return () => clearTimeout(timeout);
    }
  }, [connected, loading, communityData, showJoinFlow, communityId]);

  const handleBack = () => {
    navigate("/");
  };

  const handleInfoClick = () => {
    setShowAdminPanel(true);
  };

  // Use the state variable set during access verification
  if (loading || (isMigrating && !communityData)) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
            <p className="text-lg font-medium">
              {isMigrating
                ? t('community_page.loading_migration')
                : t('community_page.loading_title')}
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              {isMigrating
                ? t('community_page.loading_migration_desc')
                : t('community_page.loading_desc')}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center gap-2 text-destructive">
              <Lock className="h-5 w-5" />
              <CardTitle>{t('community_page.access_denied')}</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <Alert className="border-destructive/20">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
            <div className="mt-4 flex gap-2">
              <Button onClick={handleBack} variant="outline" className="flex-1">
                <ChevronLeft className="mr-2 h-4 w-4" />
                My Communities
              </Button>
              <Button
                onClick={() => navigate(`/c/${communityId}`)}
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

  if (showJoinFlow) {
    return (
      <JoinFlow
        onJoinSuccess={(groupId: string) => {
          setGroupId(groupId);  // Set directly from validation response
          setShowJoinFlow(false);
          setCommunityData(null);
          setLoading(true);
        }}
      />
    );
  }

  if (!communityData) {
    return null;
  }

  return (
    <div className="h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="bg-card/90 backdrop-blur border-b border-border sticky top-0 z-50">
        <div className="mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0">
              <Button
                onClick={handleBack}
                variant="ghost"
                size="icon"
                className="bg-muted/80 hover:bg-muted flex-shrink-0 [&_svg]:!size-[24px]"
                title={t('community_page.my_communities')}
              >
                <ChevronLeft />
              </Button>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h1
                    className="text-lg sm:text-xl font-bold truncate cursor-pointer hover:text-primary transition-colors"
                    style={{ fontFamily: "'Integral CF', sans-serif" }}
                    onClick={handleInfoClick}
                    title="View community info"
                  >
                    {communityData.name}
                  </h1>
                  <button
                    onClick={() => setShowMembersList(true)}
                    className="flex items-center gap-1 text-sm text-muted-foreground flex-shrink-0 hover:text-foreground transition-colors cursor-pointer"
                  >
                    <Users className="h-4 w-4" />
                    {communityData.memberCount}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* iOS Install Banner - shows for iOS users not in PWA mode */}
      <div className="px-4 pt-2">
        <IOSInstallBanner />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <CommunityFeed
          groupId={communityData.groupId}
          communityName={communityData.name}
          isAdmin={communityData.isAdmin}
          onMemberClick={setSelectedMemberPubkey}
        />
      </div>

      {/* Members List Modal */}
      <MembersListModal
        groupId={communityData.groupId}
        open={showMembersList}
        onOpenChange={setShowMembersList}
        onMemberClick={(pubkey) => {
          setSelectedMemberPubkey(pubkey);
          setShowMembersList(false);
        }}
      />

      {/* Profile Modal */}
      <UserProfileModal
        pubkey={selectedMemberPubkey}
        open={selectedMemberPubkey !== null}
        onOpenChange={(open) => !open && setSelectedMemberPubkey(null)}
        groupId={communityData.groupId}
      />

      {/* Community Info Panel Modal */}
      {showAdminPanel && communityData && (
        <AdminPanel
          groupId={communityData.groupId}
          communityName={communityData.name}
          communityLocation={communityData.location}
          open={showAdminPanel}
          onOpenChange={setShowAdminPanel}
          onMemberClick={(pubkey) => {
            setSelectedMemberPubkey(pubkey);
            setShowAdminPanel(false);
          }}
        />
      )}
    </div>
  );
};

export default Community;
