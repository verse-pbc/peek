/**
 * Hook: Push Notification Refresh
 *
 * Automatically refreshes expired device tokens and subscriptions on app startup.
 * Should be called once at the app root level.
 */

import { useEffect } from 'react'
import { useNostrLogin } from '@/lib/nostrify-shim'
import { useRelayManager } from '@/contexts/RelayContext'
import { checkAndRefreshDeviceToken } from '@/services/push'
import { checkAndRefreshSubscriptions } from '@/services/notifications'
import { getPrivateKeyFromIdentity } from '@/lib/crypto'

export function usePushNotificationRefresh() {
  const { identity } = useNostrLogin()
  const { relayManager } = useRelayManager()

  useEffect(() => {
    if (!identity || !relayManager) {
      return // Can't refresh without user identity and relay connection
    }

    // Get private key (returns null for NIP-07 extension)
    const privateKey = getPrivateKeyFromIdentity(identity)
    if (!privateKey) {
      console.log('[Push] Skipping refresh check - NIP-07 extension not supported yet')
      return
    }

    const refreshExpiredItems = async () => {
      console.log('[Push] Checking for expired tokens/subscriptions...')

      // Check device token expiration
      try {
        const deviceRefreshed = await checkAndRefreshDeviceToken(
          privateKey,
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
          privateKey,
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
