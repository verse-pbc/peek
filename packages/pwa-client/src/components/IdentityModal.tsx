import React, { useState } from 'react';
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
import { Alert, AlertDescription } from './ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Checkbox } from './ui/checkbox';
import { AlertCircle, Zap, Copy, AlertTriangle, Cloud, Shield, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useTranslation } from 'react-i18next';
import { generateNostrConnectURI } from '@/lib/nostr-identity';
import { connectWithKeycast, storeKeycastCredentials, KeycastError } from '@/services/keycast';
import { useNostrLogin } from '@/lib/nostr-identity';

interface IdentityModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExtension?: () => void;
  onBunker?: (uri: string, options?: { clientSecretKey?: string; isNostrConnect?: boolean }) => void;
  mode: 'upgrade' | 'switch';
  hasBackedUpNsec?: boolean;
  currentNsec?: string;
  hasJoinedCommunities?: boolean;
  isUsingExtension?: boolean;
  isLocalIdentity?: boolean; // Auto-generated local identity (can be upgraded)
  initialTab?: 'extension' | 'keycast' | 'bunker';
}

export const IdentityModal: React.FC<IdentityModalProps> = ({
  open,
  onOpenChange,
  onExtension,
  onBunker,
  mode,
  hasBackedUpNsec: _hasBackedUpNsec = false,
  currentNsec,
  hasJoinedCommunities = false,
  isUsingExtension = false,
  isLocalIdentity = false,
  initialTab,
}) => {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const { identity: currentIdentity, loginWithBunker } = useNostrLogin();
  const [bunkerUri, setBunkerUri] = useState('');
  const [bunkerError, setBunkerError] = useState<string | null>(null);
  // Default to bunker tab for switch mode (logging in), keycast for upgrade mode (saving account)
  const defaultTab = initialTab || (mode === 'switch' ? 'bunker' : 'keycast');
  const [activeTab, setActiveTab] = useState<'extension' | 'keycast' | 'bunker'>(defaultTab);
  const [keepCommunities, setKeepCommunities] = useState(true);
  const [hasConfirmedBackup, setHasConfirmedBackup] = useState(false);

  // Keycast OAuth state
  const [keycastLoading, setKeycastLoading] = useState(false);
  const [keycastError, setKeycastError] = useState('');

  // Bunker-specific state
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [nostrConnectUri, setNostrConnectUri] = useState<string | null>(null);
  const [isWaitingForConnection, setIsWaitingForConnection] = useState(false);

  const showMigrationChoice = mode === 'upgrade' && isLocalIdentity && hasJoinedCommunities;
  const hasExtension = typeof window !== 'undefined' && !!window.nostr;
  const showExtensionTab = hasExtension && !isUsingExtension && !isMobile; // Hide extension tab on mobile

  const handleCopyCurrentNsec = () => {
    if (!currentNsec) return;
    navigator.clipboard.writeText(currentNsec);
    setHasConfirmedBackup(true);
    toast({ title: "Secret key copied!", description: "Store this safely to return to your communities later." });
  };

  const handleCheckboxChange = (checked: boolean | 'indeterminate') => {
    setKeepCommunities(checked === true);
  };

  const handleExtension = () => {
    if (onExtension) {
      onExtension();
      onOpenChange(false);
    }
  };

  const handleKeycastDirect = async () => {
    setKeycastLoading(true);
    setKeycastError('');

    try {
      // Get nsec only for upgrade mode
      const nsec = mode === 'upgrade' && currentIdentity?.type === 'local'
        ? currentIdentity.secretKey
        : undefined;

      // Call OAuth flow directly
      const bunkerUrl = await connectWithKeycast(nsec, mode);

      // Store bunker URL
      storeKeycastCredentials(bunkerUrl);

      // Login with bunker
      if (loginWithBunker) {
        await loginWithBunker(bunkerUrl);
      }

      // Success
      toast({
        title: mode === 'switch'
          ? t('identity_modal.keycast.success.connected')
          : t('identity_modal.keycast.success.connected'),
        description: t('identity_modal.keycast.success.reloading'),
      });

      onOpenChange(false);

      setTimeout(() => {
        window.location.reload();
      }, 1000);

    } catch (err) {
      console.error('[IdentityModal] Keycast OAuth failed:', err);

      if (err instanceof KeycastError) {
        setKeycastError(err.message);
      } else {
        setKeycastError(t('identity_modal.keycast.errors.connection_failed'));
      }
    } finally {
      setKeycastLoading(false);
    }
  };

  const handleBunker = React.useCallback(() => {
    if (!bunkerUri.trim()) {
      setBunkerError('Please enter a bunker URI');
      return;
    }

    if (!bunkerUri.startsWith('bunker://')) {
      setBunkerError('Invalid bunker URI format. Must start with bunker://');
      return;
    }

    try {
      if (onBunker) {
        onBunker(bunkerUri);
        onOpenChange(false);
      }
    } catch (err) {
      console.error('[IdentityModal] onBunker failed:', err);
      setBunkerError('Failed to connect to bunker. Please check the URI.');
    }
  }, [bunkerUri, onBunker, onOpenChange]);

  const handleGenerateNostrConnect = async () => {
    try {
      const data = generateNostrConnectURI();
      setNostrConnectUri(data.uri);
      setBunkerError(null);
      setIsWaitingForConnection(true);

      console.log('[IdentityModal] Generated nostrconnect:// with nsec.app format');

      // Start listening for connection
      if (onBunker) {
        await onBunker(data.uri, {
          clientSecretKey: data.clientSecretKey,
          isNostrConnect: true
        });
      }
    } catch (err) {
      console.error('[IdentityModal] Failed:', err);
      setBunkerError(err instanceof Error ? err.message : 'Connection failed');
      setIsWaitingForConnection(false);
    }
  };

  const handleCopyNostrConnect = () => {
    if (!nostrConnectUri) return;
    navigator.clipboard.writeText(nostrConnectUri);
    toast({
      title: t('identity_modal.key_manager.copy_toast_title'),
      description: t('identity_modal.key_manager.copy_toast_description')
    });
  };

  // Set default tab based on platform and available options
  React.useEffect(() => {
    if (showExtensionTab) {
      setActiveTab('extension'); // Default to extension on desktop if available
    } else {
      setActiveTab('bunker'); // Default to bunker (mobile or no extension)
    }
  }, [showExtensionTab]);

  // Bunker content component (used in both tabbed and flat layouts)
  const BunkerContent = () => {
    return (
      <>
        <div className="space-y-3">
          <div>
            <p className="font-medium text-sm">{t('identity_modal.key_manager.title')}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {t('identity_modal.key_manager.description')}
            </p>
          </div>

          {!showAdvanced ? (
            // Default: Generate nostrconnect (client-initiated)
            !nostrConnectUri ? (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  {t('identity_modal.key_manager.generate_desc')}
                </p>

                <Button onClick={handleGenerateNostrConnect} className="w-full">
                  <Cloud className="mr-2 h-4 w-4" />
                  {t('identity_modal.key_manager.generate_button')}
                </Button>

                <div className="flex justify-end">
                  <button
                    onClick={() => setShowAdvanced(true)}
                    className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                  >
                    {t('identity_modal.key_manager.advanced_bunker')}
                  </button>
                </div>
              </div>
            ) : (
              // After generating
              <div className="space-y-3">
                {isWaitingForConnection && (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      <p className="font-medium">{t('identity_modal.key_manager.waiting_approval')}</p>
                      <p className="text-xs mt-1 text-muted-foreground">
                        {t('identity_modal.key_manager.waiting_subtitle')}
                      </p>
                    </AlertDescription>
                  </Alert>
                )}

                <div>
                  <div className="flex justify-between mb-1">
                    <Label className="text-sm">{t('identity_modal.key_manager.connection_code')}</Label>
                    <Button onClick={handleCopyNostrConnect} size="sm" variant="ghost">
                      <Copy className="w-3 h-3 mr-1" />
                      {t('common.buttons.copy')}
                    </Button>
                  </div>
                  <Input
                    value={nostrConnectUri}
                    readOnly
                    className="font-mono text-xs"
                    onClick={(e) => e.currentTarget.select()}
                  />
                </div>

                <p className="text-xs text-muted-foreground">
                  {t('identity_modal.key_manager.paste_instruction')}
                </p>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setNostrConnectUri(null);
                    setIsWaitingForConnection(false);
                  }}
                >
                  {t('identity_modal.key_manager.start_over')}
                </Button>
              </div>
            )
          ) : (
            // Advanced: Paste bunker URL (remote-initiated)
            <div className="space-y-3">
              <button
                onClick={() => setShowAdvanced(false)}
                className="text-xs text-blue-600 hover:underline"
              >
                {t('identity_modal.key_manager.back_to_generate')}
              </button>

              <div className="space-y-2">
                <Label htmlFor="bunkerUri">{t('identity_modal.key_manager.input_label')}</Label>
                <Input
                  id="bunkerUri"
                  type="text"
                  placeholder="bunker://..."
                  value={bunkerUri}
                  onChange={(e) => {
                    setBunkerUri(e.target.value);
                    setBunkerError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleBunker();
                  }}
                  className="font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground">
                  {t('identity_modal.key_manager.input_hint')}
                </p>
              </div>

              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                  {t('identity_modal.key_manager.how_to_get')}
                </summary>
                <ol className="mt-2 space-y-1 list-decimal list-inside text-muted-foreground">
                  <li><a href="https://nsec.app" target="_blank" className="text-blue-600 hover:underline">{t('identity_modal.key_manager.steps.1')}</a></li>
                  <li>{t('identity_modal.key_manager.steps.2')}</li>
                  <li>{t('identity_modal.key_manager.steps.3')}</li>
                  <li>{t('identity_modal.key_manager.steps.4')}</li>
                  <li>{t('identity_modal.key_manager.steps.5')}</li>
                  <li>{t('identity_modal.key_manager.steps.6')}</li>
                </ol>
                <p className="mt-2 text-muted-foreground">
                  💡 {t('identity_modal.key_manager.popup_blocked')}
                </p>
              </details>

              <DialogFooter>
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  {t('identity_modal.cancel')}
                </Button>
                <Button
                  onClick={handleBunker}
                  disabled={!bunkerUri.trim()}
                  className="flex-1"
                >
                  <Cloud className="mr-2 h-4 w-4" />
                  {t('identity_modal.key_manager.connect_button')}
                </Button>
              </DialogFooter>
            </div>
          )}
        </div>

        {bunkerError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{bunkerError}</AlertDescription>
          </Alert>
        )}
      </>
    );
  };

  // Offer to import or use extension
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t('identity_modal.title')}</DialogTitle>
          <DialogDescription className="space-y-2">
            <span>
              {mode === 'upgrade' && hasJoinedCommunities
                ? t('identity_modal.description_with_migration')
                : t('identity_modal.description')
              }
            </span>
            <a
              href={`https://nostr.how/${i18n.language}/get-started`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-coral hover:underline inline-flex items-center gap-1"
            >
              {t('identity_modal.new_to_nostr_link')} →
            </a>
          </DialogDescription>
        </DialogHeader>

        {/* Migration choice for auto-generated users with communities */}
        {showMigrationChoice && (
          <div className="space-y-3 p-4 border rounded-lg bg-muted/50">
            <div className="flex items-start space-x-3">
              <Checkbox
                id="keep-communities"
                checked={keepCommunities}
                onCheckedChange={handleCheckboxChange}
                className="mt-0.5"
              />
              <div className="flex-1 space-y-1">
                <label
                  htmlFor="keep-communities"
                  className="text-sm font-medium cursor-pointer leading-tight"
                >
                  {t('identity_modal.migration.keep_communities')}
                </label>
                <p className="text-xs text-muted-foreground">
                  {t('identity_modal.migration.keep_description')}
                </p>
              </div>
            </div>

            {/* Inline backup warning when unchecked */}
            {!keepCommunities && (
              <div className="space-y-3 pt-3 border-t">
                <div className="flex gap-2 text-destructive">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <div className="text-sm space-y-2">
                    <div className="font-medium">{t('identity_modal.migration.save_key_warning')}</div>
                    <div>
                      {t('identity_modal.migration.save_key_reason')}
                    </div>
                  </div>
                </div>
                {currentNsec && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={handleCopyCurrentNsec}
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    {hasConfirmedBackup ? t('identity_modal.migration.key_copied') : t('identity_modal.migration.copy_key')}
                  </Button>
                )}
                <p className="text-xs text-muted-foreground">
                  {t('identity_modal.migration.store_safely')}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Show tabs only when multiple options available */}
        {showExtensionTab ? (
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'extension' | 'keycast' | 'bunker')}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="extension">
                <Shield className="w-4 h-4 mr-2" />
                {t('identity_modal.tabs.extension')}
              </TabsTrigger>
              <TabsTrigger value="keycast">
                <Shield className="w-4 h-4 mr-2" />
                {t('identity_modal.tabs.keycast')}
              </TabsTrigger>
              <TabsTrigger value="bunker">
                <Cloud className="w-4 h-4 mr-2" />
                {t('identity_modal.tabs.key_manager')}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="extension" className="space-y-4">
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {t('identity_modal.extension.description')}
              </p>

              <Alert>
                <Zap className="h-4 w-4" />
                <AlertDescription>
                  {t('identity_modal.extension.security_note')}
                </AlertDescription>
              </Alert>

              {!window.nostr && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {t('identity_modal.extension.not_detected')}
                  </AlertDescription>
                </Alert>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t('identity_modal.cancel')}
              </Button>
              <Button
                type="button"
                onClick={handleExtension}
                disabled={!window.nostr || !onExtension}
              >
                <Zap className="mr-2 h-4 w-4" />
                {t('identity_modal.extension.connect_button')}
              </Button>
            </DialogFooter>
          </TabsContent>

            <TabsContent value="keycast" className="space-y-4">
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {mode === 'switch'
                    ? t('identity_modal.keycast.description_switch')
                    : t('identity_modal.keycast.description')
                  }
                </p>

                {/* Keycast OAuth button - calls directly without intermediate modal */}
                <Button
                  type="button"
                  onClick={handleKeycastDirect}
                  className="w-full"
                  disabled={keycastLoading}
                >
                  {keycastLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <Shield className="mr-2 h-4 w-4" />
                  {mode === 'switch'
                    ? t('identity_modal.keycast.connect_button_switch')
                    : t('identity_modal.keycast.connect_button')
                  }
                </Button>

                {/* Error message */}
                {keycastError && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="text-sm">{keycastError}</AlertDescription>
                  </Alert>
                )}

                {/* Benefits preview */}
                <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                  <p className="text-xs font-medium">{t('identity_modal.keycast.benefits')}</p>
                  <p className="text-xs text-muted-foreground">{t('identity_modal.keycast.benefit_1')}</p>
                  <p className="text-xs text-muted-foreground">{t('identity_modal.keycast.benefit_2')}</p>
                  <p className="text-xs text-muted-foreground">{t('identity_modal.keycast.benefit_3')}</p>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="bunker" className="space-y-4">
              <BunkerContent />
            </TabsContent>
          </Tabs>
        ) : (
          // Mobile: Show Keycast and Bunker options
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'keycast' | 'bunker')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="keycast">
                <Shield className="w-4 h-4 mr-2" />
                {t('identity_modal.tabs.keycast')}
              </TabsTrigger>
              <TabsTrigger value="bunker">
                <Cloud className="w-4 h-4 mr-2" />
                {t('identity_modal.tabs.key_manager')}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="keycast" className="space-y-4">
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {mode === 'switch'
                    ? t('identity_modal.keycast.description_switch')
                    : t('identity_modal.keycast.description')
                  }
                </p>

                <Button
                  type="button"
                  onClick={handleKeycastDirect}
                  className="w-full"
                  disabled={keycastLoading}
                >
                  {keycastLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <Shield className="mr-2 h-4 w-4" />
                  {mode === 'switch'
                    ? t('identity_modal.keycast.connect_button_switch')
                    : t('identity_modal.keycast.connect_button')
                  }
                </Button>

                {/* Error message */}
                {keycastError && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="text-sm">{keycastError}</AlertDescription>
                  </Alert>
                )}

                <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                  <p className="text-xs font-medium">{t('identity_modal.keycast.benefits')}</p>
                  <p className="text-xs text-muted-foreground">{t('identity_modal.keycast.benefit_1')}</p>
                  <p className="text-xs text-muted-foreground">{t('identity_modal.keycast.benefit_2')}</p>
                  <p className="text-xs text-muted-foreground">{t('identity_modal.keycast.benefit_3')}</p>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="bunker" className="space-y-4">
              <BunkerContent />
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>

    </Dialog>
  );
};