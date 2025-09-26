import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  MoreVertical,
  Shield,
  ShieldOff,
  UserX,
  UserCheck,
  Copy,
  MapPin,
  Users,
  Settings
} from 'lucide-react';
import { NIP29_KINDS } from '@/services/relay-manager';
import { GroupManager } from '@/services/group-manager';
import { useNostrLogin } from '@/lib/nostrify-shim';
import { useRelayManager } from '@/contexts/RelayContext';
import { nip19, finalizeEvent, EventTemplate, type VerifiedEvent } from 'nostr-tools';
import { hexToBytes } from '@/lib/hex';
import { useToast } from '@/hooks/useToast';
import { UserProfile } from '@/components/UserProfile';
import { useBatchProfiles } from '@/contexts/ProfileContext';

interface Member {
  pubkey: string;
  npub: string;
  isAdmin: boolean;
  isMuted: boolean;
  joinedAt?: number;
}

interface AdminPanelProps {
  groupId: string;
  communityName: string;
  communityLocation?: { latitude: number; longitude: number };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AdminPanel({
  groupId,
  communityName,
  communityLocation,
  open,
  onOpenChange
}: AdminPanelProps) {
  const { identity } = useNostrLogin();
  const { toast } = useToast();
  const { relayManager, connected: relayConnected } = useRelayManager();
  const [groupManager, setGroupManager] = useState<GroupManager | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingAction, setProcessingAction] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  // Batch fetch profiles for all members (handled by UserProfile component)
  // This preloads the profiles for better performance
  const memberPubkeys = members.map(m => m.pubkey);
  useBatchProfiles(memberPubkeys);

  // Initialize group manager with shared relay manager
  useEffect(() => {
    if (!relayManager || !identity) return;

    const groupMgr = new GroupManager(relayManager);

    // Set up event signer for NIP-07 support
    if (identity.secretKey === 'NIP07_EXTENSION') {
      groupMgr.setEventSigner(async (event: EventTemplate) => {
        if (!window.nostr) {
          throw new Error('Browser extension not available');
        }
        const signedEvent = await window.nostr.signEvent(event);
        return signedEvent as VerifiedEvent;
      });
    } else {
      groupMgr.setEventSigner(async (event: EventTemplate) => {
        const secretKey = hexToBytes(identity.secretKey);
        const signedEvent = finalizeEvent(event, secretKey) as VerifiedEvent;
        return signedEvent;
      });
    }

    setGroupManager(groupMgr);
  }, [relayManager, identity]);

  // Subscribe to connection status from context
  useEffect(() => {
    setConnected(relayConnected);
  }, [relayConnected]);

  // Fetch group members and their roles
  useEffect(() => {
    if (!relayManager || !groupManager || !open || !connected) return;

    const fetchMembers = async () => {
      setLoading(true);
      const memberMap = new Map<string, Member>();

      try {
        // Subscribe to group to get latest state
        relayManager.subscribeToGroup(groupId);

        // Wait for initial sync
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Get group state from relay manager
        const groupState = relayManager.getGroupState(groupId);

        if (groupState) {
          // Process members from group state
          for (const [pubkey, _member] of groupState.members) {
            memberMap.set(pubkey, {
              pubkey,
              npub: nip19.npubEncode(pubkey),
              isAdmin: groupState.admins.has(pubkey),
              isMuted: false, // TODO: Track mute state
              joinedAt: Date.now() / 1000 // TODO: Get actual join time
            });
          }
        }

        // Members will be fetched without metadata initially
        const memberList = Array.from(memberMap.values());

        setMembers(memberList.sort((a, b) => {
          // Sort admins first, then by join date
          if (a.isAdmin !== b.isAdmin) return a.isAdmin ? -1 : 1;
          return (b.joinedAt || 0) - (a.joinedAt || 0);
        }));
      } catch (error) {
        console.error('Error fetching members:', error);
        toast({
          title: 'Error',
          description: 'Failed to fetch member list',
          variant: 'destructive'
        });
      } finally {
        setLoading(false);
      }
    };

    fetchMembers();
  }, [relayManager, groupManager, groupId, open, connected, toast]);

  const promoteToAdmin = async (memberPubkey: string) => {
    if (!groupManager || !identity) return;

    setProcessingAction(memberPubkey);
    try {
      // Pass undefined for secretKey if using NIP-07
      const secretKey = identity.secretKey === 'NIP07_EXTENSION'
        ? undefined
        : hexToBytes(identity.secretKey);
      await groupManager.addUser(groupId, memberPubkey, secretKey, ['admin']);

      // Update local state
      setMembers(prev => prev.map(m =>
        m.pubkey === memberPubkey ? { ...m, isAdmin: true } : m
      ));

      toast({
        title: 'Success',
        description: 'Member promoted to admin'
      });
    } catch (error) {
      console.error('Error promoting member:', error);
      toast({
        title: 'Error',
        description: 'Failed to promote member',
        variant: 'destructive'
      });
    } finally {
      setProcessingAction(null);
    }
  };

