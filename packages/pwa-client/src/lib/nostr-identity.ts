/**
 * Peek's Nostr Identity Management System
 *
 * Manages three types of Nostr identities using discriminated unions:
 * - Local: Keys stored locally (auto-generated or imported)
 * - Extension: Browser extension signing (NIP-07)
 * - Bunker: Remote signing service (NIP-46)
 */
import React from 'react';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { bytesToHex, hexToBytes } from '../lib/hex';
import { nip19, type EventTemplate, type VerifiedEvent } from 'nostr-tools';

export const NostrContext = React.createContext<{ nostr?: unknown }>({});

export const NostrLoginProvider: React.FC<{
  children: React.ReactNode;
  storageKey?: string;
}> = ({ children }) => {
  return React.createElement(React.Fragment, null, children);
};

// Storage keys - unified to single identity source
const STORAGE_KEY = 'peek_nostr_identity';

/**
 * Local identity with keys stored in localStorage
 * Used for: auto-generated identities (on first visit)
 * Note: ALL LocalIdentity entries are auto-generated. User-imported keys use Extension or Bunker.
 */
interface LocalIdentity {
  type: 'local';
  secretKey: string; // hex encoded
  publicKey: string; // hex encoded
  npub: string;
  hasBackedUpNsec?: boolean; // true if user has copied their nsec for backup
  createdAt?: number;
}

/**
 * Browser extension identity (NIP-07)
 * Keys managed by extension, we only store the public key
 */
interface ExtensionIdentity {
  type: 'extension';
  publicKey: string; // hex encoded
  npub: string;
  createdAt?: number;
}

/**
 * Bunker identity (NIP-46 remote signing)
 * Stores BunkerPointer data for reconnection per NIP-46 spec
 */
interface BunkerIdentity {
  type: 'bunker';
  bunkerPubkey: string; // hex encoded bunker's pubkey (remote signer)
  relays: string[]; // Relay URLs for NIP-46 communication
  clientSecretKey: string; // hex encoded client keypair for connection
  secret?: string; // Optional connection secret
  publicKey: string; // hex encoded remote pubkey (same as bunkerPubkey typically)
  npub: string;
  createdAt?: number;
}

/**
 * Discriminated union of all identity types
 * TypeScript will enforce correct fields based on the 'type' property
 */
export type StoredIdentity = LocalIdentity | ExtensionIdentity | BunkerIdentity;

// SECURITY: Never store nsec in localStorage or logs

// Check for NIP-07 browser extension
const hasNip07Extension = (): boolean => {
  return typeof window !== 'undefined' && window.nostr !== undefined;
};

/**
 * Generate a nostrconnect:// URI for client-initiated NIP-46 flow
 * User pastes this into their remote signer (like nsec.app)
 *
 * Following nostr-login pattern for nsec.app compatibility:
 * - Includes image, url, name, perms metadata (all URL-encoded)
 * - Metadata parameters come BEFORE secret and relay
 * - Uses single relay (wss://relay.nsec.app/)
 *
 * @returns Connection data including URI, client keys, and relay
 */
