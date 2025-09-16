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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
import { useNostrContext } from '@nostr-dev-kit/ndk-react';
import { NDKEvent, NDKKind } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';
import { useToast } from '@/components/ui/use-toast';

interface Member {
  pubkey: string;
  npub: string;
  name?: string;
  picture?: string;
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
  const { ndk, user } = useNostrContext();
  const { toast } = useToast();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingAction, setProcessingAction] = useState<string | null>(null);

  // Fetch group members and their roles
  useEffect(() => {
    if (!ndk || !open) return;

    const fetchMembers = async () => {
      setLoading(true);
      const memberMap = new Map<string, Member>();

      try {
        // Fetch member additions (kind 9000)
        const memberFilter = {
          kinds: [9000 as NDKKind],
          '#h': [groupId],
          limit: 500
        };

        const memberEvents = await ndk.fetchEvents(memberFilter);

        for (const event of memberEvents) {
          const pTag = event.tags.find(tag => tag[0] === 'p');
          if (pTag && pTag[1]) {
            const pubkey = pTag[1];
            memberMap.set(pubkey, {
              pubkey,
              npub: nip19.npubEncode(pubkey),
              isAdmin: false,
              isMuted: false,
              joinedAt: event.created_at
            });
          }
        }

        // Fetch admin permissions (kind 9002)
        const adminFilter = {
          kinds: [9002 as NDKKind],
          '#h': [groupId],
          limit: 100
        };

        const adminEvents = await ndk.fetchEvents(adminFilter);

        for (const event of adminEvents) {
          const pTag = event.tags.find(tag => tag[0] === 'p');
          const permissionTag = event.tags.find(tag => tag[0] === 'permission');

          if (pTag && pTag[1] && permissionTag && permissionTag[1] === 'add-user') {
            const member = memberMap.get(pTag[1]);
            if (member) {
              member.isAdmin = true;
            }
          }
        }

        // Fetch mutes (kind 9005)
        const muteFilter = {
          kinds: [9005 as NDKKind],
          '#h': [groupId],
          limit: 100
        };

        const muteEvents = await ndk.fetchEvents(muteFilter);

        for (const event of muteEvents) {
          const pTag = event.tags.find(tag => tag[0] === 'p');
          if (pTag && pTag[1]) {
            const member = memberMap.get(pTag[1]);
            if (member) {
              member.isMuted = true;
            }
          }
        }

        // Fetch user metadata for each member
        const memberList = Array.from(memberMap.values());

        for (const member of memberList) {
          try {
            const metadataEvent = await ndk.fetchEvent({
              kinds: [0 as NDKKind],
              authors: [member.pubkey]
            });

            if (metadataEvent) {
              const metadata = JSON.parse(metadataEvent.content);
              member.name = metadata.name || metadata.display_name;
              member.picture = metadata.picture;
            }
          } catch (error) {
            console.error('Error fetching metadata for', member.npub, error);
          }
        }

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
  }, [ndk, groupId, open, toast]);

  const promoteToAdmin = async (memberPubkey: string) => {
    if (!ndk || !user) return;

    setProcessingAction(memberPubkey);
    try {
      // Create NIP-29 add permission event (kind 9002)
      const event = new NDKEvent(ndk);
      event.kind = 9002 as NDKKind;
      event.content = 'Granted admin permission';
      event.tags = [
        ['h', groupId],
        ['p', memberPubkey],
        ['permission', 'add-user']
      ];

      await event.publish();

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
    if (!ndk || !user) return;

    setProcessingAction(memberPubkey);
    try {
      // Create NIP-29 remove permission event (kind 9003)
      const event = new NDKEvent(ndk);
      event.kind = 9003 as NDKKind;
      event.content = 'Removed admin permission';
      event.tags = [
        ['h', groupId],
        ['p', memberPubkey],
        ['permission', 'add-user']
      ];

      await event.publish();

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
    if (!ndk || !user) return;

    setProcessingAction(memberPubkey);
    try {
      // Create NIP-29 mute user event (kind 9005)
      const event = new NDKEvent(ndk);
      event.kind = 9005 as NDKKind;
      event.content = 'User muted';
      event.tags = [
        ['h', groupId],
        ['p', memberPubkey]
      ];

      await event.publish();

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
    if (!ndk || !user) return;

    setProcessingAction(memberPubkey);
    try {
      // Create NIP-29 unmute user event (kind 9006)
      const event = new NDKEvent(ndk);
      event.kind = 9006 as NDKKind;
      event.content = 'User unmuted';
      event.tags = [
        ['h', groupId],
        ['p', memberPubkey]
      ];

      await event.publish();

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
    if (!ndk || !user) return;

    setProcessingAction(memberPubkey);
    try {
      // Create NIP-29 remove user event (kind 9001)
      const event = new NDKEvent(ndk);
      event.kind = 9001 as NDKKind;
      event.content = 'User removed from group';
      event.tags = [
        ['h', groupId],
        ['p', memberPubkey]
      ];

      await event.publish();

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

  const isCurrentUserAdmin = members.find(m => m.pubkey === user?.pubkey)?.isAdmin || false;

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
                      const isCurrentUser = member.pubkey === user?.pubkey;

                      return (
                        <TableRow key={member.pubkey}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Avatar className="h-8 w-8">
                                {member.picture && <AvatarImage src={member.picture} />}
                                <AvatarFallback>
                                  {member.name?.[0]?.toUpperCase() || 'U'}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="text-sm font-medium">
                                  {member.name || member.npub.slice(0, 8)}
                                  {isCurrentUser && ' (You)'}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {member.npub.slice(0, 8)}...
                                </p>
                              </div>
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