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
import { User, LogOut, Shield, UserPlus, Sun, Moon, Monitor } from 'lucide-react';
import { Badge } from './ui/badge';
import { UserProfile } from './UserProfile';
import { useRelayManager } from '@/contexts/RelayContext';
import { hexToBytes } from '@/lib/hex';
import { useToast } from '@/hooks/useToast';
import { IdentityMigrationService } from '@/services/identity-migration';
import { useTheme } from '@/components/theme-provider';

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

  const handleIdentitySwap = async (newIdentity: { publicKey: string; secretKey: string }) => {
    if (!identity || !relayManager) return;

    setIsSwapping(true);
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
      await migrationService.publishMigrationEvent(migrationEvent);

      // Store migration mapping locally for immediate use
      const migrations = JSON.parse(
        localStorage.getItem('identity_migrations') || '{}'
      );
      migrations[oldPubkey] = newPubkey;
      localStorage.setItem('identity_migrations', JSON.stringify(migrations));

      // Switch to new identity
      localStorage.setItem('peek_nostr_identity', JSON.stringify(newIdentity));
      localStorage.removeItem('peek_anonymous_identity');

      toast({
        title: "Identity migration published",
        description: "Your identity migration has been published. Groups will update automatically.",
      });

      // Reload to reconnect with new identity
      setTimeout(() => window.location.reload(), 1500);
    } catch (error) {
      console.error('Identity migration failed:', error);
      toast({
        title: "Migration failed",
        description: error instanceof Error ? error.message : "Failed to migrate identity",
        variant: "destructive"
      });
    } finally {
      setIsSwapping(false);
    }
  };

  const handleImport = async (nsec: string) => {
    console.log('[UserIdentityButton] handleImport called');
    try {
      const newIdentity = importIdentity(nsec);
      console.log('[UserIdentityButton] New identity:', newIdentity);

      if (isAnonymous && relayManager) {
        console.log('[UserIdentityButton] Calling handleIdentitySwap...');
        await handleIdentitySwap(newIdentity);
      } else {
        console.log('[UserIdentityButton] Not anonymous or no relay manager, reloading...');
        // Should not happen - only anonymous users can upgrade
        localStorage.removeItem('peek_anonymous_identity');
        window.location.reload();
      }
    } catch (error) {
      console.error('[UserIdentityButton] handleImport error:', error);
      throw error; // Re-throw so IdentityModal can catch it
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

  const handleLogout = () => {
    // Clear all identity data
    localStorage.removeItem('peek_nostr_identity');
    localStorage.removeItem('peek_anonymous_identity');
    localStorage.removeItem('joinedGroups');
    localStorage.removeItem('identity_migrations');

    // Navigate to home and reload for fresh start
    window.location.href = '/';
  };

  const displayName = npub ? `${npub.slice(0, 8)}...${npub.slice(-4)}` : 'Not logged in';
  const userPubkey = identity?.publicKey;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2 px-2">
            {isAnonymous ? (
              <>
                <Shield className="h-4 w-4" />
                <span className="hidden sm:inline">Anonymous</span>
                <Badge variant="secondary" className="ml-1">Temp</Badge>
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
                <span className="hidden sm:inline">{displayName}</span>
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
                className="font-mono text-xs"
                onClick={() => navigator.clipboard.writeText(npub)}
              >
                {npub.slice(0, 20)}...
                <span className="ml-auto text-xs">Click to copy</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}

          {isAnonymous ? (
            <>
              <DropdownMenuItem onClick={() => setShowIdentityModal(true)} disabled={isSwapping}>
                <UserPlus className="mr-2 h-4 w-4" />
                {isSwapping ? 'Upgrading...' : 'Upgrade to Personal Identity'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          ) : null}

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
          <DropdownMenuItem onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            Logout
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Identity Modal for upgrade (anonymous users only) */}
      {showIdentityModal && isAnonymous && (
        <IdentityModal
          open={showIdentityModal}
          onOpenChange={setShowIdentityModal}
          onImport={handleImport}
          onExtension={handleLoginWithExtension}
          isUpgrade={true}
        />
      )}
    </>
  );
};