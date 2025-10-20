/**
 * Firebase Configuration
 *
 * Initializes Firebase SDK for push notifications.
 * Configuration loaded from environment variables.
 */

import { initializeApp, FirebaseApp } from 'firebase/app'
import { getMessaging, Messaging, isSupported as isMessagingSupported } from 'firebase/messaging'

export interface FirebaseConfig {
  apiKey: string
  authDomain: string
  projectId: string
  storageBucket: string
  messagingSenderId: string
  appId: string
  measurementId?: string
}

let app: FirebaseApp | null = null
let messaging: Messaging | null = null

/**
 * Get Firebase configuration from environment variables
 */
export function getFirebaseConfig(): FirebaseConfig {
  const config: FirebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
    appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
  }

  if (import.meta.env.VITE_FIREBASE_MEASUREMENT_ID) {
    config.measurementId = import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
  }

  return config
}

/**
 * Initialize Firebase app (idempotent)
 */
export function initializeFirebase(): FirebaseApp {
  if (app) {
    return app
  }

  const config = getFirebaseConfig()

  // Validate required fields
  if (!config.apiKey || !config.projectId) {
    throw new Error('Firebase configuration incomplete. Check environment variables.')
  }

  app = initializeApp(config)
  console.log('[Firebase] App initialized with project:', config.projectId)

  return app
}

/**
 * Get Firebase Messaging instance (lazy init)
 * Returns null if messaging not supported (e.g., unsupported browser)
 */
export async function getFirebaseMessaging(): Promise<Messaging | null> {
  if (messaging) {
    return messaging
  }

  // Check if messaging is supported
  const supported = await isMessagingSupported()
  if (!supported) {
    console.warn('[Firebase] Push notifications not supported in this browser')
    return null
  }

  // Initialize app if needed
  if (!app) {
    initializeFirebase()
  }

  messaging = getMessaging(app!)
  console.log('[Firebase] Messaging initialized')

  return messaging
}

/**
 * Get VAPID public key from environment
 */
export function getVapidKey(): string {
  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY
  if (!vapidKey) {
    throw new Error('VAPID key not configured. Set VITE_FIREBASE_VAPID_KEY environment variable.')
  }
  return vapidKey
}

/**
 * Check if Firebase is configured
 */
export function isFirebaseConfigured(): boolean {
  const config = getFirebaseConfig()
  return !!(config.apiKey && config.projectId && import.meta.env.VITE_FIREBASE_VAPID_KEY)
}
