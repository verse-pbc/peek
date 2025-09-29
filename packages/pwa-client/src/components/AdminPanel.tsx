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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  MoreVertical,
  Shield,
  ShieldOff,
  UserX,
  UserCheck,
  Copy,
  MapPin,
  Users,
  Settings,
  Edit2,
  Save,
  X,
  Image,
  FileText
} from 'lucide-react';
import { NIP29_KINDS } from '@/services/relay-manager';
import { GroupManager, type GroupMetadata } from '@/services/group-manager';
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
  const { relayManager, connected: relayConnected, migrationService } = useRelayManager();
  const [groupManager, setGroupManager] = useState<GroupManager | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingAction, setProcessingAction] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [hasFetchedMembers, setHasFetchedMembers] = useState(false);

  // Metadata editing state
  const [isEditingMetadata, setIsEditingMetadata] = useState(false);
  const [editedName, setEditedName] = useState(communityName);
  const [editedAbout, setEditedAbout] = useState('');
  const [editedPicture, setEditedPicture] = useState('');
  const [savingMetadata, setSavingMetadata] = useState(false);
  const [currentMetadata, setCurrentMetadata] = useState<{
    name: string;
    about?: string;
    picture?: string;
  }>({ name: communityName });

  // Batch fetch profiles for all members (handled by UserProfile component)
  // This preloads the profiles for better performance
  const memberPubkeys = members.map(m => m.pubkey);
  useBatchProfiles(memberPubkeys);

  // Initialize group manager with shared relay manager
  useEffect(() => {
    if (!relayManager || !identity) return;

    const groupMgr = new GroupManager(relayManager, migrationService!);

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

  // Reset fetch state when panel closes
  useEffect(() => {
    if (!open) {
      setHasFetchedMembers(false);
    }
  }, [open]);

  // Fetch current group metadata
  useEffect(() => {
    if (!relayManager || !open || !connected) return;

    const fetchMetadata = async () => {
      try {
        // Get the group metadata from relay manager
        const groupState = relayManager.getGroupState(groupId);
        if (groupState?.metadata) {
          setCurrentMetadata({
            name: groupState.metadata.name || communityName,
            about: groupState.metadata.about,
            picture: groupState.metadata.picture
          });
          setEditedName(groupState.metadata.name || communityName);
          setEditedAbout(groupState.metadata.about || '');
          setEditedPicture(groupState.metadata.picture || '');
        }
      } catch (error) {
        console.error('Error fetching group metadata:', error);
      }
    };

    fetchMetadata();
  }, [relayManager, groupId, open, connected, communityName]);

  // Subscribe to group when panel opens
  useEffect(() => {
    if (!relayManager || !open || !connected || !groupId) return;

    // Subscribe once when panel opens
    relayManager.subscribeToGroup(groupId);
  }, [relayManager, groupId, open, connected]);

  // Fetch group members and their roles (only once when panel opens)
  useEffect(() => {
    if (!relayManager || !groupManager || !open || !connected) return;

    // Only fetch if we haven't already
    if (hasFetchedMembers) return;

    const fetchMembers = async () => {
      setLoading(true);
      const memberMap = new Map<string, Member>();

      try {
        // Wait for initial sync (subscription already handled above)
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

        // Mark as fetched
        setHasFetchedMembers(true);
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
    // Dependencies exclude 'connected' to avoid re-fetching on reconnect
  }, [relayManager, groupManager, groupId, open, hasFetchedMembers]);

  // Listen for real-time member updates
  useEffect(() => {
    if (!relayManager || !open || !hasFetchedMembers) return;

    const handleMemberUpdate = () => {
      const groupState = relayManager.getGroupState(groupId);
      if (!groupState) return;

      const memberMap = new Map<string, Member>();

      // Process members from updated group state
      for (const [pubkey, _member] of groupState.members) {
        memberMap.set(pubkey, {
          pubkey,
          npub: nip19.npubEncode(pubkey),
          isAdmin: groupState.admins.has(pubkey),
          isMuted: false, // TODO: Track mute state
          joinedAt: Date.now() / 1000 // TODO: Get actual join time
        });
      }

      const memberList = Array.from(memberMap.values());

      setMembers(memberList.sort((a, b) => {
        // Sort admins first, then by join date
        if (a.isAdmin !== b.isAdmin) return a.isAdmin ? -1 : 1;
        return (b.joinedAt || 0) - (a.joinedAt || 0);
      }));
    };

    // Listen for member and admin updates
    const unsubscribeMembers = relayManager.onEvent(`group-metadata-${groupId}`, (event) => {
      if (event.kind === 39001 || event.kind === 39002) { // GROUP_ADMINS or GROUP_MEMBERS
        handleMemberUpdate();
      }
    });

    return () => unsubscribeMembers();
  }, [relayManager, groupId, open, hasFetchedMembers]);

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

  const handleSaveMetadata = async () => {
    if (!groupManager || !identity) return;

    // Validate inputs
    if (!editedName.trim()) {
      toast({
        title: 'Error',
        description: 'Community name is required',
        variant: 'destructive'
      });
      return;
    }

    if (editedPicture && !isValidUrl(editedPicture)) {
      toast({
        title: 'Error',
        description: 'Please enter a valid image URL',
        variant: 'destructive'
      });
      return;
    }

    setSavingMetadata(true);
    try {
      // Build the updates object with only changed fields
      const updates: Partial<GroupMetadata> = {};

      if (editedName !== currentMetadata.name) {
        updates.name = editedName.trim();
      }

      if (editedAbout !== (currentMetadata.about || '')) {
        updates.about = editedAbout.trim();
      }

      if (editedPicture !== (currentMetadata.picture || '')) {
        updates.picture = editedPicture.trim() || undefined;
      }

      // Only update if there are changes
      if (Object.keys(updates).length > 0) {
        // Pass undefined for secretKey if using NIP-07
        const secretKey = identity.secretKey === 'NIP07_EXTENSION'
          ? undefined
          : hexToBytes(identity.secretKey);

        await groupManager.updateMetadata(groupId, secretKey, updates);

        // Update local state
        setCurrentMetadata(prev => ({ ...prev, ...updates }));

        toast({
          title: 'Success',
          description: 'Community metadata updated'
        });
      }

      setIsEditingMetadata(false);
    } catch (error) {
      console.error('Error updating metadata:', error);
      toast({
        title: 'Error',
        description: 'Failed to update community metadata',
        variant: 'destructive'
      });
    } finally {
      setSavingMetadata(false);
    }
  };

  const handleCancelEdit = () => {
    // Reset to current values
    setEditedName(currentMetadata.name);
    setEditedAbout(currentMetadata.about || '');
    setEditedPicture(currentMetadata.picture || '');
    setIsEditingMetadata(false);
  };

  const isValidUrl = (url: string) => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
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
          <Card className="border-2 border-primary/20 bg-gradient-to-br from-background to-primary/5">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-rubik">Community Information</CardTitle>
                {isCurrentUserAdmin && !isEditingMetadata && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setIsEditingMetadata(true)}
                    className="bg-coral/10 hover:bg-coral/20 border-coral/30 text-coral"
                  >
                    <Edit2 className="h-4 w-4 mr-1" />
                    Edit
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {isEditingMetadata && isCurrentUserAdmin ? (
                <>
                  {/* Editing Form */}
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="name" className="text-sm font-rubik flex items-center gap-1 mb-2">
                        <FileText className="h-3 w-3 text-coral" />
                        Community Name
                      </Label>
                      <Input
                        id="name"
                        value={editedName}
                        onChange={(e) => setEditedName(e.target.value)}
                        placeholder="Enter community name"
                        className="bg-background/50 border-primary/20 focus:border-coral focus:ring-coral"
                      />
                    </div>

                    <div>
                      <Label htmlFor="about" className="text-sm font-rubik flex items-center gap-1 mb-2">
                        <FileText className="h-3 w-3 text-mint" />
                        About
                      </Label>
                      <Textarea
                        id="about"
                        value={editedAbout}
                        onChange={(e) => setEditedAbout(e.target.value)}
                        placeholder="Describe your community..."
                        rows={3}
                        className="bg-background/50 border-primary/20 focus:border-mint focus:ring-mint resize-none"
                      />
                    </div>

                    <div>
                      <Label htmlFor="picture" className="text-sm font-rubik flex items-center gap-1 mb-2">
                        <Image className="h-3 w-3 text-peach" />
                        Picture URL
                      </Label>
                      <Input
                        id="picture"
                        value={editedPicture}
                        onChange={(e) => setEditedPicture(e.target.value)}
                        placeholder="https://example.com/image.jpg"
                        className="bg-background/50 border-primary/20 focus:border-peach focus:ring-peach"
                      />
                      {editedPicture && !isValidUrl(editedPicture) && (
                        <p className="text-xs text-destructive mt-1">Please enter a valid URL</p>
                      )}
                    </div>

                    <div className="flex gap-2 pt-2">
                      <Button
                        onClick={handleSaveMetadata}
                        disabled={savingMetadata || !editedName.trim()}
                        className="bg-coral hover:bg-coral/90 text-white font-rubik"
                      >
                        {savingMetadata ? (
                          <>Saving...</>
                        ) : (
                          <>
                            <Save className="h-4 w-4 mr-1" />
                            Save
                          </>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={handleCancelEdit}
                        disabled={savingMetadata}
                        className="border-primary/20 hover:bg-primary/10"
                      >
                        <X className="h-4 w-4 mr-1" />
                        Cancel
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* View Mode */}
                  {currentMetadata.picture && (
                    <div className="flex justify-center mb-4">
                      <img
                        src={currentMetadata.picture}
                        alt={currentMetadata.name}
                        className="w-20 h-20 rounded-lg object-cover border-2 border-primary/20"
                        onError={(e) => e.currentTarget.style.display = 'none'}
                      />
                    </div>
                  )}

                  {currentMetadata.about && (
                    <div className="bg-mint/10 rounded-lg p-3 mb-3">
                      <p className="text-sm">{currentMetadata.about}</p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Group ID</span>
                      <div className="flex items-center gap-2">
                        <code className="text-xs bg-peach/20 px-2 py-1 rounded font-mono">
                          {groupId}
                        </code>
                        <Button size="icon" variant="ghost" onClick={copyGroupId} className="hover:bg-peach/20">
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>

                    {communityLocation && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Location</span>
                        <div className="flex items-center gap-1 text-sm">
                          <MapPin className="h-3 w-3 text-coral" />
                          {communityLocation.latitude.toFixed(4)}, {communityLocation.longitude.toFixed(4)}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Members</span>
                      <div className="flex items-center gap-1 text-sm">
                        <Users className="h-3 w-3 text-mint" />
                        {members.length}
                      </div>
                    </div>
                  </div>

                  <Alert className="border-coral/20 bg-coral/5">
                    <AlertDescription className="text-xs">
                      This community is private and closed. Only users who prove physical presence at the location can join.
                    </AlertDescription>
                  </Alert>
                </>
              )}
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