  const removeAdmin = async (memberPubkey: string) => {
    if (!groupManager || !identity) return;

    setProcessingAction(memberPubkey);
    try {
      // Pass undefined for secretKey if using NIP-07
      const secretKey = identity.secretKey === 'NIP07_EXTENSION'
        ? undefined
        : hexToBytes(identity.secretKey);
      // Re-add user as regular member (no roles)
      await groupManager.addUser(groupId, memberPubkey, secretKey, []);

      // Update local state
      setMembers(prev => prev.map(m =>
        m.pubkey === memberPubkey ? { ...m, isAdmin: false } : m
      ));

      toast({
        title: 'Success',
        description: 'Admin permissions removed'
      });
    } catch (error) {
      console.error('Error removing admin:', error);
      toast({
        title: 'Error',
        description: 'Failed to remove admin permissions',
        variant: 'destructive'
      });
    } finally {
      setProcessingAction(null);
    }
  };

  const muteMember = async (memberPubkey: string) => {
    if (!relayManager || !identity) return;

    setProcessingAction(memberPubkey);
    try {
      // For now, mute/unmute still needs direct signing since it's not in GroupManager
      // TODO: Move this to GroupManager for consistency
      if (identity.secretKey === 'NIP07_EXTENSION') {
        // Use NIP-07 for signing
        const eventTemplate: EventTemplate = {
          kind: NIP29_KINDS.DELETE_EVENT,
          content: 'User muted',
          tags: [
            ['h', groupId],
            ['p', memberPubkey]
          ],
          created_at: Math.floor(Date.now() / 1000)
        };
        const event = await window.nostr!.signEvent(eventTemplate) as VerifiedEvent;
        await relayManager.publishEvent(event);
      } else {
        const secretKey = hexToBytes(identity.secretKey);
        // Create NIP-29 mute user event (kind 9005)
        const eventTemplate: EventTemplate = {
          kind: NIP29_KINDS.DELETE_EVENT,
          content: 'User muted',
          tags: [
            ['h', groupId],
            ['p', memberPubkey]
          ],
          created_at: Math.floor(Date.now() / 1000)
        };
        const event = finalizeEvent(eventTemplate, secretKey);
        await relayManager.publishEvent(event);
      }

      // Update local state
      setMembers(prev => prev.map(m =>
        m.pubkey === memberPubkey ? { ...m, isMuted: true } : m
      ));

      toast({
        title: 'Success',
        description: 'Member muted'
      });
    } catch (error) {
      console.error('Error muting member:', error);
      toast({
        title: 'Error',
        description: 'Failed to mute member',
        variant: 'destructive'
      });
    } finally {
      setProcessingAction(null);
    }
  };

  const unmuteMember = async (memberPubkey: string) => {
    if (!relayManager || !identity) return;

    setProcessingAction(memberPubkey);
    try {
      // For now, mute/unmute still needs direct signing since it's not in GroupManager
      // TODO: Move this to GroupManager for consistency
      if (identity.secretKey === 'NIP07_EXTENSION') {
        // Use NIP-07 for signing
        const eventTemplate: EventTemplate = {
          kind: 9006, // Custom unmute event
          content: 'User unmuted',
          tags: [
            ['h', groupId],
            ['p', memberPubkey]
          ],
          created_at: Math.floor(Date.now() / 1000)
        };
        const event = await window.nostr!.signEvent(eventTemplate) as VerifiedEvent;
        await relayManager.publishEvent(event);
      } else {
        const secretKey = hexToBytes(identity.secretKey);
        // Note: NIP-29 doesn't have a standard unmute event, this would be custom
        const eventTemplate: EventTemplate = {
          kind: 9006, // Custom unmute event
          content: 'User unmuted',
          tags: [
            ['h', groupId],
            ['p', memberPubkey]
          ],
          created_at: Math.floor(Date.now() / 1000)
        };
        const event = finalizeEvent(eventTemplate, secretKey);
        await relayManager.publishEvent(event);
      }

      // Update local state
      setMembers(prev => prev.map(m =>
        m.pubkey === memberPubkey ? { ...m, isMuted: false } : m
      ));

      toast({
        title: 'Success',
        description: 'Member unmuted'
      });
    } catch (error) {
      console.error('Error unmuting member:', error);
      toast({
        title: 'Error',
        description: 'Failed to unmute member',
        variant: 'destructive'
      });
    } finally {
      setProcessingAction(null);
    }
  };

