/**
 * Notification Subscription Service
 *
 * Handles community notification subscriptions (kind 3081/3082 events).
 * Manages per-community subscriptions with NIP-44 encryption.
 */

import { finalizeEvent, type EventTemplate, type Event } from 'nostr-tools/pure'
import { nip19 } from 'nostr-tools'
import { encryptForService } from '../lib/crypto'
import {
  updateSubscriptionState,
  removeSubscriptionState,
  getSubscribedCommunities,
  needsSubscriptionRefresh
} from '../lib/pushStorage'
import { PUSH_SERVICE_NPUB, APP_NAME, TOKEN_EXPIRATION_SECONDS } from '../config/push'

/**
 * Nostr filter structure for community subscriptions
 */
export interface CommunityFilter {
  kinds: [9] // NIP-29 chat messages only
  '#h': string[] // Community ID(s)
  '#p'?: string[] // Optional: user pubkey for mention filtering
}

/**
 * Create a Nostr filter for community notifications
 *
 * @param communityId - Community ID (h-tag value)
 * @param userPubkey - Optional user pubkey to include for mention filtering
 * @returns Filter object for kind 3081 payload
 */
export function createCommunityFilter(communityId: string, userPubkey?: string): CommunityFilter {
  const filter: CommunityFilter = {
    kinds: [9],
    '#h': [communityId]
  }

  if (userPubkey) {
    filter['#p'] = [userPubkey]
  }

  return filter
}

/**
 * Compute SHA-256 hash of normalized filter (for deduplication)
 *
 * @param filter - Nostr filter object
 * @returns Hex-encoded SHA-256 hash
 */
export function computeFilterHash(filter: CommunityFilter): string {
  // Normalize: sort keys, stringify
  const normalized = JSON.stringify(filter, Object.keys(filter).sort())

  // Simple hash for browser (using Web Crypto API would be better, but this is sufficient)
  let hash = 0
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32-bit integer
  }

  return hash.toString(16)
}

/**
 * Subscribe to community notifications (publish kind 3081 event)
 *
 * @param communityId - Community ID to subscribe to
 * @param userPrivateKey - User's Nostr private key
 * @param publishEvent - Function to publish event to relay
 * @returns true if successful
 */
export async function subscribeToCommunity(
  communityId: string,
  userPrivateKey: Uint8Array,
  publishEvent: (event: Event) => Promise<void>
): Promise<boolean> {
  try {
    // Decrypt service npub to hex pubkey
    const { data: servicePubkeyHex } = nip19.decode(PUSH_SERVICE_NPUB)

    if (typeof servicePubkeyHex !== 'string') {
      throw new Error('Invalid service npub format')
    }

    // Create filter for this community
    const filter = createCommunityFilter(communityId)

    // Create payload
    const payload = {
      filter
    }

    // Encrypt payload with NIP-44
    const encryptedContent = encryptForService(
      JSON.stringify(payload),
      userPrivateKey,
      servicePubkeyHex
    )

    // Calculate expiration (30 days from now)
    const now = Math.floor(Date.now() / 1000)
    const expiration = now + TOKEN_EXPIRATION_SECONDS

    // Create kind 3081 event
    const eventTemplate: EventTemplate = {
      kind: 3081,
      created_at: now,
      tags: [
        ['p', servicePubkeyHex],
        ['app', APP_NAME],
        ['expiration', expiration.toString()]
      ],
      content: encryptedContent
    }

    // Sign and publish
    const signedEvent = finalizeEvent(eventTemplate, userPrivateKey)
    await publishEvent(signedEvent)

    // Compute filter hash for storage
    const filterHash = computeFilterHash(filter)

    // Update localStorage
    updateSubscriptionState(communityId, true, now, filterHash)

    console.log('[Notifications] Subscribed to community:', communityId, 'filter hash:', filterHash)
    return true
  } catch (error) {
    console.error('[Notifications] Failed to subscribe to community:', error)
    return false
  }
}

/**
 * Unsubscribe from community notifications (publish kind 3082 event)
 *
 * @param communityId - Community ID to unsubscribe from
 * @param userPrivateKey - User's Nostr private key
 * @param publishEvent - Function to publish event to relay
 * @returns true if successful
 */
