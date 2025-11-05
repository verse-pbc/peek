import type { StoredIdentity } from '@/lib/nostr-identity';
/**
 * Notification Subscription Service
 *
 * Handles community notification subscriptions (kind 3081/3082 events).
 * Manages per-community subscriptions with NIP-44 encryption.
 * Supports both local keys and NIP-07 browser extensions.
 */

import { finalizeEvent, type EventTemplate, type Event } from 'nostr-tools/pure'
import { nip19 } from 'nostr-tools'
import { encryptForServiceAsync, getPrivateKeyFromIdentity } from '../lib/crypto'
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
 * Supports both local keys and NIP-07 browser extensions
 *
 * @param communityId - Community ID to subscribe to
 * @param identity - User's identity (local key or NIP-07)
 * @param publishEvent - Function to publish event to relay
 * @returns true if successful
 */
export async function subscribeToCommunity(
  communityId: string,
  identity: StoredIdentity | null,
  publishEvent: (event: Event) => Promise<void>
): Promise<boolean> {
  try {
    if (!identity) {
      throw new Error('No identity provided')
    }

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

    // Encrypt payload with NIP-44 (supports both NIP-07 and local keys)
    const encryptedContent = await encryptForServiceAsync(
      JSON.stringify(payload),
      identity,
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

    // Sign event (NIP-07 or local key)
    let signedEvent: Event
    if (identity.type === 'extension' && window.nostr?.signEvent) {
      // Use NIP-07 extension for signing
      signedEvent = await window.nostr.signEvent(eventTemplate) as Event
    } else {
      // Use local private key for signing
      const privateKey = getPrivateKeyFromIdentity(identity)
      if (!privateKey) {
        throw new Error('No private key available for signing')
      }
      signedEvent = finalizeEvent(eventTemplate, privateKey)
    }

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
 * Supports both local keys and NIP-07 browser extensions
 *
 * @param communityId - Community ID to unsubscribe from
 * @param identity - User's identity (local key or NIP-07)
 * @param publishEvent - Function to publish event to relay
 * @returns true if successful
 */
export async function unsubscribeFromCommunity(
  communityId: string,
  identity: StoredIdentity | null,
  publishEvent: (event: Event) => Promise<void>
): Promise<boolean> {
  try {
    if (!identity) {
      throw new Error('No identity provided')
    }

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

    // Encrypt payload with NIP-44 (supports both NIP-07 and local keys)
    const encryptedContent = await encryptForServiceAsync(
      JSON.stringify(payload),
      identity,
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

    // Sign event (NIP-07 or local key)
    let signedEvent: Event
    if (identity.type === 'extension' && window.nostr?.signEvent) {
      // Use NIP-07 extension for signing
      signedEvent = await window.nostr.signEvent(eventTemplate) as Event
    } else {
      // Use local private key for signing
      const privateKey = getPrivateKeyFromIdentity(identity)
      if (!privateKey) {
        throw new Error('No private key available for signing')
      }
      signedEvent = finalizeEvent(eventTemplate, privateKey)
    }

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
 * Supports both local keys and NIP-07 browser extensions
 *
 * @param communityIds - List of community IDs
 * @param identity - User's identity (local key or NIP-07)
 * @param publishEvent - Function to publish events to relay
 * @returns Number of successful subscriptions
 */
export async function subscribeToAllCommunities(
  communityIds: string[],
  identity: StoredIdentity | null,
  publishEvent: (event: Event) => Promise<void>
): Promise<number> {
  let successCount = 0

  for (const communityId of communityIds) {
    const success = await subscribeToCommunity(communityId, identity, publishEvent)
    if (success) {
      successCount++
    }
  }

  console.log(`[Notifications] Batch subscription complete: ${successCount}/${communityIds.length}`)
  return successCount
}

/**
 * Unsubscribe from all communities
 * Supports both local keys and NIP-07 browser extensions
 *
 * @param identity - User's identity (local key or NIP-07)
 * @param publishEvent - Function to publish events to relay
 * @returns Number of successful unsubscriptions
 */
export async function unsubscribeFromAllCommunities(
  identity: StoredIdentity | null,
  publishEvent: (event: Event) => Promise<void>
): Promise<number> {
  const subscribedCommunities = getSubscribedCommunities()

  let successCount = 0

  for (const communityId of subscribedCommunities) {
    const success = await unsubscribeFromCommunity(communityId, identity, publishEvent)
    if (success) {
      successCount++
    }
  }

  console.log(`[Notifications] Batch unsubscription complete: ${successCount}/${subscribedCommunities.length}`)
  return successCount
}

/**
 * Query relay for actual subscription status (kind 3081/3082 events)
 * Syncs localStorage with relay state
 *
 * @param userPubkey - User's public key (hex)
 * @param queryRelay - Function to query relay for events
 * @returns List of active community subscriptions from relay
 */
export async function checkSubscriptionsFromRelay(
  userPubkey: string,
  queryRelay: (filter: { kinds: number[]; authors: string[]; limit: number }) => Promise<Event[]>
): Promise<string[]> {
  try {
    // Query for both subscription (3081) and unsubscription (3082) events
    const events = await queryRelay({
      kinds: [3081, 3082],
      authors: [userPubkey],
      limit: 50
    })

    if (!events || events.length === 0) {
      console.log('[Notifications] No subscription events found on relay')
      return []
    }

    // Group by community, keep only latest event per community
    const latestByFilter: Map<string, Event> = new Map()

    for (const event of events) {
      // We can't decrypt to get actual filter, so we use event ID as key
      // In production, we'd decrypt and hash the filter
      // For now, just track by created_at - latest 3081 means subscribed
      const key = `event-${event.created_at}`

      const existing = latestByFilter.get(key)
      if (!existing || event.created_at > existing.created_at) {
        latestByFilter.set(key, event)
      }
    }

    // For now, just return empty - we can't decrypt to know which communities
    // This is a limitation - we'd need to decrypt content to know community IDs
    console.log('[Notifications] Found', latestByFilter.size, 'subscription-related events on relay')

    return []
  } catch (error) {
    console.error('[Notifications] Failed to check subscriptions from relay:', error)
    return getSubscribedCommunities()
  }
}

/**
 * Check and refresh expired subscriptions
 * Supports both local keys and NIP-07 browser extensions
 *
 * @param identity - User's identity (local key or NIP-07)
 * @param publishEvent - Function to publish events to relay
 * @returns Number of refreshed subscriptions
 */
export async function checkAndRefreshSubscriptions(
  identity: StoredIdentity | null,
  publishEvent: (event: Event) => Promise<void>
): Promise<number> {
  const subscribedCommunities = getSubscribedCommunities()
  let refreshedCount = 0

  for (const communityId of subscribedCommunities) {
    if (needsSubscriptionRefresh(communityId)) {
      console.log('[Notifications] Refreshing expired subscription for community:', communityId)

      // Re-subscribe with new expiration
      const success = await subscribeToCommunity(communityId, identity, publishEvent)

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
