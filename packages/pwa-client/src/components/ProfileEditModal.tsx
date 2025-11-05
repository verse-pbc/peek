import React, { useState, useEffect, useMemo } from 'react';
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
import { AlertCircle, Loader2, Copy, CheckCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { useProfile } from '@/contexts/ProfileContext';
import { useToast } from '@/hooks/useToast';
import { useNostrLogin } from '@/lib/nostr-identity';
import { EventTemplate, finalizeEvent, nip19 } from 'nostr-tools';
import { hexToBytes } from '@/lib/hex';
import { SimplePool } from 'nostr-tools';
import { useQueryClient } from '@tanstack/react-query';
import { NotificationToggle } from './Notifications/NotificationToggle';
import { useTranslation } from 'react-i18next';

interface ProfileEditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pubkey: string;
}

export function ProfileEditModal({ open, onOpenChange, pubkey }: ProfileEditModalProps) {
  const { t, i18n } = useTranslation();
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
  const [hasMarkedNsecSaved, setHasMarkedNsecSaved] = useState(false);
  const [isBackupExpanded, setIsBackupExpanded] = useState(false);

  const hasBackedUpNsec = (identity?.type === 'local' && identity.hasBackedUpNsec) ?? false;
  const nsecStatus = hasBackedUpNsec || hasMarkedNsecSaved ? 'saved' : 'not-saved';

  // Auto-expand backup section if not backed up yet
  useEffect(() => {
    if (identity?.type === 'local' && !hasBackedUpNsec && !hasMarkedNsecSaved) {
      setIsBackupExpanded(true);
    }
  }, [identity, hasBackedUpNsec, hasMarkedNsecSaved]);

  // Truncated npub for display
  const truncatedNpub = useMemo(() => {
    const npub = nip19.npubEncode(pubkey);
    return `${npub.slice(0, 16)}...${npub.slice(-8)}`;
  }, [pubkey]);

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
      if (identity.type === 'extension') {
        // Use NIP-07 extension
        signedEvent = await window.nostr!.signEvent(event);
      } else if (identity.type === 'local') {
        // Use local secret key
        const secretKey = hexToBytes(identity.secretKey);
        signedEvent = finalizeEvent(event, secretKey);
      } else {
        // Bunker - use RelayManager's eventSigner
        throw new Error('Profile editing with bunker not yet supported');
      }

      // Publish to profile relays
      const pool = new SimplePool();
      const relays = [
        'wss://purplepag.es',
        'wss://relay.nos.social',
        'wss://relay.damus.io',
        'wss://nos.lol',
        'wss://communities2.nos.social', // Also publish to Peek relay
      ];

      await Promise.any(pool.publish(relays, signedEvent));

      pool.close(relays);

      // Invalidate React Query cache to force refetch
      queryClient.invalidateQueries({ queryKey: ['profile', pubkey] });

      toast({
        title: t('profile.edit_dialog.toast.profile_updated'),
        description: t('profile.edit_dialog.toast.profile_updated_desc'),
      });

      onOpenChange(false);
    } catch (err) {
      console.error('Failed to publish profile:', err);
      setError(t('errors.profile_save_failed', { defaultValue: 'Failed to save profile. Please try again.' }));
    } finally {
      setSaving(false);
    }
  };

  const handleCopyNpub = () => {
    const npub = nip19.npubEncode(pubkey);
    navigator.clipboard.writeText(npub);
    toast({ 
      title: t('profile.edit_dialog.toast.npub_copied'), 
      description: t('profile.edit_dialog.toast.npub_copied_desc')
    });
  };

  const handleCopyNsec = () => {
    if (!identity || identity.type !== 'local') return;

    const nsec = nip19.nsecEncode(hexToBytes(identity.secretKey));
    navigator.clipboard.writeText(nsec);

    const updatedIdentity = { ...identity, hasBackedUpNsec: true };
    localStorage.setItem('peek_nostr_identity', JSON.stringify(updatedIdentity));
    setHasMarkedNsecSaved(true);

    toast({
      title: t('profile.edit_dialog.toast.nsec_copied'),
      description: t('profile.edit_dialog.toast.nsec_copied_desc')
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t('profile.edit_dialog.title')}</DialogTitle>
          <DialogDescription>
            {t('profile.edit_dialog.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4 max-h-[70vh] overflow-y-auto styled-scrollbar">
          {/* Profile Section */}
          <div className="space-y-4">
            <Alert className="bg-mint/10 border-mint/30">
              <AlertCircle className="h-4 w-4 text-mint" />
              <AlertDescription className="text-sm">
                💡 <strong>{t('profile.edit_dialog.profile_tab.info_text')}</strong>{' '}
                <a
                  href={`https://nostr.how/${i18n.language}/get-started`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-coral hover:underline inline-flex items-center gap-0.5"
                >
                  {t('profile.edit_dialog.profile_tab.learn_more_link')} →
                </a>
              </AlertDescription>
            </Alert>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">{t('profile.edit_dialog.profile_tab.name_label')}</Label>
                <Input
                  id="name"
                  placeholder={t('profile.edit_dialog.profile_tab.name_placeholder')}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="display-name">{t('profile.edit_dialog.profile_tab.display_name_label')}</Label>
                <Input
                  id="display-name"
                  placeholder={t('profile.edit_dialog.profile_tab.display_name_placeholder')}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="about">{t('profile.edit_dialog.profile_tab.about_label')}</Label>
                <Textarea
                  id="about"
                  placeholder={t('profile.edit_dialog.profile_tab.about_placeholder')}
                  value={about}
                  onChange={(e) => setAbout(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="picture">{t('profile.edit_dialog.profile_tab.picture_label')}</Label>
                <Input
                  id="picture"
                  type="url"
                  placeholder={t('profile.edit_dialog.profile_tab.picture_placeholder')}
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

          </div>

          {/* Account ID Section (npub) */}
          <div className="space-y-3 p-4 border rounded-lg bg-muted/50">
            <div className="space-y-2">
              <Label className="text-sm font-medium">{t('profile.edit_dialog.keys_tab.npub_label')}</Label>
              <p className="text-xs text-muted-foreground">{t('profile.edit_dialog.keys_tab.npub_desc')}</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-background p-2 rounded border font-mono">
                  {truncatedNpub}
                </code>
                <Button variant="outline" size="sm" onClick={handleCopyNpub} className="flex-shrink-0">
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>

          {/* Account Backup Section - Only for local identities */}
          {identity?.type === 'local' && (
            <div className="border rounded-lg">
              <button
                onClick={() => setIsBackupExpanded(!isBackupExpanded)}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  {isBackupExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  <span className="font-medium text-sm">Account Backup</span>
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
              </button>

              {isBackupExpanded && (
                <div className="px-4 pb-4 space-y-3 border-t pt-4">
                  <Alert variant="destructive" className="py-2">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      ⚠️ <strong>Save your account now.</strong> If you lose your key, you lose access forever.
                    </AlertDescription>
                  </Alert>

                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Copy your key and save it in a secure place like{' '}
                      <a
                        href="https://nsec.app"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-coral hover:underline font-medium"
                      >
                        nsec.app
                      </a>
                      {' '}(a key manager) or a password manager.
                    </p>

                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={handleCopyNsec}
                    >
                      <Copy className="mr-2 h-4 w-4" />
                      Copy Secret Key
                    </Button>

                    <p className="text-xs text-muted-foreground">
                      💡 Key managers like nsec.app let you use your identity across all Nostr apps securely.{' '}
                      <a
                        href={`https://nostr.how/${i18n.language}/get-started`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-coral hover:underline"
                      >
                        Learn more
                      </a>
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Extension users - show info */}
          {identity?.type === 'extension' && (
            <Alert className="bg-mint/10 border-mint/30">
              <AlertCircle className="h-4 w-4 text-mint" />
              <AlertDescription className="text-sm">
                🔒 {t('profile.edit_dialog.keys_tab.extension_managed')}
              </AlertDescription>
            </Alert>
          )}

          {/* Push Notifications */}
          <div className="pt-2 border-t">
            <NotificationToggle />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.buttons.cancel')}
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('profile.edit_dialog.profile_tab.save_button')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