export function generateNostrConnectURI(): {
  uri: string;
  clientSecretKey: string; // hex encoded
  clientPubkey: string;
  secret: string;
  relay: string;
} {
  // Generate client keypair
  const clientSecretKey = generateSecretKey();
  const clientPubkey = getPublicKey(clientSecretKey);

  // Generate random secret (shorter for URL compatibility)
  const secret = Math.random().toString(36).substring(7);

  // Get app metadata (URL-encoded as per nostr-login pattern)
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://peek.verse.app';
  const hostname = typeof window !== 'undefined' ? window.location.host : 'peek.verse.app';

  // Get favicon URL (simplified - use default if not found)
  const icon = `${origin}/pwa-192x192.png`;

  const metadata = {
    image: encodeURIComponent(icon),
    url: encodeURIComponent(origin),
    name: encodeURIComponent(hostname),
    perms: encodeURIComponent(''), // Empty for now, could add specific permissions
  };

  // Use nsec.app's relay (as per nostr-login pattern)
  const relayUrl = 'wss://relay.nsec.app/';

  // Build URI with metadata BEFORE secret and relay (order matters for nsec.app!)
  const uri = `nostrconnect://${clientPubkey}?image=${metadata.image}&url=${metadata.url}&name=${metadata.name}&perms=${metadata.perms}&secret=${secret}&relay=${relayUrl}`;

  return {
    uri,
    clientSecretKey: bytesToHex(clientSecretKey),
    clientPubkey,
    secret,
    relay: relayUrl
  };
}

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
        const parsed = JSON.parse(stored);

        // Migrate old format to discriminated union if needed
        if (!parsed.type) {
          console.log('[Identity] Migrating old identity format to discriminated union');
          let migrated: StoredIdentity;

          if (parsed.secretKey === 'NIP07_EXTENSION') {
            // Old extension identity
            migrated = {
              type: 'extension',
              publicKey: parsed.publicKey,
              npub: parsed.npub,
              createdAt: parsed.createdAt || Date.now()
            };
          } else {
            // Old local identity
            migrated = {
              type: 'local',
              secretKey: parsed.secretKey,
              publicKey: parsed.publicKey,
              npub: parsed.npub,
              hasBackedUpNsec: parsed.hasBackedUpNsec,
              createdAt: parsed.createdAt || Date.now()
            };
          }

          localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
          setIdentity(migrated);
        } else {
          // Already in new format
          setIdentity(parsed as StoredIdentity);
        }
      } catch (err) {
        console.error('Failed to parse stored identity:', err);
      }
    } else {
      // Auto-create anonymous identity if none exists
      const secretKey = generateSecretKey();
      const publicKey = getPublicKey(secretKey);
      const npub = nip19.npubEncode(publicKey);

      const anonIdentity: LocalIdentity = {
        type: 'local',
        secretKey: bytesToHex(secretKey),
        publicKey,
        npub,
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

    const newIdentity: LocalIdentity = {
      type: 'local',
      secretKey: bytesToHex(secretKey),
      publicKey,
      npub,
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

      const newIdentity: LocalIdentity = {
        type: 'local',
        secretKey: bytesToHex(secretKey),
        publicKey,
        npub,
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
      const newIdentity: ExtensionIdentity = {
        type: 'extension',
        publicKey,
        npub,
        createdAt: cached?.createdAt || Date.now()
      };

      localStorage.setItem(STORAGE_KEY, JSON.stringify(newIdentity));
      setIdentity(newIdentity);
      console.log('Logged in with browser extension:', npub);

      // Return the identity (reload will happen after migration event)
      return newIdentity;
    } catch (err) {
      console.error('Failed to login with extension:', err);

      // Detect specific error types for better user guidance
      const errorMessage = err instanceof Error ? err.message : String(err);

      // Extension context invalidated (extension reloaded/updated)
      if (errorMessage.includes('Extension context invalidated') ||
          errorMessage.includes('context invalidated')) {
        throw new Error('EXTENSION_CONTEXT_INVALIDATED');
      }

      // User rejected the request
      if (errorMessage.includes('reject') ||
          errorMessage.includes('cancel') ||
          errorMessage.includes('denied')) {
        throw new Error('USER_REJECTED');
      }

      // Generic extension error
      throw new Error('EXTENSION_ERROR');
    }
  }, []);

  const loginWithBunker = React.useCallback(async (
    uri: string,
    options?: {
      clientSecretKey?: string;
      isNostrConnect?: boolean;
    }
  ): Promise<BunkerIdentity> => {
    try {
      // Dynamically import NIP-46 support from nostr-tools
      const { parseBunkerInput, BunkerSigner } = await import('nostr-tools/nip46');

      let signer: { signEvent: (event: EventTemplate) => Promise<VerifiedEvent>; close: () => Promise<void>; getPublicKey: () => Promise<string>; connect?: () => Promise<void> };
      let remotePubkey: string;
      let clientSecretKeyHex: string;
      let bunkerRelays: string[];
      let connectionSecret: string | undefined;

      if (uri.startsWith('nostrconnect://')) {
        // Client-initiated flow: wait for remote signer to connect
        console.log('[loginWithBunker] Client-initiated flow - waiting for remote signer...');

        // Extract relay from URI for logging (don't log secret!)
        const uriParts = uri.split('?');
        const clientPubkey = uriParts[0].replace('nostrconnect://', '');
        const params = new URLSearchParams(uriParts[1] || '');
        const relay = params.get('relay');
        console.log('[loginWithBunker] Client pubkey:', clientPubkey.substring(0, 16) + '...');
        console.log('[loginWithBunker] Will listen on relay:', relay);
        // SECURITY: Never log the secret or full URI

        if (!options?.clientSecretKey) {
          throw new Error('clientSecretKey required for nostrconnect:// URIs');
        }

        clientSecretKeyHex = options.clientSecretKey;
        // SECURITY: Don't log secret keys

        // Use BunkerSigner.fromURI which waits for connection (up to 5 minutes)
        console.log('[loginWithBunker] Creating BunkerSigner.fromURI - will connect to relay and listen...');
        console.log('[loginWithBunker] Waiting for remote signer to connect (timeout: 5 minutes)...');

        // Import SimplePool for BunkerSigner
        console.log('[loginWithBunker] Importing SimplePool from nostr-tools/pool...');
        let SimplePool;
        try {
          const poolModule = await import('nostr-tools/pool');
          SimplePool = poolModule.SimplePool;
          console.log('[loginWithBunker] SimplePool imported successfully');
        } catch (importError) {
          console.error('[loginWithBunker] Failed to import SimplePool:', importError);
          throw new Error('Failed to import nostr-tools/pool');
        }

        const pool = new SimplePool();
        console.log('[loginWithBunker] Created SimplePool instance');

        try {
          console.log('[loginWithBunker] Calling BunkerSigner.fromURI with pool...');
          signer = await BunkerSigner.fromURI(
            hexToBytes(clientSecretKeyHex),
            uri,
            {
              pool, // Provide pool instance
              onauth: (url: string) => {
                console.log('[loginWithBunker] 🔐 Auth required:', url);
              }
            },
            300_000 // 5 minute timeout
          );

          console.log('[loginWithBunker] ✅ BunkerSigner.fromURI completed!');

          // Get remote signer's pubkey
          remotePubkey = await signer.getPublicKey();
          console.log('[loginWithBunker] ✅ Remote signer connected! Pubkey:', remotePubkey.slice(0, 8) + '...');

          // Save relay info for reconnection
          bunkerRelays = ['wss://relay.nsec.app/'];
          connectionSecret = undefined; // nostrconnect doesn't use connection secret on reload

          // Close signer first (it will clean up its subscription)
          await signer.close();

          // Then close pool
          pool.close(['wss://relay.nsec.app/']);
        } catch (signerError) {
          console.error('[loginWithBunker] ❌ BunkerSigner.fromURI failed:', signerError);
          // Close pool on error
          pool.close(['wss://relay.nsec.app/']);
          throw signerError;
        }

      } else {
        // Remote signer-initiated flow: parse bunker:// URL
        console.log('[loginWithBunker] Remote signer-initiated flow - parsing bunker URL');

        const bunkerInfo = await parseBunkerInput(uri);
        if (!bunkerInfo) {
          throw new Error('Failed to parse bunker URL');
        }
        console.log('[loginWithBunker] Parsed bunker info - pubkey:', bunkerInfo.pubkey.slice(0, 16) + '...');
        console.log('[loginWithBunker] Bunker relays:', bunkerInfo.relays);
        // NOTE: bunkerInfo.relays comes from the bunker:// URL itself
        // We MUST use those relays, not Peek's internal relay configuration
        // This ensures compatibility regardless of what relay the bunker service uses

        // Generate client keypair for the connection
        const clientSecretKey = generateSecretKey();
        clientSecretKeyHex = bytesToHex(clientSecretKey);

        // Import SimplePool for BunkerSigner
        console.log('[loginWithBunker] Importing SimplePool for bunker:// flow...');
        const { SimplePool: SimplePoolBunker } = await import('nostr-tools/pool');
        const poolBunker = new SimplePoolBunker();
        console.log('[loginWithBunker] Created SimplePool for bunker');

        // Use fromBunker() factory method (NOT constructor)
        // This properly sets up subscription and internal state
        console.log('[loginWithBunker] Creating BunkerSigner via fromBunker() factory...');
        signer = BunkerSigner.fromBunker(
          hexToBytes(clientSecretKeyHex),
          bunkerInfo, // BunkerPointer from parseBunkerInput
          {
            pool: poolBunker,
            onauth: (authUrl: string) => {
              console.log('[loginWithBunker] 🔐 Additional authorization required from nsec.app');

              // Try to open popup
              const popup = window.open(authUrl, 'nsec-auth', 'width=600,height=700,popup=yes');

              // Detect if popup was blocked
              if (!popup || popup.closed || typeof popup.closed === 'undefined') {
                console.warn('[loginWithBunker] ⚠️ Popup blocked by browser!');

                const message = 'nsec.app requires approval to complete the connection.\n\n' +
                               'Your browser blocked the popup. Please:\n' +
                               '1. Allow popups for this site, or\n' +
                               '2. Click OK to open the approval page';

                if (confirm(message)) {
                  window.location.href = authUrl;
                }
              } else {
                console.log('[loginWithBunker] ✅ Auth popup opened successfully');
              }
            }
          }
        );
        console.log('[loginWithBunker] BunkerSigner created (subscription established)');

        // REQUIRED: Call connect() for first-time authorization
        console.log('[loginWithBunker] Calling connect() for authorization...');
        if (signer.connect) {
          await signer.connect();
          console.log('[loginWithBunker] ✅ BunkerSigner authorized');
        } else {
          console.log('[loginWithBunker] No connect() method - using fromBunker flow');
        }

        // Get the remote signer's public key
        console.log('[loginWithBunker] Requesting public key from remote signer...');
        remotePubkey = await signer.getPublicKey();
        console.log('[loginWithBunker] ✅ Got remote pubkey:', remotePubkey.slice(0, 8) + '...');

        // Save relay info for reconnection
        bunkerRelays = bunkerInfo.relays;
        connectionSecret = bunkerInfo.secret || undefined; // Convert null to undefined

        // Close test connection (will reconnect in RelayContext)
        await signer.close();
        poolBunker.close(bunkerInfo.relays);
      }

      const npub = nip19.npubEncode(remotePubkey);

      // Create bunker identity with BunkerPointer data (per NIP-46 spec)
      const bunkerIdentity: BunkerIdentity = {
        type: 'bunker',
        bunkerPubkey: remotePubkey, // Remote signer's pubkey
        relays: bunkerRelays, // Relay URLs for this connection
        clientSecretKey: clientSecretKeyHex, // Our client secret key
        secret: connectionSecret, // Connection secret (if any)
        publicKey: remotePubkey, // Same as bunkerPubkey
        npub,
        createdAt: Date.now()
      };

      localStorage.setItem(STORAGE_KEY, JSON.stringify(bunkerIdentity));
      setIdentity(bunkerIdentity);
      console.log('Logged in with bunker:', npub);

      return bunkerIdentity;
    } catch (err) {
      console.error('Failed to connect to bunker:', err);
      throw new Error(err instanceof Error ? err.message : 'Failed to connect to bunker');
    }
  }, []);

  const switchIdentity = React.useCallback(() => {
    setShowIdentityModal(true);
  }, []);

  return {
    pubkey: identity?.publicKey || null,
    npub: identity?.npub || null,
    identity,
    userIdentity: identity?.type !== 'local' ? identity : null,
    isAutoGenerated: identity?.type === 'local',
    login,
    logout,
    createNewIdentity,
    importIdentity,
    loginWithExtension,
    loginWithBunker,
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