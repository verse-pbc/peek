/**
 * Unit Tests: Crypto Utilities
 *
 * Tests for NIP-44 encryption helpers used in push notification integration.
 *
 * TDD: These tests MUST FAIL initially, then pass after implementing crypto.ts
 */

import { describe, it, expect } from 'vitest'
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure'
import {
  encryptForService,
  decryptFromService,
  hexToBytes,
  bytesToHex
} from '../../src/lib/crypto'

describe('Crypto Utilities', () => {
  describe('hexToBytes', () => {
    it('should convert hex string to Uint8Array', () => {
      const hex = '0102030405060708090a0b0c0d0e0f10'
      const bytes = hexToBytes(hex)

      expect(bytes).toBeInstanceOf(Uint8Array)
      expect(bytes.length).toBe(16)
      expect(bytes[0]).toBe(1)
      expect(bytes[15]).toBe(16)
    })

    it('should handle 64-character hex strings (32 bytes)', () => {
      const hex = '0'.repeat(64)
      const bytes = hexToBytes(hex)

      expect(bytes.length).toBe(32)
      expect(Array.from(bytes)).toEqual(new Array(32).fill(0))
    })

    it('should throw on invalid hex', () => {
      expect(() => hexToBytes('not-hex')).toThrow()
      expect(() => hexToBytes('abcdefgh')).toThrow()
    })
  })

  describe('bytesToHex', () => {
    it('should convert Uint8Array to hex string', () => {
      const bytes = new Uint8Array([1, 2, 3, 4, 5])
      const hex = bytesToHex(bytes)

      expect(hex).toBe('0102030405')
    })

    it('should produce lowercase hex', () => {
      const bytes = new Uint8Array([255, 254, 253])
      const hex = bytesToHex(bytes)

      expect(hex).toBe('fffefd')
      expect(hex).not.toMatch(/[A-F]/)
    })
  })

  describe('NIP-44 Encryption', () => {
    const privateKey = generateSecretKey()
    const recipientPrivateKey = generateSecretKey()
    const recipientPubkey = getPublicKey(recipientPrivateKey)

    it('should encrypt and decrypt successfully', () => {
      const plaintext = 'Hello, Nostr!'

      const encrypted = encryptForService(plaintext, privateKey, recipientPubkey)
      const decrypted = decryptFromService(encrypted, privateKey, recipientPubkey)

      expect(decrypted).toBe(plaintext)
    })

    it('should produce different ciphertext each time (random nonce)', () => {
      const plaintext = 'Same message'

      const encrypted1 = encryptForService(plaintext, privateKey, recipientPubkey)
      const encrypted2 = encryptForService(plaintext, privateKey, recipientPubkey)

      expect(encrypted1).not.toBe(encrypted2)
    })

    it('should handle JSON payloads', () => {
      const payload = { token: 'fcm-token-abc123', timestamp: Date.now() }
      const plaintext = JSON.stringify(payload)

      const encrypted = encryptForService(plaintext, privateKey, recipientPubkey)
      const decrypted = decryptFromService(encrypted, privateKey, recipientPubkey)

      expect(JSON.parse(decrypted)).toEqual(payload)
    })

    it('should handle minimal strings (NIP-44 requires 1+ bytes)', () => {
      const plaintext = 'a'  // Minimum 1 byte

      const encrypted = encryptForService(plaintext, privateKey, recipientPubkey)
      const decrypted = decryptFromService(encrypted, privateKey, recipientPubkey)

      expect(decrypted).toBe(plaintext)
    })

    it('should handle Unicode characters', () => {
      const plaintext = 'Hello 世界 🌍'

      const encrypted = encryptForService(plaintext, privateKey, recipientPubkey)
      const decrypted = decryptFromService(encrypted, privateKey, recipientPubkey)

      expect(decrypted).toBe(plaintext)
    })

    it('should throw on decryption with wrong key', () => {
      const plaintext = 'Secret message'
      const encrypted = encryptForService(plaintext, privateKey, recipientPubkey)

      const wrongKey = generateSecretKey()

      expect(() => {
        decryptFromService(encrypted, wrongKey, recipientPubkey)
      }).toThrow()
    })

    it('should handle large payloads (100 community IDs)', () => {
      const payload = {
        filter: {
          kinds: [9],
          '#h': Array.from({ length: 100 }, (_, i) => `community-${i}`)
        }
      }
      const plaintext = JSON.stringify(payload)

      const encrypted = encryptForService(plaintext, privateKey, recipientPubkey)
      const decrypted = decryptFromService(encrypted, privateKey, recipientPubkey)

      expect(JSON.parse(decrypted)).toEqual(payload)
    })
  })
})
