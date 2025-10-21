/**
 * iOS Install Banner
 *
 * Shows installation instructions for iOS users who aren't running as PWA.
 * Dismissible banner that persists choice in localStorage.
 */

import React, { useState, useEffect } from 'react'
import { X, Info } from 'lucide-react'
import { Alert, AlertDescription } from './ui/alert'
import { Button } from './ui/button'
import { isIOS, isPWA } from '@/lib/platform'

const STORAGE_KEY = 'peek_ios_install_banner_dismissed'

export function IOSInstallBanner() {
  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    // Only show for iOS users not in PWA mode
    if (isIOS() && !isPWA()) {
      const wasDismissed = localStorage.getItem(STORAGE_KEY) === 'true'
      setDismissed(wasDismissed)
    }
  }, [])

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, 'true')
    setDismissed(true)
  }

  // Don't show if dismissed or not iOS or already PWA
  if (dismissed || !isIOS() || isPWA()) {
    return null
  }

  return (
    <Alert className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
      <div className="flex items-start gap-2 w-full">
        <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
        <AlertDescription className="text-sm flex-1">
          <span className="text-blue-800 dark:text-blue-200">
            Install Peek for push notifications: Tap <strong>Share → Add to Home Screen</strong>
          </span>
        </AlertDescription>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 flex-shrink-0"
          onClick={handleDismiss}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    </Alert>
  )
}
