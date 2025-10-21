/**
 * Service Worker Utilities
 *
 * Helper functions for ensuring service worker is ready and controlling the page
 * before making requests to fake endpoints (cache storage bridge).
 */

/**
 * Wait for service worker to be ready AND controlling the page
 * No timeout - waits as long as needed for SW to activate
 * Essential before calling fake endpoints like /__peek_keypair__
 */
export async function swReady(): Promise<void> {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Service Worker not supported')
  }

  // Wait for SW to be installed and activated
  await navigator.serviceWorker.ready

  // If not controlled yet, wait for controllerchange
  if (!navigator.serviceWorker.controller) {
    console.log('[SW] Waiting for controller...')
    await new Promise<void>((resolve) => {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        console.log('[SW] Controller changed, page now controlled')
        resolve()
      }, { once: true })
    })
  } else {
    console.log('[SW] Page already controlled')
  }
}

/**
 * Wait for service worker to be ready and controlling the page (with timeout)
 * Use swReady() instead for critical operations that must succeed
 *
 * @returns true if SW is controlling, false if timeout or not available
 * @deprecated Use swReady() for critical operations
 */
export async function ensureServiceWorkerControl(timeoutMs = 5000): Promise<boolean> {
  if (!('serviceWorker' in navigator)) {
    console.warn('[SW] Service Worker not supported')
    return false
  }

  try {
    // Wait for SW to be installed and activated
    await navigator.serviceWorker.ready

    // Check if we're already controlled
    if (navigator.serviceWorker.controller) {
      console.log('[SW] Page is controlled by service worker')
      return true
    }

    // Wait for controllerchange event (happens after skipWaiting + claim)
    console.log('[SW] Waiting for controller...')
    const controllerPromise = new Promise<boolean>((resolve) => {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        console.log('[SW] Controller changed, page now controlled')
        resolve(true)
      }, { once: true })
    })

    // Race with timeout
    const timeoutPromise = new Promise<boolean>((resolve) => {
      setTimeout(() => {
        console.warn('[SW] Timeout waiting for controller')
        resolve(false)
      }, timeoutMs)
    })

    return await Promise.race([controllerPromise, timeoutPromise])
  } catch (error) {
    console.error('[SW] Error waiting for control:', error)
    return false
  }
}

/**
 * Get service worker registration info for debugging
 */
export async function getServiceWorkerInfo(): Promise<{
  hasController: boolean
  scope: string | null
  state: string | null
}> {
  if (!('serviceWorker' in navigator)) {
    return { hasController: false, scope: null, state: null }
  }

  const registration = await navigator.serviceWorker.getRegistration()

  return {
    hasController: !!navigator.serviceWorker.controller,
    scope: registration?.scope || null,
    state: registration?.active?.state || null
  }
}

/**
 * Test if cache storage is actually shared between Safari browser and PWA
 * This varies by iOS version - iOS 14+ should share, but iOS 18 reports vary
 *
 * Usage in dev console:
 *   Browser: await testCacheSharing('write', 'SAFARI')
 *   PWA: await testCacheSharing('read')
 */
export async function testCacheSharing(mode: 'write' | 'read', value?: string): Promise<string | null> {
  try {
    await swReady()
    const cache = await caches.open('peek-cache-probe')

    if (mode === 'write') {
      const stamp = value || `WRITE-${Date.now()}`
      await cache.put('/probe', new Response(stamp))
      console.log('[Probe] Wrote to cache:', stamp)
      return stamp
    } else {
      const response = await cache.match('/probe')
      if (response) {
        const text = await response.text()
        console.log('[Probe] Read from cache:', text)
        return text
      } else {
        console.log('[Probe] Nothing in cache')
        return null
      }
    }
  } catch (e) {
    console.error('[Probe] Failed:', e)
    return null
  }
}
