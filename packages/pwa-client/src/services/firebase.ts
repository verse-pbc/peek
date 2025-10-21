/**
 * Firebase Messaging Service
 *
 * Handles Firebase Cloud Messaging initialization and message handling
 * for push notifications.
 */

import { getToken, deleteToken, onMessage, Messaging } from 'firebase/messaging'
import { getFirebaseMessaging, getVapidKey } from '../config/firebase'

let messaging: Messaging | null = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
 * Initialize foreground message handling
 * Shows system notifications even when app is in focus (like demo app)
 * Call this on app startup
 */
export async function initializeForegroundNotifications(): Promise<void> {
  // Initialize messaging first to ensure onMessage works
  const messagingInstance = await initializeMessaging()

  if (!messagingInstance) {
    console.warn('[Firebase] Messaging not available, foreground notifications disabled')
    return
  }

  // Set up foreground message handler
  // Show system notifications via service worker (same as background)
  onMessage(messagingInstance, async (payload) => {
    console.log('[Firebase] 🔔 Foreground message received:', payload)
    console.log('[Firebase] Payload data:', payload.data)
    console.log('[Firebase] Payload notification:', payload.notification)

    // Check notification permission
    if (Notification.permission !== 'granted') {
      console.warn('[Firebase] Notification permission not granted')
      return
    }

    // Extract data from payload (data-only message format)
    const title = payload.data?.title || 'New Notification'
    const body = payload.data?.body || ''
    const groupId = payload.data?.groupId
    const eventId = payload.data?.nostrEventId

    console.log('[Firebase] 📬 Showing notification:', { title, body, groupId, eventId })

    // Show notification via service worker (like demo app)
    // This ensures consistent behavior for foreground/background
    try {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready
        const options = {
          body: body,
          icon: '/pwa-192x192.png',
          badge: '/pwa-192x192.png',
          data: payload.data,
          tag: eventId || `peek-${Date.now()}`,
          requireInteraction: false,
          vibrate: [200, 100, 200]
        }

        await registration.showNotification(title, options)
        console.log('[Firebase] ✅ Notification shown via Service Worker')
      } else {
        // Fallback to Notification API
        const notification = new Notification(title, {
          body: body,
          icon: '/pwa-192x192.png'
        })

        notification.onclick = () => {
          window.focus()
          notification.close()
        }
        console.log('[Firebase] ✅ Notification shown via Notification API (fallback)')
      }
    } catch (err) {
      console.error('[Firebase] Notification error:', err)
    }
  })

  console.log('[Firebase] ✅ Foreground notifications initialized and listening')
}

/**
 * Check if push notifications are supported
 */
export function isPushSupported(): boolean {
  return 'Notification' in window && 'serviceWorker' in navigator
}

/**
 * Delete FCM token (for deregistration)
 * Call this when user disables push notifications
 *
 * @returns true if successfully deleted
 */
export async function deleteFCMToken(): Promise<boolean> {
  try {
    const messagingInstance = await initializeMessaging()
    if (!messagingInstance) {
      console.warn('[Firebase] Messaging not available, cannot delete token')
      return false
    }

    await deleteToken(messagingInstance)
    console.log('[Firebase] FCM token deleted successfully')
    return true
  } catch (error) {
    console.error('[Firebase] Failed to delete FCM token:', error)
    return false
  }
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
