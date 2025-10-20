/**
 * Firebase Messaging Service
 *
 * Handles Firebase Cloud Messaging initialization and message handling
 * for push notifications.
 */

import { getMessaging, getToken, onMessage, Messaging } from 'firebase/messaging'
import { getFirebaseMessaging, getVapidKey } from '../config/firebase'

let messaging: Messaging | null = null
let foregroundMessageHandler: ((payload: any) => void) | null = null

/**
 * Initialize Firebase Messaging
 * Returns null if not supported (e.g., Safari without PWA install)
 */
export async function initializeMessaging(): Promise<Messaging | null> {
  if (messaging) {
    return messaging
  }

  messaging = await getFirebaseMessaging()

  if (!messaging) {
    console.warn('[Firebase] Messaging not supported in this browser')
    return null
  }

  console.log('[Firebase] Messaging service initialized')
  return messaging
}

/**
 * Request notification permission and get FCM token
 *
 * @returns FCM token string or null if permission denied/not supported
 */
export async function requestNotificationPermissionAndGetToken(): Promise<string | null> {
  // Check if notifications supported
  if (!('Notification' in window)) {
    console.warn('[Push] Notifications not supported in this browser')
    return null
  }

  // Request permission
  let permission = Notification.permission

  if (permission === 'default') {
    permission = await Notification.requestPermission()
  }

  if (permission !== 'granted') {
    console.log('[Push] Notification permission denied:', permission)
    return null
  }

  // Initialize messaging
  const messagingInstance = await initializeMessaging()
  if (!messagingInstance) {
    return null
  }

  // Register service worker
  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js')
  await navigator.serviceWorker.ready

  console.log('[Push] Service worker registered:', registration.scope)

  // Get FCM token
  try {
    const vapidKey = getVapidKey()
    const token = await getToken(messagingInstance, {
      vapidKey,
      serviceWorkerRegistration: registration
    })

    if (token) {
      console.log('[Push] FCM token obtained:', token.substring(0, 20) + '...')
      return token
    } else {
      console.warn('[Push] No FCM token returned - may need to retry on iOS')

      // iOS PWA sometimes needs a retry after SW is fully ready
      if (navigator.userAgent.includes('iPhone') || navigator.userAgent.includes('iPad')) {
        console.log('[Push] iOS detected - retrying token request after delay...')
        await new Promise(resolve => setTimeout(resolve, 2000))

        const retryToken = await getToken(messagingInstance, {
          vapidKey,
          serviceWorkerRegistration: registration
        })

        if (retryToken) {
          console.log('[Push] FCM token obtained on retry:', retryToken.substring(0, 20) + '...')
          return retryToken
        }
      }

      return null
    }
  } catch (error) {
    console.error('[Push] Failed to get FCM token:', error)
    return null
  }
}

/**
 * Set handler for foreground messages (when app is in focus)
 *
 * @param handler - Callback for incoming messages
 */
export function setForegroundMessageHandler(handler: (payload: any) => void): void {
  foregroundMessageHandler = handler

  if (messaging) {
    onMessage(messaging, (payload) => {
      console.log('[Push] Foreground message received:', payload)

      // Log notification details for debugging
      console.log('[Push] Notification details:', {
        title: payload.data?.title,
        groupId: payload.data?.groupId,
        eventId: payload.data?.nostrEventId,
        sender: payload.data?.senderPubkey?.substring(0, 8)
      })

      // Call registered handler
      if (foregroundMessageHandler) {
        foregroundMessageHandler(payload)
      }

      // Show in-app notification when app is in focus
      // Browser won't show system notification if tab is active, so we show toast
      if (document.visibilityState === 'visible') {
        // Handler should display in-app toast/notification
        console.log('[Push] App is in focus - foreground notification')
      }
    })
  }
}

/**
 * Initialize foreground message handling with default toast display
 * Call this on app startup
 */
export function initializeForegroundNotifications(showToast: (title: string, body: string, groupId?: string) => void): void {
  setForegroundMessageHandler((payload) => {
    const title = payload.data?.title || 'New Notification'
    const body = payload.data?.body || ''
    const groupId = payload.data?.groupId

    // Show in-app toast
    showToast(title, body, groupId)
  })
}

/**
 * Check if push notifications are supported
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
