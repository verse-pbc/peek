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
import { User, LogIn, LogOut, Shield, UserPlus, Zap, RefreshCw } from 'lucide-react';
import { Badge } from './ui/badge';
import { UserProfile } from './UserProfile';
import { useRelayManager } from '@/contexts/RelayContext';
import { NostrLocationService } from '@/services/nostr-location';
import { hexToBytes } from '@/lib/hex';
import { useToast } from '@/hooks/useToast';

export const UserIdentityButton: React.FC = () => {
  const {
    npub,
    userIdentity,
    isAnonymous,
    logout,
    createNewIdentity,
    importIdentity,
    loginWithExtension,
    hasExtension,
    showIdentityModal,
    setShowIdentityModal,
    identity,
  } = useNostrLogin();
  const { relayManager } = useRelayManager();
  const { toast } = useToast();

  const [showLoginOptions, setShowLoginOptions] = useState(false);
  const [isSwapping, setIsSwapping] = useState(false);

  const handleIdentitySwap = async (newIdentity: { publicKey: string; secretKey: string }) => {
    if (!identity || !relayManager) return;

    setIsSwapping(true);
    try {
      // Get all joined groups
      const joinedGroups = JSON.parse(
        localStorage.getItem('joinedGroups') || '[]'
      );

      if (joinedGroups.length === 0) {
        toast({
          title: "No communities joined",
          description: "Join a community first before switching identity",
          variant: "destructive"
        });
        return;
      }

      const oldPubkey = identity.publicKey;
      const newPubkey = newIdentity.publicKey;

      // Get the new identity's secret key for signing the proof
      const newSecretKey = newIdentity.secretKey === 'NIP07_EXTENSION'
        ? undefined
        : hexToBytes(newIdentity.secretKey);

      // Get the old identity's secret key for the NostrLocationService
      const oldSecretKey = identity.secretKey === 'NIP07_EXTENSION'
        ? new Uint8Array(32) // Dummy key for NIP-07
        : hexToBytes(identity.secretKey);

      // Create NostrLocationService with OLD identity to send/receive the swap request
      const nostrService = new NostrLocationService(
        oldSecretKey,
        oldPubkey,
        relayManager
      );

      // Swap identity in each group
      for (const group of joinedGroups) {
        const response = await nostrService.swapIdentity(
          oldPubkey,
          newPubkey,
          group.groupId,
          newSecretKey  // Pass new identity's secret key for signing the proof
        );

        if (!response.success) {
          throw new Error(response.error || 'Swap failed');
        }
      }

      // Store migration mapping
      const migrations = JSON.parse(
        localStorage.getItem('identity_migrations') || '{}'
      );
      migrations[oldPubkey] = newPubkey;
      localStorage.setItem('identity_migrations', JSON.stringify(migrations));

      // Switch to new identity
      localStorage.setItem('peek_nostr_identity', JSON.stringify(newIdentity));
      localStorage.removeItem('peek_anonymous_identity');

      toast({
        title: "Identity switched successfully",
        description: "Your identity has been updated across all communities",
      });

      // Reload to reconnect with new identity
      setTimeout(() => window.location.reload(), 1000);
    } catch (error) {
      console.error('Identity swap failed:', error);
      toast({
        title: "Switch failed",
        description: error instanceof Error ? error.message : "Failed to switch identity",
        variant: "destructive"
      });
    } finally {
      setIsSwapping(false);
    }
  };

  const handleCreateNew = async () => {
    const newIdentity = createNewIdentity();
    if (isAnonymous && relayManager) {
      await handleIdentitySwap(newIdentity);
    } else {
      // First time login - no swap needed
      localStorage.removeItem('peek_anonymous_identity');
      window.location.reload();
    }
  };

  const handleImport = async (nsec: string) => {
    const newIdentity = importIdentity(nsec);
    if (isAnonymous && relayManager) {
      await handleIdentitySwap(newIdentity);
    } else {
      // First time login - no swap needed
      localStorage.removeItem('peek_anonymous_identity');
      window.location.reload();
    }
  };

  const handleLoginWithExtension = async () => {
    try {
      await loginWithExtension();
    } catch (err: unknown) {
      console.error('Extension login failed:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to connect to browser extension';
      alert(errorMessage);
    }
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
              <DropdownMenuItem onClick={() => setShowLoginOptions(true)}>
                <LogIn className="mr-2 h-4 w-4" />
                Login with Identity
              </DropdownMenuItem>
              {hasExtension && (
                <DropdownMenuItem onClick={handleLoginWithExtension}>
                  <Zap className="mr-2 h-4 w-4" />
                  Connect Browser Extension
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => setShowIdentityModal(true)} disabled={isSwapping}>
                <UserPlus className="mr-2 h-4 w-4" />
                {isSwapping ? 'Switching...' : 'Switch to Real Identity'}
              </DropdownMenuItem>
            </>
          ) : (
            <>
              <DropdownMenuItem onClick={logout}>
                <LogOut className="mr-2 h-4 w-4" />
                Switch to Anonymous
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowIdentityModal(true)} disabled={isSwapping}>
                <RefreshCw className="mr-2 h-4 w-4" />
                {isSwapping ? 'Switching...' : 'Switch Identity'}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Identity Modal for login/create/import */}
      {(showIdentityModal || showLoginOptions) && (
        <IdentityModal
          open={showIdentityModal || showLoginOptions}
          onOpenChange={(_open) => {
            setShowIdentityModal(false);
            setShowLoginOptions(false);
          }}
          onCreateNew={handleCreateNew}
          onImport={handleImport}
          existingNpub={userIdentity?.npub}
        />
      )}
    </>
  );
};