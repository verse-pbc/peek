// Temporary shim for Nostrify until we properly configure JSR packages
import React from 'react';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { bytesToHex, hexToBytes } from '../lib/hex';
import { nip19 } from 'nostr-tools';

export const NostrContext = React.createContext<any>({});

export const NostrLoginProvider: React.FC<{ 
  children: React.ReactNode;
  storageKey?: string;
}> = ({ children }) => {
  return React.createElement(React.Fragment, null, children);
};

// Storage keys
const STORAGE_KEY = 'peek_nostr_identity';
const ANON_KEY = 'peek_anonymous_identity';

interface StoredIdentity {
  secretKey: string; // hex encoded
  publicKey: string; // hex encoded
  npub: string;
  nsec: string;
}

interface AnonymousIdentity {
  secretKey: string; // hex encoded
  publicKey: string; // hex encoded
  createdAt: number;
}

// Check for NIP-07 browser extension
const hasNip07Extension = (): boolean => {
  return typeof window !== 'undefined' && window.nostr !== undefined;
};

// Hook for Nostr login
export const useNostrLogin = () => {
  const [identity, setIdentity] = React.useState<StoredIdentity | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [showIdentityModal, setShowIdentityModal] = React.useState(false);
  const [hasExtension, setHasExtension] = React.useState(false);
  
  // Load identity from localStorage on mount
  React.useEffect(() => {
    // Check for NIP-07 extension
    setHasExtension(hasNip07Extension());

    // Load user identity if exists
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as StoredIdentity;
        setIdentity(parsed);
      } catch (err) {
        console.error('Failed to parse stored identity:', err);
      }
    }
    setIsLoading(false);
  }, []);
  
  const createNewIdentity = React.useCallback(() => {
    const secretKey = generateSecretKey();
    const publicKey = getPublicKey(secretKey);
    const npub = nip19.npubEncode(publicKey);
    const nsec = nip19.nsecEncode(secretKey);
    
    const newIdentity: StoredIdentity = {
      secretKey: bytesToHex(secretKey),
      publicKey,
      npub,
      nsec
    };
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newIdentity));
    setIdentity(newIdentity);
    console.log('Created new Nostr identity:', npub);
    return newIdentity;
  }, []);
  
  const importIdentity = React.useCallback((nsecInput: string) => {
    try {
      // Decode the nsec to get the secret key
      const decoded = nip19.decode(nsecInput);
      if (decoded.type !== 'nsec') {
        throw new Error('Invalid nsec format');
      }
      
      const secretKey = decoded.data;
      const publicKey = getPublicKey(secretKey);
      const npub = nip19.npubEncode(publicKey);
      
      const newIdentity: StoredIdentity = {
        secretKey: bytesToHex(secretKey),
        publicKey,
        npub,
        nsec: nsecInput
      };
      
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newIdentity));
      setIdentity(newIdentity);
      console.log('Imported Nostr identity:', npub);
      return newIdentity;
    } catch (err) {
      console.error('Failed to import identity:', err);
      throw new Error('Invalid nsec key');
    }
  }, []);
  
  const login = React.useCallback(async () => {
    // If we have an identity, just return it
    if (identity) {
      return identity;
    }
    
    // Show modal to create or import identity
    setShowIdentityModal(true);
    
    // For now, auto-create a new identity
    const newIdentity = createNewIdentity();
    setShowIdentityModal(false);
    return newIdentity;
  }, [identity, createNewIdentity]);
  
  const logout = React.useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    // Don't remove anonymous identity, just the user identity
    setIdentity(null);
    console.log('Nostr logout - switching to anonymous identity');
    // Force a page reload to reconnect with anonymous identity
    window.location.reload();
  }, []);

  const loginWithExtension = React.useCallback(async () => {
    if (!hasNip07Extension()) {
      throw new Error('No Nostr browser extension found');
    }

    try {
      // Get public key from extension
      const publicKey = await window.nostr!.getPublicKey();
      const npub = nip19.npubEncode(publicKey);

      // We can't get the private key from extension, so we'll use a special marker
      const newIdentity: StoredIdentity = {
        secretKey: 'NIP07_EXTENSION', // Special marker for extension usage
        publicKey,
        npub,
        nsec: 'Using browser extension' // Display text
      };

      localStorage.setItem(STORAGE_KEY, JSON.stringify(newIdentity));
      // Remove anonymous identity when logging in with real identity
      localStorage.removeItem(ANON_KEY);
      setIdentity(newIdentity);
      console.log('Logged in with browser extension:', npub);

      // Force reload to reconnect with new identity
      window.location.reload();
      return newIdentity;
    } catch (err) {
      console.error('Failed to login with extension:', err);
      throw new Error('Failed to connect to browser extension');
    }
  }, []);

  const switchIdentity = React.useCallback(() => {
    setShowIdentityModal(true);
  }, []);

  // Get effective identity (user or anonymous)
  const getEffectiveIdentity = React.useCallback(() => {
    // If user has logged in, use their identity
    if (identity) {
      return identity;
    }

    // Otherwise, check for anonymous identity
    const anonStored = localStorage.getItem(ANON_KEY);
    if (anonStored) {
      const parsed = JSON.parse(anonStored) as AnonymousIdentity;
      return {
        secretKey: parsed.secretKey,
        publicKey: parsed.publicKey,
        npub: nip19.npubEncode(parsed.publicKey),
        nsec: 'Anonymous'
      } as StoredIdentity;
    }

    return null;
  }, [identity]);
  
  const effectiveIdentity = getEffectiveIdentity();

  return {
    pubkey: effectiveIdentity?.publicKey || null,
    npub: effectiveIdentity?.npub || null,
    identity: effectiveIdentity,
    userIdentity: identity, // The actual user identity (not anonymous)
    isAnonymous: !identity, // True if using anonymous identity
    login,
    logout,
    createNewIdentity,
    importIdentity,
    loginWithExtension,
    switchIdentity,
    isLoading,
    hasExtension,
    showIdentityModal,
    setShowIdentityModal
  };
};

// Mock types for now
export interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

// Global window type extension for NIP-07
declare global {
  interface Window {
    nostr?: {
      getPublicKey(): Promise<string>;
      signEvent(event: {
        created_at: number;
        kind: number;
        tags: string[][];
        content: string;
      }): Promise<NostrEvent>;
      nip04?: {
        encrypt(pubkey: string, plaintext: string): Promise<string>;
        decrypt(pubkey: string, ciphertext: string): Promise<string>;
      };
      nip44?: {
        encrypt(pubkey: string, plaintext: string): Promise<string>;
        decrypt(pubkey: string, ciphertext: string): Promise<string>;
      };
    };
  }
}

export class NPool {
  constructor(config: any) {}

  req(filters: any[]): AsyncIterable<any> {
    return {
      async *[Symbol.asyncIterator]() {
        // Mock implementation
      }
    };
  }

  // Add fetchEvents method to match NDK API
  async fetchEvents(filter: any): Promise<Set<any>> {
    // Return empty Set for now since we're mocking
    // In production, this would connect to the relay
    return new Set();
  }
}

export class NRelay1 {
  constructor(url: string) {}
}