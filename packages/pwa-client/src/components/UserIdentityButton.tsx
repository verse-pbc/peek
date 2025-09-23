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
import { User, LogIn, LogOut, Shield, UserPlus, Zap } from 'lucide-react';
import { Badge } from './ui/badge';

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
  } = useNostrLogin();

  const [showLoginOptions, setShowLoginOptions] = useState(false);

  const handleCreateNew = () => {
    const newIdentity = createNewIdentity();
    // Remove anonymous identity when creating real identity
    localStorage.removeItem('peek_anonymous_identity');
    // Force reload to reconnect with new identity
    window.location.reload();
  };

  const handleImport = (nsec: string) => {
    const imported = importIdentity(nsec);
    // Remove anonymous identity when importing real identity
    localStorage.removeItem('peek_anonymous_identity');
    // Force reload to reconnect with new identity
    window.location.reload();
  };

  const handleLoginWithExtension = async () => {
    try {
      await loginWithExtension();
    } catch (err: any) {
      console.error('Extension login failed:', err);
      alert(err.message || 'Failed to connect to browser extension');
    }
  };

  const displayName = npub ? `${npub.slice(0, 8)}...${npub.slice(-4)}` : 'Not logged in';

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            {isAnonymous ? (
              <>
                <Shield className="h-4 w-4" />
                <span className="hidden sm:inline">Anonymous</span>
                <Badge variant="secondary" className="ml-1">Temp</Badge>
              </>
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
              <DropdownMenuItem onClick={() => setShowIdentityModal(true)}>
                <UserPlus className="mr-2 h-4 w-4" />
                Create/Import Identity
              </DropdownMenuItem>
            </>
          ) : (
            <>
              <DropdownMenuItem onClick={logout}>
                <LogOut className="mr-2 h-4 w-4" />
                Switch to Anonymous
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowIdentityModal(true)}>
                <User className="mr-2 h-4 w-4" />
                Switch Identity
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Identity Modal for login/create/import */}
      {(showIdentityModal || showLoginOptions) && (
        <IdentityModal
          open={showIdentityModal || showLoginOptions}
          onOpenChange={(open) => {
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