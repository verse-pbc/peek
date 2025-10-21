/**
 * Unit Tests: Subscription Filter Generation
 *
 * Tests for creating Nostr filters for community subscriptions (kind 3081 payloads)
 *
 * TDD: These tests MUST FAIL initially
 */

import { describe, it, expect } from 'vitest'
import { createCommunityFilter, computeFilterHash } from '../../src/services/notifications'

describe('Subscription Filters', () => {
  describe('createCommunityFilter', () => {
    it('should create filter for single community', () => {
      const communityId = 'coffee-shop-123'
      const filter = createCommunityFilter(communityId)

      expect(filter).toEqual({
        kinds: [9],
        '#h': [communityId]
      })
    })

    it('should create filter with user pubkey for mentions', () => {
      const communityId = 'coffee-shop-123'
      const userPubkey = '79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798'
      const filter = createCommunityFilter(communityId, userPubkey)

      expect(filter).toEqual({
        kinds: [9],
        '#h': [communityId],
        '#p': [userPubkey]
      })
    })

    it('should only include kind 9 (NIP-29 chat messages)', () => {
      const filter = createCommunityFilter('test')

      expect(filter.kinds).toEqual([9])
      expect(filter.kinds).not.toContain(10) // Not kind 10
      expect(filter.kinds).not.toContain(1) // Not kind 1
    })
  })

  describe('computeFilterHash', () => {
    it('should produce consistent hash for same filter', () => {
      const filter = { kinds: [9], '#h': ['test'] }

      const hash1 = computeFilterHash(filter)
      const hash2 = computeFilterHash(filter)

      expect(hash1).toBe(hash2)
    })

    it('should produce different hash for different filters', () => {
      const filter1 = { kinds: [9], '#h': ['community-a'] }
      const filter2 = { kinds: [9], '#h': ['community-b'] }

      const hash1 = computeFilterHash(filter1)
      const hash2 = computeFilterHash(filter2)

      expect(hash1).not.toBe(hash2)
    })

    it('should normalize filter before hashing (ignore order)', () => {
      const filter1 = { kinds: [9], '#h': ['test'] }
      const filter2 = { '#h': ['test'], kinds: [9] } // Different order

      const hash1 = computeFilterHash(filter1)
      const hash2 = computeFilterHash(filter2)

      expect(hash1).toBe(hash2)
    })
  })
})
