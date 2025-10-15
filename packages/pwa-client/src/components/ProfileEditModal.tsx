import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Alert, AlertDescription } from './ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { AlertCircle, Loader2, Copy, CheckCircle } from 'lucide-react';
import { useProfile } from '@/contexts/ProfileContext';
import { useToast } from '@/hooks/useToast';
import { useNostrLogin } from '@/lib/nostrify-shim';
import { EventTemplate, finalizeEvent, nip19 } from 'nostr-tools';
import { hexToBytes } from '@/lib/hex';
import { SimplePool } from 'nostr-tools';
import { useQueryClient } from '@tanstack/react-query';

interface ProfileEditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pubkey: string;
}

export function ProfileEditModal({ open, onOpenChange, pubkey }: ProfileEditModalProps) {
  const { toast } = useToast();
  const { identity } = useNostrLogin();
  const { data: profile } = useProfile(pubkey);
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [about, setAbout] = useState('');
  const [picture, setPicture] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'profile' | 'keys'>('profile');
  const [hasMarkedNsecSaved, setHasMarkedNsecSaved] = useState(false);

  const hasBackedUpNsec = identity?.hasBackedUpNsec ?? false;
  const nsecStatus = hasBackedUpNsec || hasMarkedNsecSaved ? 'saved' : 'not-saved';

  // Load existing profile data
  useEffect(() => {
    if (profile) {
      setName(profile.name || '');
      setDisplayName(profile.display_name || '');
      setAbout(profile.about || '');
      setPicture(profile.picture || '');
    }
  }, [profile]);

  const handleSave = async () => {
    if (!identity) return;

    setSaving(true);
    setError(null);

    try {
      // Build profile metadata JSON
      const metadata: Record<string, string> = {};
      if (name) metadata.name = name;
      if (displayName) metadata.display_name = displayName;
      if (about) metadata.about = about;
      if (picture) metadata.picture = picture;

      // Create kind 0 event
      const event: EventTemplate = {
        kind: 0,
        content: JSON.stringify(metadata),
        tags: [],
        created_at: Math.floor(Date.now() / 1000),
      };

      // Sign event
      let signedEvent;
      if (identity.secretKey === 'NIP07_EXTENSION') {
        // Use NIP-07 extension
        signedEvent = await window.nostr!.signEvent(event);
      } else {
        // Use secret key
        const secretKey = hexToBytes(identity.secretKey);
        signedEvent = finalizeEvent(event, secretKey);
      }

      // Publish to profile relays
      const pool = new SimplePool();
      const relays = [
        'wss://purplepag.es',
        'wss://relay.nos.social',
        'wss:// relay.damus.io',
        'wss://nos.lol',
        'wss://communities2.nos.social', // Also publish to Peek relay
      ];

      await Promise.any(pool.publish(relays, signedEvent));

      pool.close(relays);

      // Invalidate React Query cache to force refetch
      queryClient.invalidateQueries({ queryKey: ['profile', pubkey] });

      toast({
        title: "Profile updated!",
        description: "Your profile has been published to Nostr relays.",
      });

      onOpenChange(false);
    } catch (err) {
      console.error('Failed to publish profile:', err);
      setError('Failed to save profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleCopyNpub = () => {
    const npub = nip19.npubEncode(pubkey);
    navigator.clipboard.writeText(npub);
    toast({ title: "Public ID copied!", description: "Safe to share anywhere." });
  };

  const handleCopyNsec = () => {
    if (!identity?.secretKey || identity.secretKey === 'NIP07_EXTENSION') return;

    const nsec = nip19.nsecEncode(hexToBytes(identity.secretKey));
    navigator.clipboard.writeText(nsec);

    const updatedIdentity = { ...identity, hasBackedUpNsec: true };
    localStorage.setItem('peek_nostr_identity', JSON.stringify(updatedIdentity));
    setHasMarkedNsecSaved(true);

    toast({
      title: "Secret key copied!",
      description: "Store this safely. You can now switch accounts without losing access."
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Profile & Keys</DialogTitle>
          <DialogDescription>
            Manage your Nostr profile and identity keys.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'profile' | 'keys')} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="keys">Your Keys</TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="space-y-4 py-4">
            <Alert className="bg-mint/10 border-mint/30">
              <AlertCircle className="h-4 w-4 text-mint" />
              <AlertDescription className="text-sm">
                💡 <strong>Works across all Nostr apps!</strong> Your profile is part of the Nostr protocol.
              </AlertDescription>
            </Alert>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="display-name">Display Name (optional)</Label>
                <Input
                  id="display-name"
                  placeholder="Full name with special characters"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="about">About</Label>
                <Textarea
                  id="about"
                  placeholder="A short bio..."
                  value={about}
                  onChange={(e) => setAbout(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="picture">Profile Picture URL</Label>
                <Input
                  id="picture"
                  type="url"
                  placeholder="https://example.com/avatar.jpg"
                  value={picture}
                  onChange={(e) => setPicture(e.target.value)}
                />
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </div>
          </TabsContent>

          <TabsContent value="keys" className="space-y-4 py-4">
            <div className="space-y-4">
              <div className="space-y-3 p-4 border rounded-lg bg-muted/50">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <Label className="text-sm font-medium">Public ID (npub)</Label>
                    <p className="text-xs text-muted-foreground">Safe to share - like your email address</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <code className="flex-1 text-[10px] bg-background p-2 rounded border break-all overflow-hidden leading-tight">
                    {nip19.npubEncode(pubkey)}
                  </code>
                  <Button variant="outline" size="sm" onClick={handleCopyNpub} className="flex-shrink-0">
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              {identity?.secretKey && identity.secretKey !== 'NIP07_EXTENSION' && (
                <div className="space-y-3 p-4 border rounded-lg bg-muted/50">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Label className="text-sm font-medium">Secret Key (nsec)</Label>
                        {nsecStatus === 'saved' ? (
                          <span className="text-xs flex items-center gap-1 text-green-600 dark:text-green-500">
                            <CheckCircle className="h-3 w-3" /> Saved
                          </span>
                        ) : (
                          <span className="text-xs flex items-center gap-1 text-amber-600 dark:text-amber-500">
                            <AlertCircle className="h-3 w-3" /> Not saved
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">NEVER share - like your password</p>
                    </div>
                  </div>
                  <Alert variant="destructive" className="py-2">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      Store this in a password manager. If you lose it, you lose access to this identity forever.
                    </AlertDescription>
                  </Alert>
                  <Button variant="outline" className="w-full" onClick={handleCopyNsec}>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy Secret Key
                  </Button>
                </div>
              )}

              {identity?.secretKey === 'NIP07_EXTENSION' && (
                <Alert className="bg-mint/10 border-mint/30">
                  <AlertCircle className="h-4 w-4 text-mint" />
                  <AlertDescription className="text-sm">
                    🔒 Your secret key is managed by your browser extension and never exposed.
                  </AlertDescription>
                </Alert>
              )}

              <div className="pt-2">
                <a
                  href="https://nostr.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-coral hover:underline inline-flex items-center gap-1"
                >
                  New to Nostr? Learn more →
                </a>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {activeTab === 'profile' && (
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Profile
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
