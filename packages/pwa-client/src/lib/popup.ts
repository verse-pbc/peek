/**
 * Popup window management utilities
 */

/**
 * Open a centered popup window
 *
 * @param url - URL to open in the popup
 * @param name - Window name (for window.open target)
 * @param width - Popup width in pixels
 * @param height - Popup height in pixels
 * @returns Window object or null if blocked
 */
export function openCenteredPopup(
  url: string,
  name: string,
  width: number,
  height: number
): Window | null {
  // Calculate center position
  const left = window.screenX + (window.outerWidth - width) / 2;
  const top = window.screenY + (window.outerHeight - height) / 2;

  const features = `width=${width},height=${height},left=${left},top=${top}`;

  return window.open(url, name, features);
}
