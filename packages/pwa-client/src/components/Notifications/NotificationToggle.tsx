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
  isPushSupported
} from '@/services/push'
import { subscribeToAllCommunities, unsubscribeFromAllCommunities } from '@/services/notifications'
import { isDeviceRegistered } from '@/lib/pushStorage'
import { getPrivateKeyFromIdentity } from '@/lib/crypto'
import { useNostrLogin } from '@/lib/nostrify-shim'
import { useRelayManager } from '@/contexts/RelayContext'

export function NotificationToggle() {
  const { toast } = useToast()
  const { identity } = useNostrLogin()
  const { relayManager, groupManager } = useRelayManager()
  const [enabled, setEnabled] = useState(false)
  const [loading, setLoading] = useState(false)

  // Load initial state from localStorage
  useEffect(() => {
    const registered = isDeviceRegistered()
    setEnabled(registered)
  }, [])

  const handleToggle = async (checked: boolean) => {
    if (!identity) {
      toast({
        title: 'Login Required',
        description: 'Please login to enable push notifications',
        variant: 'destructive'
      })
      return
    }

    // Get private key (returns null for NIP-07 extension users)
    const privateKey = getPrivateKeyFromIdentity(identity)
    if (!privateKey) {
      toast({
        title: 'Not Supported',
        description: 'Push notifications require a local identity (not supported with browser extensions yet)',
        variant: 'destructive'
      })
      return
    }

    if (!isPushSupported()) {
      toast({
        title: 'Not Supported',
        description: 'Push notifications are not supported in this browser',
        variant: 'destructive'
      })
      return
    }

    setLoading(true)

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
          privateKey,
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
                privateKey,
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
        // Disable notifications - unsubscribe from all communities
        const unsubscribedCount = await unsubscribeFromAllCommunities(
          privateKey,
          (event) => relayManager!.publishEvent(event)
        )

        setEnabled(false)
        toast({
          title: 'Notifications Disabled',
          description: `Unsubscribed from ${unsubscribedCount} communities`
        })
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
        disabled={loading || !identity}
      />
    </div>
  )
}