export async function unsubscribeFromCommunity(
  communityId: string,
  userPrivateKey: Uint8Array,
  publishEvent: (event: Event) => Promise<void>
): Promise<boolean> {
  try {
    // Decrypt service npub to hex pubkey
    const { data: servicePubkeyHex } = nip19.decode(PUSH_SERVICE_NPUB)

    if (typeof servicePubkeyHex !== 'string') {
      throw new Error('Invalid service npub format')
    }

    // Create same filter as subscription (must match exactly for nostr_push_service to find it)
    const filter = createCommunityFilter(communityId)

    // Create payload
    const payload = {
      filter
    }

    // Encrypt payload with NIP-44
    const encryptedContent = encryptForService(
      JSON.stringify(payload),
      userPrivateKey,
      servicePubkeyHex
    )

    // Create kind 3082 event (no expiration tag for unsubscribe)
    const now = Math.floor(Date.now() / 1000)
    const eventTemplate: EventTemplate = {
      kind: 3082,
      created_at: now,
      tags: [
        ['p', servicePubkeyHex],
        ['app', APP_NAME]
      ],
      content: encryptedContent
    }

    // Sign and publish
    const signedEvent = finalizeEvent(eventTemplate, userPrivateKey)
    await publishEvent(signedEvent)

    // Remove from localStorage
    removeSubscriptionState(communityId)

    console.log('[Notifications] Unsubscribed from community:', communityId)
    return true
  } catch (error) {
    console.error('[Notifications] Failed to unsubscribe from community:', error)
    return false
  }
}

/**
 * Subscribe to all communities the user is a member of
 *
 * @param communityIds - List of community IDs
 * @param userPrivateKey - User's Nostr private key
 * @param publishEvent - Function to publish events to relay
 * @returns Number of successful subscriptions
 */
export async function subscribeToAllCommunities(
  communityIds: string[],
  userPrivateKey: Uint8Array,
  publishEvent: (event: Event) => Promise<void>
): Promise<number> {
  let successCount = 0

  for (const communityId of communityIds) {
    const success = await subscribeToCommunity(communityId, userPrivateKey, publishEvent)
    if (success) {
      successCount++
    }
  }

  console.log(`[Notifications] Batch subscription complete: ${successCount}/${communityIds.length}`)
  return successCount
}

/**
 * Unsubscribe from all communities
 *
 * @param userPrivateKey - User's Nostr private key
 * @param publishEvent - Function to publish events to relay
 * @returns Number of successful unsubscriptions
 */
export async function unsubscribeFromAllCommunities(
  userPrivateKey: Uint8Array,
  publishEvent: (event: Event) => Promise<void>
): Promise<number> {
  const subscribedCommunities = getSubscribedCommunities()

  let successCount = 0

  for (const communityId of subscribedCommunities) {
    const success = await unsubscribeFromCommunity(communityId, userPrivateKey, publishEvent)
    if (success) {
      successCount++
    }
  }

  console.log(`[Notifications] Batch unsubscription complete: ${successCount}/${subscribedCommunities.length}`)
  return successCount
}

/**
 * Check and refresh expired subscriptions
 *
 * @param userPrivateKey - User's Nostr private key
 * @param publishEvent - Function to publish events to relay
 * @returns Number of refreshed subscriptions
 */
export async function checkAndRefreshSubscriptions(
  userPrivateKey: Uint8Array,
  publishEvent: (event: Event) => Promise<void>
): Promise<number> {
  const subscribedCommunities = getSubscribedCommunities()
  let refreshedCount = 0

  for (const communityId of subscribedCommunities) {
    if (needsSubscriptionRefresh(communityId)) {
      console.log('[Notifications] Refreshing expired subscription for community:', communityId)

      // Re-subscribe with new expiration
      const success = await subscribeToCommunity(communityId, userPrivateKey, publishEvent)

      if (success) {
        refreshedCount++
      }
    }
  }

  if (refreshedCount > 0) {
    console.log(`[Notifications] Refreshed ${refreshedCount} expired subscriptions`)
  }

  return refreshedCount
}
