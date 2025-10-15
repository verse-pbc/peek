import React, { useState } from 'react';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { useNostrLogin } from '@/lib/nostrify-shim';
import { IdentityModal } from './IdentityModal';
import { User, Shield, UserPlus, Sun, Moon, Monitor, Copy, Key, RefreshCw, Edit } from 'lucide-react';
import { UserProfile } from './UserProfile';
import { ProfileEditModal } from './ProfileEditModal';
import { useRelayManager } from '@/contexts/RelayContext';
import { hexToBytes } from '@/lib/hex';
import { useToast } from '@/hooks/useToast';
import { IdentityMigrationService } from '@/services/identity-migration';
import { useTheme } from '@/components/theme-provider';
import { genUserName } from '@/lib/genUserName';
import { nip19 } from 'nostr-tools';
import type { Event } from 'nostr-tools';

export const UserIdentityButton: React.FC = () => {
  const {
    npub,
    isAnonymous,
    importIdentity,
    loginWithExtension,
    showIdentityModal,
    setShowIdentityModal,
    identity,
  } = useNostrLogin();
  const { relayManager } = useRelayManager();
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();

  const [isSwapping, setIsSwapping] = useState(false);
  const [showProfileEdit, setShowProfileEdit] = useState(false);

  const handleIdentitySwap = async (newIdentity: { publicKey: string; secretKey: string }) => {
    if (!identity || !relayManager) return;

    setIsSwapping(true);

    // Declare cleanup functions at function scope so they're accessible in catch
    let unsubscribe: (() => void) | undefined;
    let fallbackTimer: NodeJS.Timeout | undefined;

    try {
      const oldPubkey = identity.publicKey;
      const newPubkey = newIdentity.publicKey;

      // Get the old identity's secret key
      if (identity.secretKey === 'NIP07_EXTENSION') {
        toast({
          title: "Cannot migrate from extension",
          description: "Migration from NIP-07 extension identities is not supported",
          variant: "destructive"
        });
        return;
      }

      const oldSecretKey = hexToBytes(identity.secretKey);

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
      let migrationEvent;
      if (newIdentity.secretKey === 'NIP07_EXTENSION') {
        // New identity uses extension
        migrationEvent = await migrationService.createMigrationEventWithExtension(
          oldSecretKey,
          newPubkey
        );
      } else {
        // New identity has secret key
        const newSecretKey = hexToBytes(newIdentity.secretKey);
        migrationEvent = await migrationService.createMigrationEvent(
          oldSecretKey,
          newSecretKey
        );
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

  const handleImport = async (nsec: string, shouldMigrate: boolean = true) => {
    console.log('[UserIdentityButton] handleImport called, shouldMigrate:', shouldMigrate);
    try {
      const newIdentity = importIdentity(nsec);
      console.log('[UserIdentityButton] New identity:', newIdentity);

      // Close modal immediately
      setShowIdentityModal(false);

      if (isAnonymous && shouldMigrate && relayManager) {
        // Upgrade with migration (keep communities)
        console.log('[UserIdentityButton] Calling handleIdentitySwap...');
        await handleIdentitySwap(newIdentity);
      } else {
        // Clean switch (fresh start)
        console.log('[UserIdentityButton] Clean switch - clearing state');
        localStorage.removeItem('joinedGroups');
        localStorage.removeItem('identity_migrations');
        localStorage.removeItem('identity_migrating');
        window.location.href = '/';
      }
    } catch (error) {
      console.error('[UserIdentityButton] handleImport error:', error);
      throw error;
    }
  };

  const handleLoginWithExtension = async () => {
    try {
      const newIdentity = await loginWithExtension();
      if (isAnonymous && relayManager && newIdentity) {
        await handleIdentitySwap(newIdentity);
      }
    } catch (err: unknown) {
      console.error('Extension login failed:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to connect to browser extension';
      toast({
        title: "Extension connection failed",
        description: errorMessage,
        variant: "destructive"
      });
    }
  };

  const userPubkey = identity?.publicKey;
  const anonymousName = userPubkey ? genUserName(userPubkey) : 'Anonymous';

  const handleCopyNsec = () => {
    if (!identity?.secretKey || identity.secretKey === 'NIP07_EXTENSION') return;

    const nsec = nip19.nsecEncode(hexToBytes(identity.secretKey));
    navigator.clipboard.writeText(nsec);

    // Mark as backed up
    const updatedIdentity = { ...identity, hasBackedUpNsec: true };
    localStorage.setItem('peek_nostr_identity', JSON.stringify(updatedIdentity));

    toast({
      title: "Secret key copied!",
      description: "Store this safely. You can now switch accounts without losing access."
    });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-2 px-1 hover:bg-transparent">
            {isAnonymous ? (
              <>
                <Shield className="h-4 w-4" />
                <span className="hidden sm:inline">{anonymousName}</span>
              </>
            ) : userPubkey ? (
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
          <DropdownMenuLabel>
            {isAnonymous ? 'Anonymous User' : 'Your Identity'}
          </DropdownMenuLabel>
          {npub && (
            <>
              <DropdownMenuItem
                className="font-mono text-xs justify-between"
                onClick={() => {
                  navigator.clipboard.writeText(npub);
                  toast({ title: "Copied to clipboard" });
                }}
              >
                <span className="truncate">{npub.slice(0, 20)}...</span>
                <Copy className="h-3 w-3 ml-2 flex-shrink-0" />
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}

          {!isAnonymous && userPubkey && (
            <>
              <DropdownMenuItem onClick={() => setShowProfileEdit(true)}>
                <Edit className="mr-2 h-4 w-4" />
                Edit Profile
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}

          {/* Theme Toggle Options */}
          <DropdownMenuLabel className="text-xs">Theme</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => setTheme("light")}>
            <Sun className="mr-2 h-4 w-4" />
            Light
            {theme === 'light' && <span className="ml-auto">✓</span>}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTheme("dark")}>
            <Moon className="mr-2 h-4 w-4" />
            Dark
            {theme === 'dark' && <span className="ml-auto">✓</span>}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTheme("system")}>
            <Monitor className="mr-2 h-4 w-4" />
            System
            {theme === 'system' && <span className="ml-auto">✓</span>}
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {isAnonymous ? (
            <>
              <DropdownMenuItem onClick={handleCopyNsec}>
                <Key className="mr-2 h-4 w-4" />
                Backup Secret Key
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowIdentityModal(true)} disabled={isSwapping}>
                <UserPlus className="mr-2 h-4 w-4" />
                {isSwapping ? 'Switching...' : 'Switch Identity'}
              </DropdownMenuItem>
            </>
          ) : (
            <DropdownMenuItem onClick={() => setShowIdentityModal(true)}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Switch Account
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Identity Modal */}
      {showIdentityModal && (
        <IdentityModal
          open={showIdentityModal}
          onOpenChange={setShowIdentityModal}
          onImport={handleImport}
          onExtension={handleLoginWithExtension}
          mode={isAnonymous ? 'upgrade' : 'switch'}
          hasBackedUpNsec={identity?.hasBackedUpNsec ?? false}
          currentNsec={identity?.secretKey && identity.secretKey !== 'NIP07_EXTENSION'
            ? nip19.nsecEncode(hexToBytes(identity.secretKey))
            : undefined
          }
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