import { useMemo } from 'react';
import { setupNostrIdentity, type IdentitySetup } from '@/lib/nostr-identity-helper';
import { useNostrLogin } from '@/lib/nostr-identity';

/**
 * Hook to get properly configured Nostr identity and encryption for operations
 * Data-oriented: delegates to pure function, handles React integration
 */
export function useNostrIdentity(): IdentitySetup {
  const { identity, pubkey } = useNostrLogin();

  // Use useMemo to prevent recalculating on every render
  // This is deterministic based on identity state
  const identitySetup = useMemo(() => {
    return setupNostrIdentity(identity, pubkey);
  }, [identity, pubkey]);

  return identitySetup;
}
