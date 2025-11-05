import type { StoredIdentity } from './nostr-identity';
// Pure functions for Nostr identity and encryption setup
// Data-oriented: separate data transformation from side effects

import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { hexToBytes } from './hex';
import { hasNip44Support, nip07Encrypt, nip07Decrypt } from './nostr-identity';

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
 * Handles all cases: NIP-07 with/without nip44, local identity, bunker, anonymous
 */
export function setupNostrIdentity(
  userIdentity: StoredIdentity | null,
  userPubkey: string | null
): IdentitySetup {
  // Case 1: User logged in with NIP-07 extension + nip44 support
  if (userIdentity?.type === 'extension' && hasNip44Support() && userPubkey) {
    const ephemeral = generateEphemeralKey();

    return {
      secretKey: ephemeral.secretKey, // Ephemeral key for gift wrap
      publicKey: userPubkey, // Real identity for seal
      encryptionHelper: createNip07EncryptionHelper(),
      usingAnonymous: false
    };
  }

  // Case 2: User logged in with NIP-07 extension without nip44
  if (userIdentity?.type === 'extension' && userPubkey) {
    const ephemeral = generateEphemeralKey();

    return {
      secretKey: ephemeral.secretKey, // Ephemeral key for encryption
      publicKey: userPubkey, // Real identity
      encryptionHelper: undefined, // Use local key encryption
      usingAnonymous: false
    };
  }

  // Case 3: User has local identity with secret key (always anonymous/auto-generated)
  if (userIdentity?.type === 'local' && userPubkey) {
    return {
      secretKey: hexToBytes(userIdentity.secretKey),
      publicKey: userPubkey,
      encryptionHelper: undefined,
      usingAnonymous: true
    };
  }

  // Case 3b: User has bunker identity (use ephemeral for encryption, bunker for signing)
  if (userIdentity?.type === 'bunker' && userPubkey) {
    const ephemeral = generateEphemeralKey();
    return {
      secretKey: ephemeral.secretKey, // Ephemeral for encryption
      publicKey: userPubkey, // Bunker pubkey
      encryptionHelper: undefined, // Use local ephemeral encryption
      usingAnonymous: false
    };
  }

  // Case 4: No identity yet (nostr-identity still initializing)
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
export function isUsingNip07Extension(identity: StoredIdentity | null): boolean {
  return identity?.type === 'extension';
}

/**
 * Determine if NIP-07 has nip44 support
 */
export function hasNip07WithNip44(identity: StoredIdentity | null): boolean {
  return isUsingNip07Extension(identity) && hasNip44Support();
}
