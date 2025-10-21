/**
 * Push Notification Service Configuration
 *
 * Constants for nostr_push_service integration.
 * Uses the same relay as Peek's main communication (communities2.nos.social).
 */

/**
 * nostr_push_service public key (npub format)
 * This is the service that handles push notification delivery.
 *
 * For communities2.nos.social: npub1nel9egkn5rjvdl4rw9udq7ptzawryuxjd54k7t7c6glr2g3fhsrstf9rj8
 */
export const PUSH_SERVICE_NPUB = import.meta.env.VITE_PUSH_SERVICE_NPUB ||
  'npub1nel9egkn5rjvdl4rw9udq7ptzawryuxjd54k7t7c6glr2g3fhsrstf9rj8' // communities2.nos.social service

/**
 * Relay URL where push events are published
 * MUST match VITE_RELAY_URL (Peek's main relay)
 */
export const PUSH_SERVICE_RELAY = import.meta.env.VITE_PUSH_SERVICE_RELAY ||
  import.meta.env.VITE_RELAY_URL ||
  'wss://communities2.nos.social'

/**
 * App identifier for multi-app isolation
 * Must match the app configured in nostr_push_service
 */
export const APP_NAME = import.meta.env.VITE_APP_NAME || 'peek'

/**
 * Token and subscription expiration (30 days in seconds)
 */
export const TOKEN_EXPIRATION_SECONDS = 30 * 24 * 60 * 60 // 30 days

/**
 * Refresh threshold (25 days in seconds)
 * Refresh 5 days before expiration to ensure continuity
 */
export const REFRESH_THRESHOLD_SECONDS = 25 * 24 * 60 * 60 // 25 days

/**
 * Convert npub to hex pubkey
 */
export function npubToHex(npub: string): string {
  // This will be implemented using nostr-tools
  // Placeholder for now - will be filled in crypto implementation
  return npub
}
