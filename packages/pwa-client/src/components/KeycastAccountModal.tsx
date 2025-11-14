import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { Alert, AlertDescription } from './ui/alert';
import { AlertCircle, Shield, CheckCircle2, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/useToast';
import { ExternalLink } from 'lucide-react';
import {
  connectWithKeycast,
  storeKeycastCredentials,
  KeycastError,
} from '@/services/keycast';
import { useNostrLogin } from '@/lib/nostr-identity';

interface KeycastAccountModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (bunkerUrl: string) => void;
  mode?: 'upgrade' | 'switch';
}

type AuthState = 'idle' | 'opening_popup' | 'waiting_for_auth' | 'exchanging_code' | 'complete' | 'error';

export const KeycastAccountModal: React.FC<KeycastAccountModalProps> = ({
  open,
  onOpenChange,
  onSuccess,
  mode = 'upgrade',
}) => {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const { identity, loginWithBunker } = useNostrLogin();

  const [authState, setAuthState] = useState<AuthState>('idle');
  const [error, setError] = useState('');
  const [hasActivity, setHasActivity] = useState(false);

  // Reset state when modal opens
  React.useEffect(() => {
    if (open) {
      setAuthState('idle');
      setError('');

      // Check if user has joined any communities
      const joinedGroups = JSON.parse(localStorage.getItem('joinedGroups') || '[]');
      setHasActivity(joinedGroups.length > 0);
    }
  }, [open]);

  const getLocalNsec = (): string | undefined => {
    if (!identity || identity.type !== 'local') {
      return undefined;
    }
    // Return the hex secret key for BYOK
    return identity.secretKey;
  };

  const handleConnect = async () => {
    setError('');
    setAuthState('opening_popup');

    try {
      // Get the current local identity's nsec to import (BYOK)
      const nsec = getLocalNsec();

      setAuthState('waiting_for_auth');

      // Start OAuth flow (opens popup)
      // CRITICAL: This must be called in a synchronous event handler for iOS PWA compatibility
      // In upgrade mode: import nsec into new account. In switch mode: login to existing account.
      const bunkerUrl = await connectWithKeycast(
        mode === 'upgrade' ? nsec : undefined,
        mode
      );

      setAuthState('complete');

      // Store bunker URL
      storeKeycastCredentials(bunkerUrl);

      // Show success message
      toast({
        title: t('identity_modal.keycast.success.connected'),
        description: t('identity_modal.keycast.success.reloading'),
      });

      // Login with bunker URL
      if (loginWithBunker) {
        await loginWithBunker(bunkerUrl);
      }

      // Notify parent
      if (onSuccess) {
        onSuccess(bunkerUrl);
      }

      // Close modal
      onOpenChange(false);

      // Reload to activate bunker identity
      setTimeout(() => {
        window.location.reload();
      }, 1000);

    } catch (err) {
      console.error('[KeycastAccountModal] OAuth failed:', err);
      setAuthState('error');

      if (err instanceof KeycastError) {
        setError(err.message);
      } else {
        setError(t('identity_modal.keycast.errors.connection_failed'));
      }
    }
  };

  const isLocalIdentity = identity?.type === 'local';
  const loading = authState !== 'idle' && authState !== 'error';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <DialogTitle>
              {mode === 'switch'
                ? t('identity_modal.keycast.title_switch')
                : t('identity_modal.keycast.title')
              }
            </DialogTitle>
          </div>
          <DialogDescription>
            {mode === 'switch'
              ? t('identity_modal.keycast.description_switch')
              : hasActivity
                ? t('identity_modal.keycast.description_with_communities')
                : t('identity_modal.keycast.description_without_communities')
            }
          </DialogDescription>
        </DialogHeader>

        {/* Benefits list */}
        <div className="bg-muted/50 rounded-lg p-4 space-y-1.5">
          <p className="text-sm font-medium">{t('identity_modal.keycast.benefits')}</p>
          <p className="text-sm text-muted-foreground">{t('identity_modal.keycast.benefit_1')}</p>
          <p className="text-sm text-muted-foreground">{t('identity_modal.keycast.benefit_2')}</p>
          <p className="text-sm text-muted-foreground">{t('identity_modal.keycast.benefit_3')}</p>
          <p className="text-sm text-muted-foreground">
            <a
              href={`https://nostr.how/${i18n.language}/get-started`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground inline-flex items-center gap-1"
            >
              {t('identity_modal.keycast.benefit_4')}
              <ExternalLink className="h-3 w-3" />
            </a>
          </p>
        </div>

        <div className="space-y-4">
          {/* BYOK notice - only for upgrade mode with local identity */}
          {mode === 'upgrade' && isLocalIdentity && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription className="text-sm">
                {t('identity_modal.keycast.byok_notice')}
              </AlertDescription>
            </Alert>
          )}

          {/* OAuth flow description */}
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {t('identity_modal.keycast.oauth_description')}
            </p>
          </div>

          {/* Error message */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Loading state messages */}
          {authState === 'waiting_for_auth' && (
            <Alert>
              <Loader2 className="h-4 w-4 animate-spin" />
              <AlertDescription>
                {t('identity_modal.keycast.states.waiting_for_auth')}
              </AlertDescription>
            </Alert>
          )}

          {authState === 'exchanging_code' && (
            <Alert>
              <Loader2 className="h-4 w-4 animate-spin" />
              <AlertDescription>
                {t('identity_modal.keycast.states.exchanging_code')}
              </AlertDescription>
            </Alert>
          )}

          {/* Connect button */}
          <Button
            onClick={handleConnect}
            className="w-full"
            disabled={loading}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === 'switch'
              ? t('identity_modal.keycast.connect_button_switch')
              : t('identity_modal.keycast.connect_button')
            }
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
