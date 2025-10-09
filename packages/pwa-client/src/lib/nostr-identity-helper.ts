// Pure functions for Nostr identity and encryption setup
// Data-oriented: separate data transformation from side effects

import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { hexToBytes } from './hex';
import { hasNip44Support, nip07Encrypt, nip07Decrypt } from './nostrify-shim';

export interface EncryptionHelper {
  encrypt: (pubkey: string, plaintext: string) => Promise<string>;
  decrypt: (pubkey: string, ciphertext: string) => Promise<string>;
}

export interface IdentitySetup {
  secretKey: Uint8Array;
  publicKey: string;
  encryptionHelper?: EncryptionHelper;
  usingAnonymous: boolean;
}

/**
 * Generate ephemeral key for NIP-07 encryption (not persisted)
 * Used when NIP-07 extension doesn't support nip44
 */
function generateEphemeralKey(): { secretKey: Uint8Array; publicKey: string } {
  const secretKey = generateSecretKey();
  const publicKey = getPublicKey(secretKey);
  return { secretKey, publicKey };
}

/**
 * Create encryption helper for NIP-07 with nip44 support
 */
function createNip07EncryptionHelper(): EncryptionHelper {
  return {
    encrypt: nip07Encrypt,
    decrypt: nip07Decrypt
  };
}

/**
 * Set up identity and encryption for Nostr operations
 * Handles all cases: NIP-07 with/without nip44, regular identity, anonymous
 */
export function setupNostrIdentity(
  userIdentity: { secretKey: string; publicKey: string; isAnonymous?: boolean } | null,
  userPubkey: string | null
): IdentitySetup {
  // Case 1: User logged in with NIP-07 extension + nip44 support
  if (userIdentity?.secretKey === 'NIP07_EXTENSION' && hasNip44Support() && userPubkey) {
    const ephemeral = generateEphemeralKey();

    return {
      secretKey: ephemeral.secretKey, // Ephemeral key for gift wrap
      publicKey: userPubkey, // Real identity for seal
      encryptionHelper: createNip07EncryptionHelper(),
      usingAnonymous: false
    };
  }

  // Case 2: User logged in with NIP-07 extension without nip44
  if (userIdentity?.secretKey === 'NIP07_EXTENSION' && userPubkey) {
    const ephemeral = generateEphemeralKey();

    return {
      secretKey: ephemeral.secretKey, // Ephemeral key for encryption
      publicKey: userPubkey, // Real identity
      encryptionHelper: undefined, // Use local key encryption
      usingAnonymous: false
    };
  }

  // Case 3: User has identity (real or anonymous) with secret key
  if (userIdentity?.secretKey && userPubkey) {
    // Handle NIP-07 extension - use encryptionHelper instead of secret key
    if (userIdentity.secretKey === 'NIP07_EXTENSION') {
      const nostr = window.nostr;
      if (!nostr) {
        throw new Error('NIP-07 extension not available');
      }

      return {
        secretKey: new Uint8Array(0), // Empty - not used with extension
        publicKey: userPubkey,
        encryptionHelper: {
          encrypt: async (recipientPubkey: string, plaintext: string) => {
            if (!nostr.nip44) throw new Error('NIP-44 not supported by extension');
            return await nostr.nip44.encrypt(recipientPubkey, plaintext);
          },
          decrypt: async (senderPubkey: string, ciphertext: string) => {
            if (!nostr.nip44) throw new Error('NIP-44 not supported by extension');
            return await nostr.nip44.decrypt(senderPubkey, ciphertext);
          }
        },
        usingAnonymous: false
      };
    }

    return {
      secretKey: hexToBytes(userIdentity.secretKey),
      publicKey: userPubkey,
      encryptionHelper: undefined,
      usingAnonymous: userIdentity.isAnonymous ?? false
    };
  }

  // Case 4: No identity yet (nostrify-shim still initializing)
  // Generate ephemeral anonymous identity for this operation
  console.warn('[setupNostrIdentity] No identity available, generating ephemeral key');
  const ephemeral = generateEphemeralKey();

  return {
    secretKey: ephemeral.secretKey,
    publicKey: ephemeral.publicKey,
    encryptionHelper: undefined,
    usingAnonymous: true
  };
}

/**
 * Determine if using NIP-07 extension
 */
export function isUsingNip07Extension(identity: { secretKey: string } | null): boolean {
  return identity?.secretKey === 'NIP07_EXTENSION';
}

/**
 * Determine if NIP-07 has nip44 support
 */
export function hasNip07WithNip44(identity: { secretKey: string } | null): boolean {
  return isUsingNip07Extension(identity) && hasNip44Support();
}
