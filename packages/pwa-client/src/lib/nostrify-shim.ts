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

interface StoredIdentity {
  secretKey: string; // hex encoded
  publicKey: string; // hex encoded
  npub: string;
  nsec: string;
}

// Hook for Nostr login
export const useNostrLogin = () => {
  const [identity, setIdentity] = React.useState<StoredIdentity | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [showIdentityModal, setShowIdentityModal] = React.useState(false);
  
  // Load identity from localStorage on mount
  React.useEffect(() => {
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
    setIdentity(null);
    console.log('Nostr logout');
  }, []);
  
  return {
    pubkey: identity?.publicKey || null,
    npub: identity?.npub || null,
    identity,
    login,
    logout,
    createNewIdentity,
    importIdentity,
    isLoading,
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