// Firebase Cloud Messaging Service Worker
// Handles background push notifications for Peek

// Import Firebase scripts
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js')

// Firebase config will be injected at build time
// For now, using placeholder - will be loaded from /firebase-config.js at runtime
let firebaseConfig = null

// Initialize Firebase (config fetched at runtime)
async function initializeFirebase() {
  try {
    const response = await fetch('/firebase-config.js')
    const configText = await response.text()

    // Extract config object from JavaScript code
    // Config file format: const firebaseConfig = {...};
    const match = configText.match(/const firebaseConfig\s*=\s*({[^}]+})/s)
    if (match) {
      firebaseConfig = JSON.parse(match[1])
      firebase.initializeApp(firebaseConfig)
      console.log('[SW] Firebase initialized with config from /firebase-config.js')
    } else {
      console.error('[SW] Failed to parse Firebase config')
    }
  } catch (error) {
    console.error('[SW] Failed to fetch Firebase config:', error)
  }
}

// Initialize on service worker activation
self.addEventListener('activate', (event) => {
  console.log('[SW] Service worker activated')
  event.waitUntil(initializeFirebase())
})

// Handle background messages (when app is not in focus)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'FIREBASE_CONFIG') {
    // Receive config from main thread
    firebaseConfig = event.data.config
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig)
      console.log('[SW] Firebase initialized from main thread config')
    }
  }
})

// Firebase messaging instance (lazy init)
let messaging = null

function getMessaging() {
  if (!messaging && firebase.apps.length) {
    messaging = firebase.messaging()

    // Register background message handler
    messaging.onBackgroundMessage((payload) => {
      console.log('[SW] Received background message:', payload)

      // Extract notification data from FCM payload
      // nostr_push_service sends data-only messages (no notification field)
      const notificationTitle = payload.data?.title || 'New Notification'
      const notificationBody = payload.data?.body || ''
      const groupId = payload.data?.groupId
      const eventId = payload.data?.nostrEventId
      const senderPubkey = payload.data?.senderPubkey
      const receiverPubkey = payload.data?.receiverPubkey

      console.log('[SW] Notification details:', {
        title: notificationTitle,
        groupId,
        eventId,
        sender: senderPubkey?.substring(0, 8)
      })

      const notificationOptions = {
        body: notificationBody,
        icon: '/icon-192x192.png',
        badge: '/icon-192x192.png',
        tag: eventId || 'peek-notification', // Prevent duplicate notifications
        data: {
          url: groupId ? `/community/${groupId}` : '/',
          eventId: eventId,
          groupId: groupId,
          senderPubkey: senderPubkey,
          receiverPubkey: receiverPubkey,
          timestamp: Date.now()
        },
        requireInteraction: false, // Auto-dismiss after a few seconds
        silent: false, // Allow sound/vibration
        vibrate: [200, 100, 200], // Vibration pattern for mobile
        renotify: true, // Replace previous notifications with same tag
        actions: [] // No action buttons in MVP
      }

      return self.registration.showNotification(notificationTitle, notificationOptions)
    })
  }
  return messaging
}

// Attempt to initialize messaging on load
try {
  getMessaging()
} catch (error) {
  console.log('[SW] Messaging will be initialized when config is available')
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

// Handle service worker installation
self.addEventListener('install', (event) => {
  console.log('[SW] Service worker installing')
  self.skipWaiting() // Activate immediately
})

console.log('[SW] Firebase messaging service worker loaded')
