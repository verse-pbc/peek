import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { useNostrLogin } from '@/lib/nostr-identity';
import { IdentityModal } from './IdentityModal';
import { User, Sun, Moon, Monitor, Settings, RefreshCw } from 'lucide-react';
import { UserProfile } from './UserProfile';
import { ProfileEditModal } from './ProfileEditModal';
import { useRelayManager } from '@/contexts/RelayContext';
import { hexToBytes } from '@/lib/hex';
import { useToast } from '@/hooks/useToast';
import { IdentityMigrationService } from '@/services/identity-migration';
import { useTheme } from '@/components/theme-provider';
import { nip19 } from 'nostr-tools';
import type { Event } from 'nostr-tools';
import { useTranslation } from 'react-i18next';

export const UserIdentityButton: React.FC = () => {
  const { t } = useTranslation();
  const {
    loginWithExtension,
    loginWithBunker,
    showIdentityModal,
    setShowIdentityModal,
    identity,
  } = useNostrLogin();
  const { relayManager } = useRelayManager();
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();

  const [isSwapping, setIsSwapping] = useState(false);
  const [showProfileEdit, setShowProfileEdit] = useState(false);
  const [identityModalMode, setIdentityModalMode] = useState<'upgrade' | 'switch'>('upgrade');
  const [hasJoinedCommunities, setHasJoinedCommunities] = useState(false);

  const isUsingExtension = identity?.type === 'extension';

  useEffect(() => {
    const joinedGroups = JSON.parse(localStorage.getItem('joinedGroups') || '[]');
    setHasJoinedCommunities(joinedGroups.length > 0);
  }, []);

  const handleIdentitySwap = async (newIdentity: { type: string; publicKey: string; secretKey?: string }) => {
    if (!identity || !relayManager) return;

    setIsSwapping(true);

    // Declare cleanup functions at function scope so they're accessible in catch
    let unsubscribe: (() => void) | undefined;
    let fallbackTimer: NodeJS.Timeout | undefined;

    try {
      const oldPubkey = identity.publicKey;
      const newPubkey = newIdentity.publicKey;

      // Get the old identity for signing migration event
      // All identity types (local, extension, bunker) support signing
      let oldSecretKey: Uint8Array | undefined;
      if (identity.type === 'local') {
        oldSecretKey = hexToBytes(identity.secretKey);
      }
      // For extension and bunker, signing will be handled by their respective APIs

      // Create migration service
      const migrationService = new IdentityMigrationService(relayManager);

      // Set up listener to clear migrating state when server confirms
      console.log('[UserIdentityButton] Setting up migration completion listener');

      let migrationComplete = false;
      const migrationHandler = (event: Event) => {
        // Check if this 39002 event contains our new pubkey
        if (event.kind === 39002 &&
            event.tags.some(t => t[0] === 'p' && t[1] === newPubkey)) {
          if (!migrationComplete) {
            console.log('[UserIdentityButton] ✅ New identity detected in member list - switching identity');
            migrationComplete = true;
            localStorage.removeItem('identity_migrating');

            // Switch to new identity - this triggers auto-reconnect in RelayContext!
            localStorage.setItem('peek_nostr_identity', JSON.stringify(newIdentity));

            toast({
              title: "Migration complete!",
              description: "Refreshing your communities...",
            });

            if (unsubscribe) unsubscribe();
            if (fallbackTimer) clearTimeout(fallbackTimer);

            // Reload page to refresh communities with new identity
            setTimeout(() => {
              window.location.href = '/';
            }, 1000);
          }
        }
      };

      // Register handler for kind 39002 events
      unsubscribe = relayManager.onEvent('kind:39002', migrationHandler);

      // Set up fallback timeout to clear state even if 39002 never arrives
      fallbackTimer = setTimeout(() => {
        if (!migrationComplete) {
          console.log('[UserIdentityButton] ⏰ Timeout - clearing migrating state');
          localStorage.removeItem('identity_migrating');
          if (unsubscribe) unsubscribe();
        }
      }, 10000);

      // Create and publish migration event
      // Only works if old identity was local (has oldSecretKey)
      if (!oldSecretKey) {
        console.warn('[UserIdentityButton] Cannot migrate from non-local identity');
        return;
      }

      let migrationEvent;
      if (newIdentity.type === 'extension') {
        // New identity uses extension
        migrationEvent = await migrationService.createMigrationEventWithExtension(
          oldSecretKey,
          newPubkey
        );
      } else if (newIdentity.type === 'local' && newIdentity.secretKey) {
        // New identity has secret key
        const newSecretKey = hexToBytes(newIdentity.secretKey);
        migrationEvent = await migrationService.createMigrationEvent(
          oldSecretKey,
          newSecretKey
        );
      } else {
        console.warn('[UserIdentityButton] Cannot migrate to bunker identity');
        return;
      }

      // Publish migration event to relay
      console.log('[UserIdentityButton] About to publish migration event');
      await migrationService.publishMigrationEvent(migrationEvent);
      console.log('[UserIdentityButton] Migration event published to relay - waiting for server to add member');

      // Store migration mapping locally for immediate use
      const migrations = JSON.parse(
        localStorage.getItem('identity_migrations') || '{}'
      );
      migrations[oldPubkey] = newPubkey;
      localStorage.setItem('identity_migrations', JSON.stringify(migrations));

      // Set migrating state with groups we're expecting updates for
      // Need to resolve UUIDs to h-tags
      const joinedGroups = JSON.parse(localStorage.getItem('joinedGroups') || '[]');

      // If no groups, no need to wait - switch immediately
      if (joinedGroups.length === 0) {
        console.log('[UserIdentityButton] No groups to migrate, switching immediately');
        localStorage.setItem('peek_nostr_identity', JSON.stringify(newIdentity));

        toast({
          title: "Identity switched!",
          description: "Refreshing...",
        });

        if (unsubscribe) unsubscribe();
        if (fallbackTimer) clearTimeout(fallbackTimer);

        setTimeout(() => {
          window.location.href = '/';
        }, 500);
        return;
      }

      const groupIds = await Promise.all(
        joinedGroups.map(async (g: { communityId: string }) => {
          const groupId = await relayManager.findGroupByUuid(g.communityId);
          return groupId || null;
        })
      );

      const migratingState = {
        from: oldPubkey,
        to: newPubkey,
        groups: groupIds.filter((id): id is string => id !== null),
        timestamp: Date.now()
      };
      localStorage.setItem('identity_migrating', JSON.stringify(migratingState));

      toast({
        title: "Identity migration in progress",
        description: "Waiting for server to confirm... This should take just a few seconds.",
      });

      // Note: Identity switch happens when 39002 arrives, which triggers auto-reconnect in RelayContext
    } catch (error) {
      console.error('Identity migration failed:', error);

      // Clean up on error
      if (unsubscribe) unsubscribe();
      if (fallbackTimer) clearTimeout(fallbackTimer);

      toast({
        title: "Migration failed",
        description: error instanceof Error ? error.message : "Failed to migrate identity",
        variant: "destructive"
      });
    } finally {
      setIsSwapping(false);
    }
  };

  const handleLoginWithExtension = async () => {
    try {
      const newIdentity = await loginWithExtension();
      const isUpgradingFromLocal = identity?.type === 'local';

      if (isUpgradingFromLocal && relayManager && newIdentity) {
        await handleIdentitySwap(newIdentity);
      } else {
        // Switching between real accounts - reload to refresh UI
        window.location.href = '/';
      }
    } catch (err: unknown) {
      console.error('Extension login failed:', err);

      let title = "Extension connection failed";
      let description = 'Failed to connect to browser extension';

      if (err instanceof Error) {
        if (err.message === 'EXTENSION_CONTEXT_INVALIDATED') {
          title = "Extension connection lost";
          description = "Your browser extension was reloaded or updated. Please reload the page to reconnect.";
        } else if (err.message === 'USER_REJECTED') {
          title = "Login cancelled";
          description = "You cancelled the login request. Try again if you want to connect your extension.";
          return; // Don't show error toast for user cancellation
        } else if (err.message === 'EXTENSION_ERROR') {
          description = "Make sure your extension is unlocked and try again.";
        } else if (err.message) {
          description = err.message;
        }
      }

      toast({
        title,
        description,
        variant: "destructive"
      });
    }
  };

  const handleBunkerLogin = async (
    uri: string,
    options?: { clientSecretKey?: string; isNostrConnect?: boolean }
  ) => {
    const flowType = uri.startsWith('nostrconnect://') ? 'client-initiated' : 'remote-initiated';
    console.log(`[UserIdentityButton] Bunker login requested (${flowType}):`, uri.substring(0, 25) + '...');

    try {
      await loginWithBunker(uri, options);
      setShowIdentityModal(false);
      // Reload to refresh UI with new bunker identity
      window.location.href = '/';
    } catch (err: unknown) {
      console.error('[UserIdentityButton] Bunker login failed:', err);

      toast({
        title: "Bunker connection failed",
        description: err instanceof Error ? err.message : 'Failed to connect to bunker. Please check the connection and try again.',
        variant: "destructive"
      });
      throw err; // Re-throw so IdentityModal can handle it
    }
  };

  const userPubkey = identity?.publicKey;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-2 px-1 hover:bg-transparent">
            {userPubkey ? (
              <UserProfile
                pubkey={userPubkey}
                size="sm"
                showName={true}
                compact={true}
                className="max-w-[200px]"
                nameClassName="hidden sm:inline"
              />
            ) : (
              <>
                <User className="h-4 w-4" />
                <span className="hidden sm:inline">Not logged in</span>
              </>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {userPubkey && (
            <>
              <DropdownMenuItem onClick={() => setShowProfileEdit(true)}>
                <Settings className="mr-2 h-4 w-4" />
                {t('common.user_menu.profile_and_keys')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}

          {/* Theme Toggle Options */}
          <DropdownMenuLabel className="text-xs">{t('common.user_menu.theme')}</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => setTheme("light")}>
            <Sun className="mr-2 h-4 w-4" />
            {t('common.user_menu.theme_light')}
            {theme === 'light' && <span className="ml-auto">✓</span>}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTheme("dark")}>
            <Moon className="mr-2 h-4 w-4" />
            {t('common.user_menu.theme_dark')}
            {theme === 'dark' && <span className="ml-auto">✓</span>}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTheme("system")}>
            <Monitor className="mr-2 h-4 w-4" />
            {t('common.user_menu.theme_system')}
            {theme === 'system' && <span className="ml-auto">✓</span>}
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={() => {
              setShowIdentityModal(true);
              setIdentityModalMode(identity?.type === 'local' ? 'upgrade' : 'switch');
            }}
            disabled={isSwapping}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            {isSwapping ? t('common.user_menu.switching') : t('common.user_menu.switch_account')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Identity Modal */}
      {showIdentityModal && (
        <IdentityModal
          open={showIdentityModal}
          onOpenChange={setShowIdentityModal}
          onExtension={handleLoginWithExtension}
          onBunker={handleBunkerLogin}
          mode={identityModalMode}
          hasBackedUpNsec={identity?.type === 'local' ? (identity.hasBackedUpNsec ?? false) : false}
          currentNsec={identity?.type === 'local'
            ? nip19.nsecEncode(hexToBytes(identity.secretKey))
            : undefined
          }
          isLocalIdentity={identity?.type === 'local'}
          hasJoinedCommunities={hasJoinedCommunities}
          isUsingExtension={isUsingExtension}
        />
      )}

      {/* Profile Edit Modal */}
      {showProfileEdit && userPubkey && (
        <ProfileEditModal
          open={showProfileEdit}
          onOpenChange={setShowProfileEdit}
          pubkey={userPubkey}
        />
      )}
    </>
  );
};