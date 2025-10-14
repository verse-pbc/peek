import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { Avatar, AvatarImage, AvatarFallback } from './ui/avatar';
import { CheckCircle2, Copy } from 'lucide-react';
import { useProfile, useNip05Verification } from '@/contexts/ProfileContext';
import { useIdentityResolution } from '@/hooks/useIdentityResolution';
import { genUserName } from '@/lib/genUserName';
import { nip19 } from 'nostr-tools';
import { useToast } from '@/hooks/useToast';

interface UserProfileModalProps {
  pubkey: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId?: string;
}

export function UserProfileModal({ pubkey, open, onOpenChange, groupId }: UserProfileModalProps) {
  const { toast } = useToast();
  const { resolveIdentity } = useIdentityResolution(groupId);

  const resolvedPubkey = pubkey ? resolveIdentity(pubkey) : '';
  const { data: profile } = useProfile(resolvedPubkey || undefined);
  const { data: nip05Verified } = useNip05Verification(profile?.nip05, resolvedPubkey || undefined);

  if (!pubkey) return null;

  const displayName = profile?.display_name || profile?.name || genUserName(resolvedPubkey);
  const initials = displayName[0].toUpperCase();
  const npub = nip19.npubEncode(resolvedPubkey);

  const handleCopyNpub = () => {
    navigator.clipboard.writeText(npub);
    toast({ title: "Npub copied to clipboard" });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Profile</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-4">
          <Avatar className="h-24 w-24">
            {profile?.picture && (
              <AvatarImage src={profile.picture} alt={displayName} />
            )}
            <AvatarFallback className="text-3xl">{initials}</AvatarFallback>
          </Avatar>

          <div className="text-center space-y-2">
            <h3 className="text-2xl font-bold">{displayName}</h3>

            {profile?.nip05 && (
              <div className="flex items-center justify-center gap-1">
                <span className="text-sm text-muted-foreground">
                  {profile.nip05}
                </span>
                {nip05Verified && (
                  <CheckCircle2 className="h-4 w-4 text-blue-500" />
                )}
              </div>
            )}

            {profile?.about && (
              <p className="text-sm text-muted-foreground max-w-sm">
                {profile.about}
              </p>
            )}
          </div>

          <div className="w-full space-y-2">
            <div className="text-xs text-muted-foreground text-center">
              Public Key
            </div>
            <Button
              variant="outline"
              className="w-full justify-between font-mono text-xs"
              onClick={handleCopyNpub}
            >
              <span className="truncate">{npub}</span>
              <Copy className="h-3 w-3 ml-2 flex-shrink-0" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
