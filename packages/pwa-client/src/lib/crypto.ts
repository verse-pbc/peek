import type { StoredIdentity } from './nostr-identity';
/**
 * Cryptography Utilities for Push Notifications
 *
 * Provides NIP-44 encryption/decryption for secure communication with nostr_push_service.
 * Compatible with nostr_push_service's Rust nostr-sdk implementation.
 * Supports both local keys and NIP-07 browser extensions.
 */

import * as nip44 from 'nostr-tools/nip44'
import { hasNip44Support } from './nostr-identity'

/**
 * Convert hex string to Uint8Array
 */
export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error('Hex string must have even length')
  }

  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    const byte = parseInt(hex.substring(i, i + 2), 16)
    if (isNaN(byte)) {
      throw new Error(`Invalid hex string at position ${i}: ${hex.substring(i, i + 2)}`)
    }
    bytes[i / 2] = byte
  }

  return bytes
}

/**
 * Convert Uint8Array to hex string
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Encrypt plaintext for nostr_push_service using NIP-44
 *
 * @param plaintext - Data to encrypt (usually JSON.stringify of payload)
 * @param senderPrivateKey - User's Nostr private key (Uint8Array 32 bytes or hex string)
 * @param recipientPubkey - Service's public key (hex string)
 * @returns Base64-encoded NIP-44 ciphertext
 */
export function encryptForService(
  plaintext: string,
  senderPrivateKey: Uint8Array | string,
  recipientPubkey: string
): string {
  // Convert private key to Uint8Array if hex string
  const privateKeyBytes = typeof senderPrivateKey === 'string'
    ? hexToBytes(senderPrivateKey)
    : senderPrivateKey

  // Derive conversation key (ECDH shared secret)
  const conversationKey = nip44.v2.utils.getConversationKey(
    privateKeyBytes,
    recipientPubkey
  )

  // Encrypt with NIP-44 v2
  const ciphertext = nip44.v2.encrypt(plaintext, conversationKey)

  return ciphertext
}

/**
 * Decrypt ciphertext from nostr_push_service using NIP-44
 *
 * @param ciphertext - Base64-encoded NIP-44 ciphertext
 * @param recipientPrivateKey - User's Nostr private key (Uint8Array 32 bytes or hex string)
 * @param senderPubkey - Service's public key (hex string)
 * @returns Decrypted plaintext
 */
export function decryptFromService(
  ciphertext: string,
  recipientPrivateKey: Uint8Array | string,
  senderPubkey: string
): string {
  // Convert private key to Uint8Array if hex string
  const privateKeyBytes = typeof recipientPrivateKey === 'string'
    ? hexToBytes(recipientPrivateKey)
    : recipientPrivateKey

  // Derive conversation key (ECDH shared secret)
  const conversationKey = nip44.v2.utils.getConversationKey(
    privateKeyBytes,
    senderPubkey
  )

  // Decrypt with NIP-44 v2
  const plaintext = nip44.v2.decrypt(ciphertext, conversationKey)

  return plaintext
}

/**
 * Validate that a string is valid NIP-44 ciphertext
 */
export function isValidNIP44Ciphertext(content: string): boolean {
  if (!content || content.length < 88) {
    return false
  }

  // NIP-44 ciphertext is base64-encoded
  const base64Regex = /^[A-Za-z0-9+/=]+$/
  return base64Regex.test(content)
}

/**
 * Get private key as Uint8Array from Peek's StoredIdentity
 * Returns null if using NIP-07 extension (no direct access to private key)
 */
export function getPrivateKeyFromIdentity(identity: StoredIdentity | null): Uint8Array | null {
  if (!identity) {
    return null
  }

  // Only local identities have secretKey
  if (identity.type === 'local') {
    return hexToBytes(identity.secretKey)
  }

  // Extension and bunker identities don't have local private key
  return null
}

/**
 * Encrypt plaintext for nostr_push_service using NIP-44 (async version)
 * Supports both local keys and NIP-07 browser extensions
 *
 * @param plaintext - Data to encrypt (usually JSON.stringify of payload)
 * @param identity - User's identity (local key or NIP-07)
 * @param recipientPubkey - Service's public key (hex string)
 * @returns Base64-encoded NIP-44 ciphertext
 */
export async function encryptForServiceAsync(
  plaintext: string,
  identity: StoredIdentity | null,
  recipientPubkey: string
): Promise<string> {
  if (!identity) {
    throw new Error('No identity provided for encryption')
  }

  // Check if using NIP-07 extension with nip44 support
  if (identity.type === 'extension') {
    if (!hasNip44Support()) {
      throw new Error('NIP-07 extension does not support nip44 encryption')
    }

    // Use extension's nip44.encrypt method
    if (!window.nostr?.nip44) {
      throw new Error('NIP-07 nip44 not available')
    }

    return await window.nostr.nip44.encrypt(recipientPubkey, plaintext)
  }

  // Local key path - use synchronous encryption
  if (identity.type !== 'local') {
    throw new Error('Encryption requires local identity or extension')
  }
  const privateKeyBytes = hexToBytes(identity.secretKey)
  return encryptForService(plaintext, privateKeyBytes, recipientPubkey)
}

/**
 * Decrypt ciphertext from nostr_push_service using NIP-44 (async version)
 * Supports both local keys and NIP-07 browser extensions
 *
 * @param ciphertext - Base64-encoded NIP-44 ciphertext
 * @param identity - User's identity (local key or NIP-07)
 * @param senderPubkey - Service's public key (hex string)
 * @returns Decrypted plaintext
 */
export async function decryptFromServiceAsync(
  ciphertext: string,
  identity: StoredIdentity | null,
  senderPubkey: string
): Promise<string> {
  if (!identity) {
    throw new Error('No identity provided for decryption')
  }

  // Check if using NIP-07 extension with nip44 support
  if (identity.type === 'extension') {
    if (!hasNip44Support()) {
      throw new Error('NIP-07 extension does not support nip44 decryption')
    }

    // Use extension's nip44.decrypt method
    if (!window.nostr?.nip44) {
      throw new Error('NIP-07 nip44 not available')
    }

    return await window.nostr.nip44.decrypt(senderPubkey, ciphertext)
  }

  // Local key path - use synchronous decryption
  if (identity.type !== 'local') {
    throw new Error('Decryption requires local identity or extension')
  }
  const privateKeyBytes = hexToBytes(identity.secretKey)
  return decryptFromService(ciphertext, privateKeyBytes, senderPubkey)
}
