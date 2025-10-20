/**
 * Contract Test: NIP-44 Encryption Compatibility with nostr_push_service
 *
 * This test verifies that Peek's NIP-44 encryption produces ciphertext
 * that can be decrypted by nostr_push_service (Rust/nostr-sdk).
 *
 * TDD: This test MUST FAIL initially, then pass after implementing crypto.ts
 */

import { describe, it, expect } from 'vitest'
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure'
import { encryptForService, decryptFromService } from '../../src/lib/crypto'

describe('NIP-44 Encryption Contract', () => {
  // Test keys (deterministic for reproducibility)
  const USER_PRIVATE_KEY_HEX = '0000000000000000000000000000000000000000000000000000000000000001'
  const USER_PRIVATE_KEY = Uint8Array.from(Buffer.from(USER_PRIVATE_KEY_HEX, 'hex'))
  const _USER_PUBLIC_KEY = getPublicKey(USER_PRIVATE_KEY) // Used for reference, prefixed with _ to avoid lint error

  // Generate a valid service public key for testing
  const SERVICE_PRIVATE_KEY = generateSecretKey()
  const SERVICE_PUBLIC_KEY = getPublicKey(SERVICE_PRIVATE_KEY)

  it('should encrypt FCM token payload for kind 3079', () => {
    const payload = {
      token: 'cT7Vxjw0TfG8h9K...mock-fcm-token-example'
    }

    const encrypted = encryptForService(
      JSON.stringify(payload),
      USER_PRIVATE_KEY,
      SERVICE_PUBLIC_KEY
    )

    // NIP-44 v2 ciphertext is base64-encoded
    // Minimum length ~88 chars (version + nonce + small payload + MAC)
    expect(encrypted).toBeTruthy()
    expect(encrypted.length).toBeGreaterThan(88)
    expect(encrypted).toMatch(/^[A-Za-z0-9+/=]+$/)

    // Should not contain plaintext
    expect(encrypted).not.toContain('cT7Vxjw0TfG')
    expect(encrypted).not.toContain('token')
  })

  it('should encrypt subscription filter payload for kind 3081', () => {
    const payload = {
      filter: {
        kinds: [9],
        '#h': ['test-community-123']
      }
    }

    const encrypted = encryptForService(
      JSON.stringify(payload),
      USER_PRIVATE_KEY,
      SERVICE_PUBLIC_KEY
    )

    expect(encrypted).toBeTruthy()
    expect(encrypted.length).toBeGreaterThan(88)
    expect(encrypted).not.toContain('test-community')
    expect(encrypted).not.toContain('filter')
    expect(encrypted).not.toContain('kinds')
  })

  it('should decrypt payload encrypted by same user', () => {
    const originalPayload = { token: 'test-token-123' }
    const payloadString = JSON.stringify(originalPayload)

    const encrypted = encryptForService(
      payloadString,
      USER_PRIVATE_KEY,
      SERVICE_PUBLIC_KEY
    )

    // User can decrypt their own message (for verification)
    const decrypted = decryptFromService(
      encrypted,
      USER_PRIVATE_KEY,
      SERVICE_PUBLIC_KEY
    )

    expect(JSON.parse(decrypted)).toEqual(originalPayload)
  })

  it('should produce different ciphertext for same payload (nonce randomization)', () => {
    const payload = JSON.stringify({ token: 'same-token' })

    const encrypted1 = encryptForService(payload, USER_PRIVATE_KEY, SERVICE_PUBLIC_KEY)
    const encrypted2 = encryptForService(payload, USER_PRIVATE_KEY, SERVICE_PUBLIC_KEY)

    // NIP-44 uses random nonce, so ciphertext should differ
    expect(encrypted1).not.toBe(encrypted2)

    // But both should decrypt to same plaintext
    const decrypted1 = decryptFromService(encrypted1, USER_PRIVATE_KEY, SERVICE_PUBLIC_KEY)
    const decrypted2 = decryptFromService(encrypted2, USER_PRIVATE_KEY, SERVICE_PUBLIC_KEY)
    expect(decrypted1).toBe(decrypted2)
  })

  it('should reject decryption with wrong key', () => {
    const payload = JSON.stringify({ token: 'secret' })
    const encrypted = encryptForService(payload, USER_PRIVATE_KEY, SERVICE_PUBLIC_KEY)

    const WRONG_PRIVATE_KEY = generateSecretKey()

    expect(() => {
      decryptFromService(encrypted, WRONG_PRIVATE_KEY, SERVICE_PUBLIC_KEY)
    }).toThrow() // NIP-44 MAC verification fails
  })

  it('should handle empty payload', () => {
    const payload = JSON.stringify({})

    const encrypted = encryptForService(payload, USER_PRIVATE_KEY, SERVICE_PUBLIC_KEY)
    const decrypted = decryptFromService(encrypted, USER_PRIVATE_KEY, SERVICE_PUBLIC_KEY)

    expect(JSON.parse(decrypted)).toEqual({})
  })

  it('should handle large filter payloads (multiple communities)', () => {
    const payload = {
      filter: {
        kinds: [9],
        '#h': Array.from({ length: 100 }, (_, i) => `community-${i}`)
      }
    }

    const encrypted = encryptForService(
      JSON.stringify(payload),
      USER_PRIVATE_KEY,
      SERVICE_PUBLIC_KEY
    )

    // Should succeed even with large payload
    const decrypted = decryptFromService(encrypted, USER_PRIVATE_KEY, SERVICE_PUBLIC_KEY)
    expect(JSON.parse(decrypted)).toEqual(payload)
  })
})

/**
 * Manual Cross-Platform Verification (after implementation):
 *
 * 1. Run this test to generate encrypted payloads:
 *    pnpm test contracts/nip44-encryption.test.ts
 *
 * 2. Copy encrypted output from console
 *
 * 3. Verify decryption in nostr_push_service:
 *    cd /Users/daniel/code/nos/nostr_push_service
 *    cargo test decrypt_peek_payload -- --nocapture
 *
 * This ensures TypeScript ↔ Rust encryption compatibility.
 */
