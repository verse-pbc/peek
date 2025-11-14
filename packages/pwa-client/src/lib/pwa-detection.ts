/**
 * PWA installation and lifecycle detection utilities
 */

/**
 * Check if the app is currently running as an installed PWA
 */
export function isPWA(): boolean {
  // Check if running in standalone mode (installed PWA)
  if (window.matchMedia('(display-mode: standalone)').matches) {
    return true;
  }

  // iOS Safari (navigator.standalone is iOS-specific)
  if ('standalone' in window.navigator && (window.navigator as { standalone?: boolean }).standalone) {
    return true;
  }

  return false;
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
