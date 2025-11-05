// Pure utility for secret key resolution
// Data-oriented: simple data transformation without side effects

import { hexToBytes } from './hex';
import type { StoredIdentity } from './nostr-identity';

/**
 * Resolve secret key from identity
 * Returns undefined for NIP-07 extension and bunker identities (will use remote signing)
 * Returns Uint8Array for local identities
 */
export function resolveSecretKey(identity: StoredIdentity | null | undefined): Uint8Array | undefined {
  if (!identity) return undefined;

  if (identity.type === 'local') {
    return hexToBytes(identity.secretKey);
  }

  // Extension and bunker identities don't have local secretKey
  return undefined;
}

/**
 * Check if identity is using NIP-07 extension
 */
export function isNip07Identity(identity: StoredIdentity | null | undefined): boolean {
  return identity?.type === 'extension';
}