  const removeMember = async (memberPubkey: string) => {
    if (!groupManager || !identity) return;

    setProcessingAction(memberPubkey);
    try {
      // Pass undefined for secretKey if using NIP-07
      const secretKey = identity.secretKey === 'NIP07_EXTENSION'
        ? undefined
        : hexToBytes(identity.secretKey);
      await groupManager.removeUser(groupId, memberPubkey, secretKey, 'User removed from group');

      // Update local state
      setMembers(prev => prev.filter(m => m.pubkey !== memberPubkey));

      toast({
        title: 'Success',
        description: 'Member removed from group'
      });
    } catch (error) {
      console.error('Error removing member:', error);
      toast({
        title: 'Error',
        description: 'Failed to remove member',
        variant: 'destructive'
      });
    } finally {
      setProcessingAction(null);
    }
  };

  const copyGroupId = () => {
    navigator.clipboard.writeText(groupId);
    toast({
      title: 'Copied',
      description: 'Group ID copied to clipboard'
    });
  };

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return 'Unknown';
    return new Date(timestamp * 1000).toLocaleDateString();
  };

  const isCurrentUserAdmin = members.find(m => m.pubkey === identity?.publicKey)?.isAdmin || false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Admin Panel - {communityName}
          </DialogTitle>
          <DialogDescription>
            Manage members and community settings
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4">
          {/* Community Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Community Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Group ID</span>
                <div className="flex items-center gap-2">
                  <code className="text-xs bg-muted px-2 py-1 rounded">
                    {groupId}
                  </code>
                  <Button size="icon" variant="ghost" onClick={copyGroupId}>
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              {communityLocation && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Location</span>
                  <div className="flex items-center gap-1 text-sm">
                    <MapPin className="h-3 w-3" />
                    {communityLocation.latitude.toFixed(4)}, {communityLocation.longitude.toFixed(4)}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Members</span>
                <div className="flex items-center gap-1 text-sm">
                  <Users className="h-3 w-3" />
                  {members.length}
                </div>
              </div>

              <Alert>
                <AlertDescription className="text-xs">
                  This community is private and closed. Only users who prove physical presence at the location can join.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>

          {/* Members Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Members</CardTitle>
              <CardDescription>
                {members.filter(m => m.isAdmin).length} admins, {members.filter(m => m.isMuted).length} muted
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-4 text-muted-foreground">
                  Loading members...
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Member</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {members.map((member) => {
                      const isCurrentUser = member.pubkey === identity?.publicKey;

                      return (
                        <TableRow key={member.pubkey}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <UserProfile
                                pubkey={member.pubkey}
                                size="sm"
                                showName={true}
                              />
                              {isCurrentUser && (
                                <span className="text-sm text-muted-foreground">(You)</span>
                              )}
                            </div>
                          </TableCell>

                          <TableCell>
                            <div className="flex gap-1">
                              {member.isAdmin && (
                                <Badge variant="default" className="text-xs">
                                  Admin
                                </Badge>
                              )}
                              {member.isMuted && (
                                <Badge variant="secondary" className="text-xs">
                                  Muted
                                </Badge>
                              )}
                            </div>
                          </TableCell>

                          <TableCell className="text-sm">
                            {formatDate(member.joinedAt)}
                          </TableCell>

                          <TableCell className="text-right">
                            {!isCurrentUser && isCurrentUserAdmin && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    disabled={processingAction === member.pubkey}
                                  >
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  {member.isAdmin ? (
                                    <DropdownMenuItem onClick={() => removeAdmin(member.pubkey)}>
                                      <ShieldOff className="h-4 w-4 mr-2" />
                                      Remove Admin
                                    </DropdownMenuItem>
                                  ) : (
                                    <DropdownMenuItem onClick={() => promoteToAdmin(member.pubkey)}>
                                      <Shield className="h-4 w-4 mr-2" />
                                      Make Admin
                                    </DropdownMenuItem>
                                  )}

                                  {member.isMuted ? (
                                    <DropdownMenuItem onClick={() => unmuteMember(member.pubkey)}>
                                      <UserCheck className="h-4 w-4 mr-2" />
                                      Unmute
                                    </DropdownMenuItem>
                                  ) : (
                                    <DropdownMenuItem onClick={() => muteMember(member.pubkey)}>
                                      <UserX className="h-4 w-4 mr-2" />
                                      Mute
                                    </DropdownMenuItem>
                                  )}

                                  <DropdownMenuSeparator />

                                  <DropdownMenuItem
                                    onClick={() => removeMember(member.pubkey)}
                                    className="text-destructive"
                                  >
                                    <UserX className="h-4 w-4 mr-2" />
                                    Remove from Group
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}