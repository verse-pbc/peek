/**
 * Push Notification Service
 *
 * Handles device registration (kind 3079) for push notifications.
 * Integrates with Firebase Cloud Messaging and nostr_push_service.
 * Supports both local keys and NIP-07 browser extensions.
 */

import { finalizeEvent, type EventTemplate, type Event } from 'nostr-tools/pure'
import { requestNotificationPermissionAndGetToken, deleteFCMToken } from './firebase'
import { encryptForServiceAsync, getPrivateKeyFromIdentity } from '../lib/crypto'
import { updateDeviceRegistration, needsDeviceRefresh, isDeviceRegistered, clearDeviceRegistration, getStoredFcmToken } from '../lib/pushStorage'
import { PUSH_SERVICE_NPUB, APP_NAME, TOKEN_EXPIRATION_SECONDS } from '../config/push'
import { nip19 } from 'nostr-tools'

/**
 * Request notification permission from browser
 *
 * @returns Permission status ('granted', 'denied', 'default')
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) {
    console.warn('[Push] Notifications not supported')
    return 'denied'
  }

  const permission = Notification.permission

  if (permission === 'default') {
    return await Notification.requestPermission()
  }

  return permission
}

/**
 * Get FCM token from Firebase Messaging
 * Includes retry logic for iOS PWA
 *
 * @returns FCM token or null if failed
 */
export async function getFCMToken(): Promise<string | null> {
  try {
    const token = await requestNotificationPermissionAndGetToken()

    if (!token) {
      console.warn('[Push] Failed to get FCM token')
      return null
    }

    console.log('[Push] FCM token obtained:', token.substring(0, 20) + '...')
    return token
  } catch (error) {
    console.error('[Push] Error getting FCM token:', error)
    return null
  }
}

/**
 * Register device for push notifications (publish kind 3079 event)
 * Supports both local keys and NIP-07 browser extensions
 *
 * @param fcmToken - Firebase Cloud Messaging token
 * @param identity - User's identity (local key or NIP-07)
 * @param publishEvent - Function to publish event to relay
 * @returns true if successful
 */
