/**
 * Platform Detection Utilities
 *
 * Detects iOS, PWA mode, and push notification capabilities across platforms.
 */

/**
 * Detect if running on iOS device
 * Includes iPad detection (Safari on iPad reports as Mac with touch)
 */
export function isIOS(): boolean {
  if (typeof window === 'undefined') return false

  return /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

/**
 * Detect if app is running as installed PWA (not in browser)
 */
export function isPWA(): boolean {
  if (typeof window === 'undefined') return false

  return window.matchMedia('(display-mode: standalone)').matches ||
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window.navigator as any).standalone === true ||
    document.referrer.includes('android-app://')
}

/**
 * Check if push notifications are available on this platform/mode
 * iOS requires PWA installation, all others just need browser support
 */
export function canUsePushNotifications(): boolean {
  if (typeof window === 'undefined') return false

  // Basic browser support check
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    return false
  }

  // iOS-specific: push only works in installed PWA mode
  if (isIOS() && !isPWA()) {
    return false
  }

  return true
}

/**
 * Get user-friendly platform name for messaging
 */
export function getPlatformName(): string {
  if (isIOS()) return 'iOS'
  if (/Android/i.test(navigator.userAgent)) return 'Android'
  if (/Mac/i.test(navigator.userAgent)) return 'macOS'
  if (/Win/i.test(navigator.userAgent)) return 'Windows'
  if (/Linux/i.test(navigator.userAgent)) return 'Linux'
  return 'this browser'
}
