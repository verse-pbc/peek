/**
 * Hook: Push Notification Refresh
 *
 * Automatically refreshes expired device tokens and subscriptions on app startup.
 * Should be called once at the app root level.
 * Supports both local keys and NIP-07 browser extensions.
 */

import { useEffect } from 'react'
import { useNostrLogin, hasNip44Support } from '@/lib/nostrify-shim'
import { useRelayManager } from '@/contexts/RelayContext'
import { checkAndRefreshDeviceToken } from '@/services/push'
import { checkAndRefreshSubscriptions } from '@/services/notifications'

export function usePushNotificationRefresh() {
  const { identity } = useNostrLogin()
  const { relayManager } = useRelayManager()

  useEffect(() => {
    if (!identity || !relayManager) {
      return // Can't refresh without user identity and relay connection
    }

    const refreshExpiredItems = async () => {
      // If using NIP-07, wait for extension to load (they inject asynchronously)
      if (identity.secretKey === 'NIP07_EXTENSION') {
        // Wait up to 3 seconds for extension to become available
        let attempts = 0
        const maxAttempts = 30 // 30 * 100ms = 3 seconds

        while (attempts < maxAttempts && !hasNip44Support()) {
          await new Promise(resolve => setTimeout(resolve, 100))
          attempts++
        }

        // Check if NIP-07 extension supports NIP-44 (required for push notifications)
        if (!hasNip44Support()) {
          console.log('[Push] Skipping refresh check - NIP-07 extension does not support NIP-44')
          return
        }
      }

      console.log('[Push] Checking for expired tokens/subscriptions...')

      // Check device token expiration
      try {
        const deviceRefreshed = await checkAndRefreshDeviceToken(
          identity,
          (event) => relayManager.publishEvent(event)
        )

        if (deviceRefreshed) {
          console.log('[Push] Device token refreshed successfully')
        }
      } catch (error) {
        console.error('[Push] Failed to refresh device token:', error)
      }

      // Check community subscription expirations
      try {
        const refreshedCount = await checkAndRefreshSubscriptions(
          identity,
          (event) => relayManager.publishEvent(event)
        )

        if (refreshedCount > 0) {
          console.log(`[Push] Refreshed ${refreshedCount} community subscriptions`)
        }
      } catch (error) {
        console.error('[Push] Failed to refresh subscriptions:', error)
      }
    }

    // Run refresh check after a small delay to avoid blocking app startup
    const timer = setTimeout(refreshExpiredItems, 2000)

    return () => clearTimeout(timer)
  }, [identity, relayManager])
}
