/**
 * PWA and Platform Detection Utilities
 *
 * Detects if app is running as a Progressive Web App (PWA) and platform-specific
 * capabilities. Used to select appropriate OAuth flow (popup vs polling).
 */

// Extend Navigator interface for iOS standalone property
interface NavigatorWithStandalone extends Navigator {
  standalone?: boolean;
}

/**
 * Detect if app is running as a Progressive Web App
 *
 * @returns true if running as PWA (installed to home screen), false otherwise
 */
export function isPWA(): boolean {
  // iOS Safari PWA detection
  // When added to home screen, navigator.standalone is true
  if ((navigator as NavigatorWithStandalone).standalone === true) {
    return true;
  }

  // Chrome/Android PWA detection
  // When installed as PWA, display-mode is standalone
  if (window.matchMedia('(display-mode: standalone)').matches) {
    return true;
  }

  return false;
}

/**
 * Detect if running on iOS (iPhone, iPad, iPod)
 *
 * Used to determine if x-safari-https:// URL scheme is available
 * and if iOS-specific workarounds are needed.
 *
 * @returns true if running on iOS device, false otherwise
 */
export function isIOS(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent);
}

/**
 * Determine if OAuth polling flow should be used
 *
 * Polling is needed for iOS PWAs where popup window communication
 * is sandboxed and redirects open in Safari instead of the app.
 *
 * @returns true if polling flow should be used, false for popup flow
 */
export function shouldUsePollingFlow(): boolean {
  return isPWA() && isIOS();
}

/**
 * Check if this is the first launch after PWA installation
 * Uses localStorage flag to track
 */
export function isFirstPWALaunch(): boolean {
  if (!isPWA()) {
    return false;
  }

  const hasSeenPrompt = localStorage.getItem('pwa_import_prompt_shown');
  return !hasSeenPrompt;
}

/**
 * Mark that the PWA import prompt has been shown
 */
export function markPWAPromptShown(): void {
  localStorage.setItem('pwa_import_prompt_shown', 'true');
}

/**
 * Check if there was a previous identity before PWA installation
 * This helps detect if user had an account in browser before installing
 */
export function hadPreviousIdentity(): boolean {
  // Check for any existing identity in localStorage
  const existingIdentity = localStorage.getItem('peek_nostr_identity');
  return !!existingIdentity;
}
