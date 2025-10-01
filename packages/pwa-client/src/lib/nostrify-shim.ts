// Temporary shim for Nostrify until we properly configure JSR packages
import React from 'react';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { bytesToHex } from '../lib/hex';
import { nip19 } from 'nostr-tools';

export const NostrContext = React.createContext<{ nostr?: unknown }>({});

export const NostrLoginProvider: React.FC<{ 
  children: React.ReactNode;
  storageKey?: string;
}> = ({ children }) => {
  return React.createElement(React.Fragment, null, children);
};

// Storage keys - unified to single identity source
const STORAGE_KEY = 'peek_nostr_identity';

interface StoredIdentity {
  secretKey: string; // hex encoded, or 'NIP07_EXTENSION'
  publicKey: string; // hex encoded
  npub: string;
  isAnonymous: boolean; // true for auto-generated anonymous identities
  createdAt?: number;
  // SECURITY: Never store nsec in localStorage or logs
}

// Check for NIP-07 browser extension
const hasNip07Extension = (): boolean => {
  return typeof window !== 'undefined' && window.nostr !== undefined;
};

// Check if NIP-07 extension supports nip44
export const hasNip44Support = (): boolean => {
  return hasNip07Extension() && window.nostr!.nip44 !== undefined;
};

// NIP-07 nip44 encrypt wrapper
export const nip07Encrypt = async (pubkey: string, plaintext: string): Promise<string> => {
  if (!hasNip44Support()) {
    throw new Error('NIP-07 extension does not support nip44 encryption');
  }
  return window.nostr!.nip44!.encrypt(pubkey, plaintext);
};

// NIP-07 nip44 decrypt wrapper
export const nip07Decrypt = async (pubkey: string, ciphertext: string): Promise<string> => {
  if (!hasNip44Support()) {
    throw new Error('NIP-07 extension does not support nip44 decryption');
  }
  return window.nostr!.nip44!.decrypt(pubkey, ciphertext);
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

    // Load or create identity (unified single source)
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as StoredIdentity;
        setIdentity(parsed);
      } catch (err) {
        console.error('Failed to parse stored identity:', err);
      }
    } else {
      // Auto-create anonymous identity if none exists
      const secretKey = generateSecretKey();
      const publicKey = getPublicKey(secretKey);
      const npub = nip19.npubEncode(publicKey);

      const anonIdentity: StoredIdentity = {
        secretKey: bytesToHex(secretKey),
        publicKey,
        npub,
        isAnonymous: true,
        createdAt: Date.now()
      };

      localStorage.setItem(STORAGE_KEY, JSON.stringify(anonIdentity));
      setIdentity(anonIdentity);
      console.log('Created anonymous identity:', npub);
    }
    setIsLoading(false);
  }, []);
  
  const createNewIdentity = React.useCallback(() => {
    const secretKey = generateSecretKey();
    const publicKey = getPublicKey(secretKey);
    const npub = nip19.npubEncode(publicKey);

    const newIdentity: StoredIdentity = {
      secretKey: bytesToHex(secretKey),
      publicKey,
      npub,
      isAnonymous: false,
      createdAt: Date.now()
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(newIdentity));
    setIdentity(newIdentity);
    // SECURITY: Only log public key, never secret key
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
        isAnonymous: false,
        createdAt: Date.now()
        // SECURITY: Never store nsec in plaintext
      };

      localStorage.setItem(STORAGE_KEY, JSON.stringify(newIdentity));
      setIdentity(newIdentity);
      // SECURITY: Only log public key, never secret key
      console.log('Imported Nostr identity:', npub);
      return newIdentity;
    } catch {
      // SECURITY: Don't log the actual error which might contain nsec
      console.error('Failed to import identity');
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
    // Clear all identity-related data for fresh start
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('joinedGroups');
    localStorage.removeItem('identity_migrations');
    setIdentity(null);
    console.log('Nostr logout - clearing all data for fresh start');
    // Navigate to home for fresh anonymous identity
    window.location.href = '/';
  }, []);

  const loginWithExtension = React.useCallback(async () => {
    if (!hasNip07Extension()) {
      throw new Error('No Nostr browser extension found');
    }

    try {
      // Always get fresh public key from extension
      const publicKey = await window.nostr!.getPublicKey();
      const npub = nip19.npubEncode(publicKey);

      // Check if this is different from current identity
      const storedIdentity = localStorage.getItem(STORAGE_KEY);
      const cached = storedIdentity ? JSON.parse(storedIdentity) : null;

      if (cached && cached.publicKey !== publicKey) {
        console.log(`[loginWithExtension] Extension pubkey changed: ${cached.publicKey.slice(0, 8)}... → ${publicKey.slice(0, 8)}...`);
      }

      // Always update localStorage with current extension state
      const newIdentity: StoredIdentity = {
        secretKey: 'NIP07_EXTENSION',
        publicKey,
        npub,
        isAnonymous: false,
        createdAt: cached?.createdAt || Date.now()
      };

      localStorage.setItem(STORAGE_KEY, JSON.stringify(newIdentity));
      setIdentity(newIdentity);
      console.log('Logged in with browser extension:', npub);

      // Return the identity (reload will happen after migration event)
      return newIdentity;
    } catch (err) {
      console.error('Failed to login with extension:', err);
      throw new Error('Failed to connect to browser extension');
    }
  }, []);

  const switchIdentity = React.useCallback(() => {
    setShowIdentityModal(true);
  }, []);

  return {
    pubkey: identity?.publicKey || null,
    npub: identity?.npub || null,
    identity,
    userIdentity: identity?.isAnonymous ? null : identity,
    isAnonymous: identity?.isAnonymous ?? true,
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
  constructor(_config: unknown) {}

  req(_filters: unknown[]): AsyncIterable<unknown> {
    return {
      async *[Symbol.asyncIterator]() {
        // Mock implementation
      }
    };
  }

  // Add fetchEvents method to match NDK API
  async fetchEvents(_filter: unknown): Promise<Set<unknown>> {
    // Return empty Set for now since we're mocking
    // In production, this would connect to the relay
    return new Set();
  }
}

export class NRelay1 {
  constructor(_url: string) {}
}