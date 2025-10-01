// Pure utility for secret key resolution
// Data-oriented: simple data transformation without side effects

import { hexToBytes } from './hex';

/**
 * Resolve secret key from identity
 * Returns undefined for NIP-07 extension identities (will use window.nostr for signing)
 * Returns Uint8Array for regular identities
 */
export function resolveSecretKey(identity: { secretKey: string } | null | undefined): Uint8Array | undefined {
  if (!identity?.secretKey) return undefined;

  if (identity.secretKey === 'NIP07_EXTENSION') {
    return undefined; // Extension will handle signing
  }

  return hexToBytes(identity.secretKey);
}

/**
 * Check if identity is using NIP-07 extension
 */
export function isNip07Identity(identity: { secretKey: string } | null | undefined): boolean {
  return identity?.secretKey === 'NIP07_EXTENSION';
}