export async function registerDevice(
  fcmToken: string,
  identity: { secretKey: string; publicKey: string } | null,
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

    // Create payload
    const payload = {
      token: fcmToken
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

    // Create kind 3079 event
    const eventTemplate: EventTemplate = {
      kind: 3079,
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
    if (identity.secretKey === 'NIP07_EXTENSION' && window.nostr?.signEvent) {
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

    // Update localStorage with registration status and current token
    updateDeviceRegistration(true, now, fcmToken)

    console.log('[Push] Device registered successfully, event ID:', signedEvent.id)
    return true
  } catch (error) {
    console.error('[Push] Failed to register device:', error)
    return false
  }
}

/**
 * Check if device registration has expired (>25 days old)
 */
export function isDeviceRegistrationExpired(): boolean {
  if (!isDeviceRegistered()) {
    return false
  }

  return needsDeviceRefresh()
}

/**
 * Check if FCM token has changed (rotation or invalidation)
 * Returns true if token changed and needs re-registration
 */
export async function hasTokenChanged(): Promise<boolean> {
  const currentToken = await getFCMToken()
  const storedToken = getStoredFcmToken()

  if (!currentToken || !storedToken) {
    return false
  }

  return currentToken !== storedToken
}

/**
 * Check and refresh device token if needed
 * Handles both expiration AND token rotation/invalidation
 * Supports both local keys and NIP-07 browser extensions
 *
 * @param identity - User's identity (local key or NIP-07)
 * @param publishEvent - Function to publish event to relay
 * @returns true if refreshed, false if no refresh needed or failed
 */
export async function checkAndRefreshDeviceToken(
  identity: { secretKey: string; publicKey: string } | null,
  publishEvent: (event: Event) => Promise<void>
): Promise<boolean> {
  // Get current FCM token from Firebase
  const currentToken = await getFCMToken()
  if (!currentToken) {
    console.error('[Push] Failed to get current FCM token')
    return false
  }

  const storedToken = getStoredFcmToken()
  const isExpired = isDeviceRegistrationExpired()

  // Check if token changed (rotation/invalidation by Firebase)
  if (storedToken && currentToken !== storedToken) {
    console.warn('[Push] ⚠️ FCM token changed! Old token invalidated by Firebase.')
    console.log('[Push] Re-registering with new token...')

    const success = await registerDevice(currentToken, identity, publishEvent)
    if (success) {
      console.log('[Push] ✅ Re-registered with new FCM token after rotation')
    }
    return success
  }

  // Check if registration expired (>25 days old)
  if (!isExpired) {
    console.log('[Push] Device registration still valid, no refresh needed')
    return false
  }

  console.log('[Push] Device registration expired, refreshing...')

  // Re-register with same token, new expiration
  const success = await registerDevice(currentToken, identity, publishEvent)

  if (success) {
    console.log('[Push] Device registration refreshed successfully')
  }

  return success
}

/**
 * Deregister device from push notifications (publish kind 3080 event)
 * Supports both local keys and NIP-07 browser extensions
 *
 * @param identity - User's identity (local key or NIP-07)
 * @param publishEvent - Function to publish event to relay
 * @returns true if successful
 */
export async function deregisterDevice(
  identity: { secretKey: string; publicKey: string } | null,
  publishEvent: (event: Event) => Promise<void>
): Promise<boolean> {
  try {
    if (!identity) {
      throw new Error('No identity provided')
    }

    // Get current FCM token to include in deregistration (optional but recommended)
    const fcmToken = await getFCMToken()

    // Delete the FCM token from Firebase to stop receiving push notifications
    try {
      await deleteFCMToken()
      console.log('[Push] FCM token deleted from Firebase')
    } catch (error) {
      console.warn('[Push] Failed to delete FCM token, continuing with deregistration:', error)
      // Continue with deregistration even if token deletion fails
    }

    // Decrypt service npub to hex pubkey
    const { data: servicePubkeyHex } = nip19.decode(PUSH_SERVICE_NPUB)

    if (typeof servicePubkeyHex !== 'string') {
      throw new Error('Invalid service npub format')
    }

    // Create payload with token (if available)
    const payload = {
      token: fcmToken || ''
    }

    // Encrypt payload with NIP-44 (supports both NIP-07 and local keys)
    const encryptedContent = await encryptForServiceAsync(
      JSON.stringify(payload),
      identity,
      servicePubkeyHex
    )

    // Create kind 3080 event (no expiration tag for deregistration)
    const now = Math.floor(Date.now() / 1000)
    const eventTemplate: EventTemplate = {
      kind: 3080,
      created_at: now,
      tags: [
        ['p', servicePubkeyHex],
        ['app', APP_NAME]
      ],
      content: encryptedContent
    }

    // Sign event (NIP-07 or local key)
    let signedEvent: Event
    if (identity.secretKey === 'NIP07_EXTENSION' && window.nostr?.signEvent) {
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

    console.log('[Push] Device deregistered successfully, event ID:', signedEvent.id)
    return true
  } catch (error) {
    console.error('[Push] Failed to deregister device:', error)
    return false
  }
}

/**
 * Query relay for actual registration status (kind 3079/3080 events)
 * This is the source of truth - localStorage is just a cache
 *
 * @param userPubkey - User's public key (hex)
 * @param queryRelay - Function to query relay for events
 * @returns true if latest event is kind 3079 (registered), false otherwise
 */
export async function checkRegistrationFromRelay(
  userPubkey: string,
  queryRelay: (filter: { kinds: number[]; authors: string[]; limit: number }) => Promise<Event[]>
): Promise<boolean> {
  try {
    // Query for both registration (3079) and deregistration (3080) events
    const events = await queryRelay({
      kinds: [3079, 3080],
      authors: [userPubkey],
      limit: 10
    })

    if (!events || events.length === 0) {
      console.log('[Push] No registration events found on relay')
      return false
    }

    // Sort by created_at to get the most recent event (source of truth)
    const sortedEvents = [...events].sort((a, b) => b.created_at - a.created_at)
    const latestEvent = sortedEvents[0]

    // Check if the latest event is a registration or deregistration
    if (latestEvent.kind === 3079) {
      console.log('[Push] Latest event is kind 3079 (registered) from', new Date(latestEvent.created_at * 1000).toISOString())

      // Update localStorage to match relay state
      updateDeviceRegistration(true, latestEvent.created_at)
      return true
    } else if (latestEvent.kind === 3080) {
      console.log('[Push] Latest event is kind 3080 (deregistered) from', new Date(latestEvent.created_at * 1000).toISOString())

      // Update localStorage to match relay state
      clearDeviceRegistration()
      return false
    }

    return false
  } catch (error) {
    console.error('[Push] Failed to check registration from relay:', error)

    // Fall back to localStorage on error
    const localState = isDeviceRegistered()
    console.log('[Push] Falling back to localStorage:', localState)
    return localState
  }
}

/**
 * Check if push notifications are supported in this browser
 */
export function isPushSupported(): boolean {
  return 'Notification' in window && 'serviceWorker' in navigator
}

/**
 * Get current notification permission status
 */
export function getNotificationPermission(): NotificationPermission {
  if (!('Notification' in window)) {
    return 'denied'
  }
  return Notification.permission
}
