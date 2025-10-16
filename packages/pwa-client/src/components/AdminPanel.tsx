import { useState, useEffect, useRef } from 'react';
import {
  Table,
  TableBody,
  TableCell,
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  MoreVertical,
  Shield,
  ShieldOff,
  UserX,
  UserCheck,
  Users,
  Save,
  X,
  Image,
  FileText,
  ChevronLeft
} from 'lucide-react';
import { NIP29_KINDS } from '@/services/relay-manager';
import { type GroupMetadata } from '@/services/group-manager';
import { useNostrLogin } from '@/lib/nostrify-shim';
import { useRelayManager } from '@/contexts/RelayContext';
import { EventTemplate } from 'nostr-tools';
import { resolveSecretKey } from '@/lib/secret-key-utils';
import { useToast } from '@/hooks/useToast';
import { UserProfile } from '@/components/UserProfile';
import { useBatchProfiles } from '@/contexts/ProfileContext';
import { getOrderedMembers, type Member } from '@/lib/member-utils';
import { useEventSigner } from '@/hooks/useEventSigner';

interface AdminPanelProps {
  groupId: string;
  communityName: string;
  communityLocation?: { latitude: number; longitude: number };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMemberClick?: (pubkey: string) => void;
}

export function AdminPanel({
  groupId,
  communityName,
  communityLocation: _communityLocation,
  open,
  onOpenChange,
  onMemberClick
}: AdminPanelProps) {
  const { identity } = useNostrLogin();
  const { toast } = useToast();
  const { relayManager, groupManager, connected } = useRelayManager();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingAction, setProcessingAction] = useState<string | null>(null);
  const [hasFetchedMembers, setHasFetchedMembers] = useState(false);

  // Ref for scrolling to members section
  const membersRef = useRef<HTMLDivElement>(null);

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

  // Event signer (data-oriented hook)
  const signEvent = useEventSigner(identity);

  // Set up event signer for shared group manager
  useEffect(() => {
    if (!groupManager) return;
    groupManager.setEventSigner(signEvent);
  }, [groupManager, signEvent]);

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

      try {
        // Wait for initial sync (subscription already handled above)
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Get group state and transform to ordered members (data-oriented)
        const groupState = relayManager.getGroupState(groupId);
        const orderedMembers = getOrderedMembers(groupState);

        setMembers(orderedMembers);
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
  }, [relayManager, groupManager, groupId, open, connected, hasFetchedMembers, toast]);

  // Listen for real-time member updates
  useEffect(() => {
    if (!relayManager || !open || !hasFetchedMembers) return;

    const handleMemberUpdate = () => {
      const groupState = relayManager.getGroupState(groupId);
      const orderedMembers = getOrderedMembers(groupState);
      setMembers(orderedMembers);
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
      const secretKey = resolveSecretKey(identity);
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
      const secretKey = resolveSecretKey(identity);
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
    if (!relayManager) return;

    setProcessingAction(memberPubkey);
    try {
      const eventTemplate: EventTemplate = {
        kind: NIP29_KINDS.DELETE_EVENT,
        content: 'User muted',
        tags: [
          ['h', groupId],
          ['p', memberPubkey]
        ],
        created_at: Math.floor(Date.now() / 1000)
      };

      const event = await signEvent(eventTemplate);
      await relayManager.publishEvent(event);

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
    if (!relayManager) return;

    setProcessingAction(memberPubkey);
    try {
      const eventTemplate: EventTemplate = {
        kind: 9006, // Custom unmute event
        content: 'User unmuted',
        tags: [
          ['h', groupId],
          ['p', memberPubkey]
        ],
        created_at: Math.floor(Date.now() / 1000)
      };

      const event = await signEvent(eventTemplate);
      await relayManager.publishEvent(event);

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
      const secretKey = resolveSecretKey(identity);
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
        const secretKey = resolveSecretKey(identity);

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


  const isCurrentUserAdmin = members.find(m => m.pubkey === identity?.publicKey)?.isAdmin || false;

  const scrollToMembers = () => {
    membersRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-40 transition-opacity duration-300"
          onClick={() => onOpenChange(false)}
        />
      )}

      {/* Slide-in Panel */}
      <div className={`fixed top-0 right-0 h-full w-full bg-background z-50 flex flex-col transition-transform duration-300 ease-in-out ${open ? 'translate-x-0' : 'translate-x-full'}`}>
        {/* Header */}
        <div className="bg-card/90 backdrop-blur border-b border-border">
          <div className="px-4 py-3">
            <div className="flex items-center gap-4">
              <Button
                onClick={() => onOpenChange(false)}
                variant="ghost"
                size="icon"
                className="bg-muted/80 hover:bg-muted flex-shrink-0 [&_svg]:!size-[24px]"
                title="Back to chat"
              >
                <ChevronLeft />
              </Button>
              <h2 className="text-base font-semibold flex-1">
                Community Info
              </h2>
              {isCurrentUserAdmin && (
                <button
                  onClick={() => setIsEditingMetadata(true)}
                  className="text-sm text-primary hover:underline"
                >
                  Edit
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Hero Section */}
          <div className="w-full">
            {/* 16:9 Community Image */}
            <div className="w-full aspect-video bg-muted relative overflow-hidden">
              {currentMetadata.picture ? (
                <img
                  src={currentMetadata.picture}
                  alt={currentMetadata.name}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    e.currentTarget.parentElement!.classList.add('bg-gradient-to-br', 'from-primary/10', 'to-primary/5');
                  }}
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
                  <Users className="h-16 w-16 text-muted-foreground/30" />
                </div>
              )}
            </div>

            {/* Community Name and Info */}
            <div className="px-4 py-6 text-center">
              <h1 className="text-2xl font-bold mb-2" style={{ fontFamily: "'Integral CF', sans-serif" }}>
                {currentMetadata.name}
              </h1>
              <p className="text-sm text-muted-foreground mb-3">
                Closed community • <button onClick={scrollToMembers} className="underline hover:text-foreground transition-colors">{members.length} {members.length === 1 ? 'member' : 'members'}</button>
              </p>
              {currentMetadata.about && (
                <p className="text-sm text-muted-foreground mt-3 max-w-2xl mx-auto">
                  {currentMetadata.about}
                </p>
              )}
            </div>
          </div>

          {/* Editing Modal Overlay */}
          {isEditingMetadata && isCurrentUserAdmin && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <Card className="w-full max-w-2xl max-h-[80vh] overflow-y-auto">
                <CardHeader>
                  <CardTitle>Edit Community</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
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
                </CardContent>
              </Card>
            </div>
          )}

          {/* Rest of Content */}
          <div className="px-4 pb-4 space-y-4">
          {/* Members Table */}
          <div ref={membersRef}>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Members</CardTitle>
              <CardDescription>
                {members.filter(m => m.isAdmin).length} admins, {members.filter(m => m.isMuted).length} muted
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              {loading ? (
                <div className="text-center py-4 text-muted-foreground">
                  Loading members...
                </div>
              ) : (
                <Table>
                  <TableBody>
                    {members.map((member) => {
                      const isCurrentUser = member.pubkey === identity?.publicKey;

                      return (
                        <TableRow key={member.pubkey}>
                          <TableCell className="w-full">
                            <div className="flex items-center gap-2">
                              <UserProfile
                                pubkey={member.pubkey}
                                size="sm"
                                showName={true}
                                groupId={groupId}
                                onClick={() => onMemberClick?.(member.pubkey)}
                              />
                              {isCurrentUser && (
                                <span className="text-sm text-muted-foreground">(You)</span>
                              )}
                            </div>
                          </TableCell>

                          <TableCell className="text-right pr-2 w-auto whitespace-nowrap">
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
          </div>
        </div>
      </div>
    </>
  );
}