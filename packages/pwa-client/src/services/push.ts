/**
 * Push Notification Service
 *
 * Handles device registration (kind 3079) for push notifications.
 * Integrates with Firebase Cloud Messaging and nostr_push_service.
 */

import { finalizeEvent, type EventTemplate, type Event } from 'nostr-tools/pure'
import { requestNotificationPermissionAndGetToken } from './firebase'
import { encryptForService } from '../lib/crypto'
import { updateDeviceRegistration, needsDeviceRefresh, isDeviceRegistered } from '../lib/pushStorage'
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
 *
 * @param fcmToken - Firebase Cloud Messaging token
 * @param userPrivateKey - User's Nostr private key (Uint8Array)
 * @param publishEvent - Function to publish event to relay
 * @returns true if successful
 */
export async function registerDevice(
  fcmToken: string,
  userPrivateKey: Uint8Array,
  publishEvent: (event: Event) => Promise<void>
): Promise<boolean> {
  try {
    // Decrypt service npub to hex pubkey
    const { data: servicePubkeyHex } = nip19.decode(PUSH_SERVICE_NPUB)

    if (typeof servicePubkeyHex !== 'string') {
      throw new Error('Invalid service npub format')
    }

    // Create payload
    const payload = {
      token: fcmToken
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

    // Sign and publish
    const signedEvent = finalizeEvent(eventTemplate, userPrivateKey)
    await publishEvent(signedEvent)

    // Update localStorage
    updateDeviceRegistration(true, now)

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
 * Check and refresh device token if needed
 *
 * @param userPrivateKey - User's Nostr private key
 * @param publishEvent - Function to publish event to relay
 * @returns true if refreshed, false if no refresh needed or failed
 */
export async function checkAndRefreshDeviceToken(
  userPrivateKey: Uint8Array,
  publishEvent: (event: Event) => Promise<void>
): Promise<boolean> {
  // Check if refresh needed
  if (!isDeviceRegistrationExpired()) {
    console.log('[Push] Device registration still valid, no refresh needed')
    return false
  }

  console.log('[Push] Device registration expired, refreshing...')

  // Get current FCM token (should be same token, just updating expiration)
  const fcmToken = await getFCMToken()

  if (!fcmToken) {
    console.error('[Push] Failed to get FCM token for refresh')
    return false
  }

  // Re-register with new expiration
  const success = await registerDevice(fcmToken, userPrivateKey, publishEvent)

  if (success) {
    console.log('[Push] Device registration refreshed successfully')
  }

  return success
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
