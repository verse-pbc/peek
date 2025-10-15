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
import { AlertCircle, Loader2 } from 'lucide-react';
import { useProfile, useProfileService } from '@/contexts/ProfileContext';
import { useToast } from '@/hooks/useToast';
import { useNostrLogin } from '@/lib/nostrify-shim';
import { EventTemplate, finalizeEvent } from 'nostr-tools';
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
  const profileService = useProfileService();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [about, setAbout] = useState('');
  const [picture, setPicture] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

      // Also update ProfileService cache directly with the new event
      await profileService.cache.event(signedEvent);

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Edit Profile</DialogTitle>
          <DialogDescription>
            Update your Nostr profile. This will be published to relays and visible across all Nostr apps.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
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

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Profile
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
