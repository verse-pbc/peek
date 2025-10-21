/**
 * Notification Toggle Component
 *
 * Allows users to enable/disable push notifications globally.
 * Handles device registration (kind 3079) and batch community subscription.
 */

import React, { useState, useEffect } from 'react'
import { Bell, BellOff } from 'lucide-react'
import { Switch } from '../ui/switch'
import { Label } from '../ui/label'
import { useToast } from '@/hooks/useToast'
import {
  requestNotificationPermission,
  getFCMToken,
  registerDevice,
  deregisterDevice,
  checkRegistrationFromRelay,
  isPushSupported
} from '@/services/push'
import { subscribeToAllCommunities, unsubscribeFromAllCommunities } from '@/services/notifications'
import { isDeviceRegistered, clearDeviceRegistration } from '@/lib/pushStorage'
import { hasNip44Support } from '@/lib/nostrify-shim'
import { useNostrLogin } from '@/lib/nostrify-shim'
import { useRelayManager } from '@/contexts/RelayContext'

export function NotificationToggle() {
  const { toast } = useToast()
  const { identity } = useNostrLogin()
  const { relayManager, groupManager } = useRelayManager()
  const [enabled, setEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [checkingRelay, setCheckingRelay] = useState(true)

  // Query relay for actual registration status on mount
  useEffect(() => {
    const checkActualStatus = async () => {
      if (!identity || !relayManager) {
        // No identity yet, use localStorage as fallback
        const registered = isDeviceRegistered()
        setEnabled(registered)
        setLoading(false)
        setCheckingRelay(false)
        return
      }

      try {
        // Query relay for latest 3079/3080 events (source of truth)
        const isRegistered = await checkRegistrationFromRelay(
          identity.publicKey,
          (filter) => relayManager.queryEventsDirectly(filter)
        )

        setEnabled(isRegistered)
      } catch (error) {
        console.error('[NotificationToggle] Failed to query relay, using localStorage:', error)

        // Fall back to localStorage on error
        const registered = isDeviceRegistered()
        setEnabled(registered)
      } finally {
        setLoading(false)
        setCheckingRelay(false)
      }
    }

    checkActualStatus()
  }, [identity, relayManager])

  const handleToggle = async (checked: boolean) => {
    if (!identity) {
      toast({
        title: 'Login Required',
        description: 'Please login to enable push notifications',
        variant: 'destructive'
      })
      return
    }

    setLoading(true)

    // If using NIP-07, wait for extension to fully load (extensions inject asynchronously)
    if (identity.secretKey === 'NIP07_EXTENSION') {
      let attempts = 0
      const maxAttempts = 30 // 30 * 100ms = 3 seconds

      while (attempts < maxAttempts && !hasNip44Support()) {
        await new Promise(resolve => setTimeout(resolve, 100))
        attempts++
      }

      // Check if NIP-07 extension supports NIP-44 encryption
      if (!hasNip44Support()) {
        toast({
          title: 'Not Supported',
          description: 'Your browser extension does not support NIP-44 encryption. Please update your extension.',
          variant: 'destructive'
        })
        setLoading(false)
        return
      }
    }

    if (!isPushSupported()) {
      toast({
        title: 'Not Supported',
        description: 'Push notifications are not supported in this browser',
        variant: 'destructive'
      })
      setLoading(false)
      return
    }

    try {
      if (checked) {
        // Enable notifications
        const permission = await requestNotificationPermission()

        if (permission !== 'granted') {
          toast({
            title: 'Permission Denied',
            description: 'Please allow notifications in your browser settings',
            variant: 'destructive'
          })
          setEnabled(false)
          setLoading(false)
          return
        }

        // Get FCM token
        const fcmToken = await getFCMToken()

        if (!fcmToken) {
          toast({
            title: 'Registration Failed',
            description: 'Could not get push notification token. Please try again.',
            variant: 'destructive'
          })
          setEnabled(false)
          setLoading(false)
          return
        }

        // Register device (publish kind 3079)
        const success = await registerDevice(
          fcmToken,
          identity,
          (event) => relayManager!.publishEvent(event)
        )

        if (success) {
          setEnabled(true)

          // Subscribe to all existing communities
          if (groupManager) {
            const userGroups = await groupManager.getUserGroups()
            const communityIds = userGroups.map((g) => g.nip29GroupId)

            if (communityIds.length > 0) {
              console.log(`[NotificationToggle] Subscribing to ${communityIds.length} existing communities...`)

              const subscribedCount = await subscribeToAllCommunities(
                communityIds,
                identity,
                (event) => relayManager!.publishEvent(event)
              )

              toast({
                title: 'Notifications Enabled',
                description: `Subscribed to ${subscribedCount} communities. You'll receive push notifications for new messages.`
              })
            } else {
              toast({
                title: 'Notifications Enabled',
                description: 'You will receive push notifications when you join communities'
              })
            }
          }
        } else {
          toast({
            title: 'Registration Failed',
            description: 'Could not register device. Please try again.',
            variant: 'destructive'
          })
          setEnabled(false)
        }
      } else {
        // Disable notifications
        console.log('[NotificationToggle] Disabling push notifications...')

        // Step 1: Unsubscribe from all communities (kind 3082)
        const unsubscribedCount = await unsubscribeFromAllCommunities(
          identity,
          (event) => relayManager!.publishEvent(event)
        )
        console.log(`[NotificationToggle] Unsubscribed from ${unsubscribedCount} communities`)

        // Step 2: Deregister device (kind 3080)
        const deregistered = await deregisterDevice(
          identity,
          (event) => relayManager!.publishEvent(event)
        )

        if (deregistered) {
          // Step 3: Clear local storage
          clearDeviceRegistration()

          setEnabled(false)
          toast({
            title: 'Notifications Disabled',
            description: `Deregistered device and unsubscribed from ${unsubscribedCount} communities`
          })
        } else {
          toast({
            title: 'Deregistration Failed',
            description: 'Could not deregister device. Please try again.',
            variant: 'destructive'
          })
        }
      }
    } catch (error) {
      console.error('[NotificationToggle] Error:', error)
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive'
      })
      setEnabled(false)
    } finally {
      setLoading(false)
    }
  }

  if (!isPushSupported()) {
    return null // Don't show toggle if not supported
  }

  return (
    <div className="flex items-center justify-between space-x-2">
      <div className="flex items-center space-x-2">
        {enabled ? (
          <Bell className="h-4 w-4 text-primary" />
        ) : (
          <BellOff className="h-4 w-4 text-muted-foreground" />
        )}
        <div className="flex flex-col">
          <Label htmlFor="push-notifications" className="text-sm font-medium">
            Push Notifications
          </Label>
          <span className="text-xs text-muted-foreground">
            Get notified about community activity
          </span>
        </div>
      </div>
      <Switch
        id="push-notifications"
        checked={enabled}
        onCheckedChange={handleToggle}
        disabled={loading || checkingRelay || !identity}
      />
    </div>
  )
}
