// Self-destructing service worker
// This removes the old service worker and clears all caches

self.addEventListener('install', () => {
  // Skip waiting and activate immediately
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Self-destructing: clearing all caches and unregistering');

  event.waitUntil(
    // Delete all caches
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            console.log('[SW] Deleting cache:', cacheName);
            return caches.delete(cacheName);
          })
        );
      })
      .then(() => {
        // Unregister this service worker
        return self.registration.unregister();
      })
      .then(() => {
        console.log('[SW] Service worker unregistered, reloading page');
        // Force reload all clients
        return self.clients.matchAll();
      })
      .then(clients => {
        clients.forEach(client => {
          client.navigate(client.url);
        });
      })
  );
});

// Don't intercept any fetches - let everything go to network
self.addEventListener('fetch', () => {
  // Do nothing - pass through to network
});
