import { useNostr } from '@nostrify/react';
import { NLogin, useNostrLogin } from '@nostrify/react/login';
import { nip19 } from 'nostr-tools';

// NOTE: This file should not be edited except for adding new login methods.

export function useLoginActions() {
  const { nostr } = useNostr();
  const { logins, addLogin, removeLogin } = useNostrLogin();

  return {
    // Login with a Nostr secret key
    nsec(nsec: string): void {
      const login = NLogin.fromNsec(nsec);
      addLogin(login);

      // Also update peek_nostr_identity for RelayContext compatibility
      const STORAGE_KEY = "peek_nostr_identity";
      const pubkey = login.pubkey;
      const npub = nip19.npubEncode(pubkey);

      // Decode nsec to get hex secret key
      const decoded = nip19.decode(nsec);
      const secretKeyHex = typeof decoded.data === 'string' ? decoded.data : '';

      const identity = {
        secretKey: secretKeyHex,
        publicKey: pubkey,
        npub,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
      console.log('[useLoginActions] Synced peek_nostr_identity with nsec:', npub);
    },
    // Login with a NIP-46 "bunker://" URI
    async bunker(uri: string): Promise<void> {
      const login = await NLogin.fromBunker(uri, nostr);
      addLogin(login);
    },
    // Login with a NIP-07 browser extension
    async extension(): Promise<void> {
      const login = await NLogin.fromExtension();
      addLogin(login);

      // Also update peek_nostr_identity for RelayContext compatibility
      const STORAGE_KEY = "peek_nostr_identity";
      const pubkey = login.pubkey;
      const npub = nip19.npubEncode(pubkey);
      const identity = {
        secretKey: "NIP07_EXTENSION",
        publicKey: pubkey,
        npub,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
      console.log('[useLoginActions] Synced peek_nostr_identity with NIP-07 extension:', npub);
    },
    // Log out the current user
    async logout(): Promise<void> {
      const login = logins[0];
      if (login) {
        removeLogin(login.id);

        // Also clear peek_nostr_identity
        const STORAGE_KEY = "peek_nostr_identity";
        localStorage.removeItem(STORAGE_KEY);
        console.log('[useLoginActions] Cleared peek_nostr_identity on logout');
      }
    }
  };
}
