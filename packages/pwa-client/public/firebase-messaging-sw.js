// Firebase Cloud Messaging Service Worker
// Handles background push notifications for Peek
// Version: 1.0.3

console.log('[SW] firebase-messaging-sw.js loading, scope:', self.registration?.scope)

// SW to Page log bridge - posts logs to main window console for easier debugging
const swLog = async (level, text) => {
  const cs = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' })
  for (const c of cs) c.postMessage({ __SW_LOG__: true, level, text })
}

// Load Firebase libraries with error handling
try {
  importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js')
  importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js')
  swLog('info', 'Firebase compat libs loaded')
  console.log('[SW] Firebase compat libs loaded')
} catch (e) {
  swLog('error', `Failed to load Firebase libs: ${e.message}`)
  console.error('[SW] Failed to load Firebase libs:', e)
}

// Load Firebase config synchronously
let firebaseConfigOk = false
try {
  self.importScripts('/firebase-config.js')
  if (typeof firebaseConfig === 'undefined') throw new Error('firebaseConfig undefined')
  firebase.initializeApp(firebaseConfig)
  swLog('info', 'firebase-config.js loaded and app initialized')
  console.log('[SW] Firebase app initialized with config:', firebaseConfig.projectId)
  firebaseConfigOk = true
} catch (e) {
  swLog('error', `Failed to load /firebase-config.js: ${e.message}`)
  console.error('[SW] Failed to load firebase-config.js:', e)
}

// Load notification config (app-specific formatters)
// Don't pre-declare - let importScripts create the global variable
try {
  self.importScripts('/notification-config.js')
  if (typeof notificationConfig !== 'undefined') {
    swLog('info', 'notification-config.js loaded')
    console.log('[SW] Notification config loaded with formatters')
  } else {
    swLog('warn', 'notification-config.js loaded but notificationConfig undefined')
  }
} catch (e) {
  swLog('warn', 'No notification-config.js, using defaults')
  console.warn('[SW] notification-config.js not found, using defaults')
}

// Initialize messaging if config loaded
let messaging
if (firebaseConfigOk) {
  try {
    messaging = firebase.messaging()
    swLog('info', 'Firebase Messaging initialized')
    console.log('[SW] Firebase Messaging initialized')
  } catch (e) {
    swLog('error', `Messaging init failed: ${e.message}`)
    console.error('[SW] Messaging init failed:', e)
  }
}

// Handle background messages - this is the proper FCM way for data-only messages
if (messaging) {
  messaging.onBackgroundMessage((payload) => {
    console.log('[SW] Received background message:', payload)
    console.log('[SW] Payload data:', payload.data)
    console.log('[SW] Title from data:', payload.data?.title)
    console.log('[SW] Body from data:', payload.data?.body)
    swLog('info', `Background message: ${payload.data?.title || 'Notification'}`)

    // Extract notification data from FCM payload
    // nostr_push_service sends data-only messages (no notification field)
    if (payload.data && payload.data.title && payload.data.body) {
      // Use config formatters if available, otherwise use server data as-is
      const title = notificationConfig?.formatTitle
        ? notificationConfig.formatTitle(payload.data)
        : payload.data.title

      const body = notificationConfig?.formatBody
        ? notificationConfig.formatBody(payload.data)
        : payload.data.body

      const icon = notificationConfig?.icon || '/pwa-192x192.png'
      const badge = notificationConfig?.badge || icon

      const clickUrl = notificationConfig?.getClickUrl
        ? notificationConfig.getClickUrl(payload.data)
        : (payload.data.groupId ? `/c/${payload.data.groupId}` : '/')

      console.log('[SW] Creating notification:', { title, body, icon })
      swLog('info', `Showing notification: ${title}`)

      // Merge config options with required fields
      const baseOptions = {
        body: body,
        icon: icon,
        badge: badge,
        tag: payload.data.nostrEventId || 'peek-notification',
        data: {
          url: clickUrl,
          eventId: payload.data.nostrEventId,
          groupId: payload.data.groupId,
          senderPubkey: payload.data.senderPubkey,
          receiverPubkey: payload.data.receiverPubkey,
          timestamp: Date.now()
        }
      }

      const notificationOptions = notificationConfig?.options
        ? { ...baseOptions, ...notificationConfig.options }
        : {
            ...baseOptions,
            requireInteraction: false,
            silent: false,
            vibrate: [200, 100, 200],
            renotify: true,
            actions: []
          }

      console.log('[SW] Showing notification with options:', notificationOptions)
      return self.registration.showNotification(title, notificationOptions)
    } else {
      console.error('[SW] Missing required data fields in payload:', payload.data)
      swLog('error', 'Missing required data fields in FCM payload')
    }
  })

  console.log('[SW] Background message handler registered')
  swLog('info', 'Background message handler registered')
} else {
  console.warn('[SW] Messaging not initialized - notifications disabled')
  swLog('warn', 'Messaging not initialized - notifications disabled')
}

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.notification.data)

  event.notification.close()

  const targetUrl = event.notification.data?.url || '/'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Check if there's already a window open
        for (const client of clientList) {
          if (client.url.includes(window.location.origin) && 'focus' in client) {
            // Navigate existing window to target URL
            client.postMessage({
              type: 'NOTIFICATION_CLICK',
              url: targetUrl,
              data: event.notification.data
            })
            return client.focus()
          }
        }
        // No window open - open new one
        if (clients.openWindow) {
          return clients.openWindow(targetUrl)
        }
      })
  )
})

// Service worker lifecycle management
self.addEventListener('install', (event) => {
  console.log('[SW] Service worker installing')
  swLog('info', 'SW installing')
  self.skipWaiting() // Activate immediately
})

self.addEventListener('activate', (event) => {
  console.log('[SW] Service worker activated')
  swLog('info', 'SW activated')
  event.waitUntil(clients.claim()) // Take control of all clients immediately
})

console.log('[SW] Firebase messaging service worker loaded')
swLog('info', 'Firebase messaging service worker loaded')
