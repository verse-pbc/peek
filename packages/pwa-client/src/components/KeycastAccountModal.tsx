import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Alert, AlertDescription } from './ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { AlertCircle, Shield, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/useToast';
import {
  registerWithKeycast,
  loginToKeycast,
  storeKeycastCredentials,
  KeycastError,
} from '@/services/keycast';
import { useNostrLogin } from '@/lib/nostr-identity';

interface KeycastAccountModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (bunkerUrl: string) => void;
  mode?: 'register' | 'login'; // Default tab to show
}

export const KeycastAccountModal: React.FC<KeycastAccountModalProps> = ({
  open,
  onOpenChange,
  onSuccess,
  mode = 'register',
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { identity, loginWithBunker } = useNostrLogin();

  const [activeTab, setActiveTab] = useState<'register' | 'login'>(mode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Reset form when modal opens
  React.useEffect(() => {
    if (open) {
      setEmail('');
      setPassword('');
      setShowPassword(false);
      setError('');
      setActiveTab(mode);
    }
  }, [open, mode]);

  const getLocalNsec = (): string | undefined => {
    if (!identity || identity.type !== 'local') {
      return undefined;
    }
    // Keycast accepts both hex and nsec format - just return the hex string directly
    return identity.secretKey;
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Get the current local identity's nsec to import
      const nsec = getLocalNsec();

      // Register with Keycast
      const { token, pubkey, bunker_url } = await registerWithKeycast(
        email,
        password,
        nsec
      );

      // Verify pubkey matches if we imported an existing key
      if (nsec && identity?.publicKey && pubkey !== identity.publicKey) {
        throw new Error('Pubkey mismatch - registration failed');
      }

      // Store credentials
      storeKeycastCredentials(email, token, bunker_url);

      // Show success message
      toast({
        title: t('identity_modal.keycast.success.registered'),
        description: t('identity_modal.keycast.success.reloading'),
      });

      // Login with bunker URL
      if (loginWithBunker) {
        await loginWithBunker(bunker_url);
      }

      // Notify parent
      if (onSuccess) {
        onSuccess(bunker_url);
      }

      // Close modal
      onOpenChange(false);

      // Reload to activate bunker identity
      setTimeout(() => {
        window.location.reload();
      }, 1000);

    } catch (err) {
      console.error('[KeycastAccountModal] Registration failed:', err);
      if (err instanceof KeycastError) {
        setError(err.message);
      } else {
        setError(t('identity_modal.keycast.errors.registration_failed'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Login to Keycast
      const { token, bunker_url } = await loginToKeycast(email, password);

      // Store credentials
      storeKeycastCredentials(email, token, bunker_url);

      // Show success message
      toast({
        title: t('identity_modal.keycast.success.logged_in'),
        description: t('identity_modal.keycast.success.reloading'),
      });

      // Login with bunker URL
      if (loginWithBunker) {
        await loginWithBunker(bunker_url);
      }

      // Notify parent
      if (onSuccess) {
        onSuccess(bunker_url);
      }

      // Close modal
      onOpenChange(false);

      // Reload to activate bunker identity
      setTimeout(() => {
        window.location.reload();
      }, 1000);

    } catch (err) {
      console.error('[KeycastAccountModal] Login failed:', err);
      if (err instanceof KeycastError) {
        setError(err.message);
      } else {
        setError(t('identity_modal.keycast.errors.login_failed'));
      }
    } finally {
      setLoading(false);
    }
  };

  const isLocalIdentity = identity?.type === 'local';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <DialogTitle>{t('identity_modal.keycast.title')}</DialogTitle>
          </div>
          <DialogDescription>
            {t('identity_modal.keycast.description')}
          </DialogDescription>
        </DialogHeader>

        {/* Benefits list */}
        <div className="bg-muted/50 rounded-lg p-4 space-y-1.5">
          <p className="text-sm font-medium">{t('identity_modal.keycast.benefits')}</p>
          <p className="text-sm text-muted-foreground">{t('identity_modal.keycast.benefit_1')}</p>
          <p className="text-sm text-muted-foreground">{t('identity_modal.keycast.benefit_2')}</p>
          <p className="text-sm text-muted-foreground">{t('identity_modal.keycast.benefit_3')}</p>
          <p className="text-sm text-muted-foreground">{t('identity_modal.keycast.benefit_4')}</p>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'register' | 'login')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="register">
              {t('identity_modal.keycast.tabs.register')}
            </TabsTrigger>
            <TabsTrigger value="login">
              {t('identity_modal.keycast.tabs.login')}
            </TabsTrigger>
          </TabsList>

          {/* Register Tab */}
          <TabsContent value="register" className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                {t('identity_modal.keycast.register.description')}
              </p>
              {isLocalIdentity && (
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertDescription className="text-sm">
                    {t('identity_modal.keycast.register.existing_key_note')}
                  </AlertDescription>
                </Alert>
              )}
            </div>

            <form onSubmit={handleRegister} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="register-email">
                  {t('identity_modal.keycast.register.email_label')}
                </Label>
                <Input
                  id="register-email"
                  type="email"
                  placeholder={t('identity_modal.keycast.register.email_placeholder')}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="register-password">
                  {t('identity_modal.keycast.register.password_label')}
                </Label>
                <div className="relative">
                  <Input
                    id="register-password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder={t('identity_modal.keycast.register.password_placeholder')}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={loading}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={showPassword ? t('common.hide_password') : t('common.show_password')}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  {t('identity_modal.keycast.register.warning')}
                </AlertDescription>
              </Alert>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? t('identity_modal.keycast.register.submitting') : t('identity_modal.keycast.register.submit_button')}
              </Button>
            </form>
          </TabsContent>

          {/* Login Tab */}
          <TabsContent value="login" className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t('identity_modal.keycast.login.description')}
            </p>

            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="login-email">
                  {t('identity_modal.keycast.login.email_label')}
                </Label>
                <Input
                  id="login-email"
                  type="email"
                  placeholder={t('identity_modal.keycast.login.email_placeholder')}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="login-password">
                  {t('identity_modal.keycast.login.password_label')}
                </Label>
                <div className="relative">
                  <Input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder={t('identity_modal.keycast.login.password_placeholder')}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={loading}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={showPassword ? t('common.hide_password') : t('common.show_password')}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? t('identity_modal.keycast.login.submitting') : t('identity_modal.keycast.login.submit_button')}
              </Button>

              <p className="text-sm text-center text-muted-foreground">
                {t('identity_modal.keycast.login.no_account')}{' '}
                <button
                  type="button"
                  onClick={() => setActiveTab('register')}
                  className="text-primary hover:underline"
                >
                  {t('identity_modal.keycast.tabs.register')}
                </button>
              </p>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
