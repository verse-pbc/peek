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
 * For communities2.nos.social, this should be the relay's admin/service key.
 * TODO: Get the actual service npub from communities2.nos.social configuration
 */
export const PUSH_SERVICE_NPUB = import.meta.env.VITE_PUSH_SERVICE_NPUB ||
  'npub1mutnyacc9uc4t5mmxvpprwsauj5p2qxq95v4a9j0jxl8wnkfvuyqpq9mhx' // TODO: Update with communities2 service key

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
