import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ScrollToTop } from "./components/ScrollToTop";
import { Layout } from "./components/Layout";
import { usePushNotificationRefresh } from "./hooks/usePushNotificationRefresh";
import { debugFirebaseConfig } from "./config/firebase";
import { initializeForegroundNotifications } from "./services/firebase";
import { useEffect } from "react";

import Index from "./pages/Index";
import Community from "./pages/Community";
import CreateSticker from "./pages/CreateSticker";
import { NIP19Page } from "./pages/NIP19Page";
import { TestLocationPage } from "./pages/TestLocation";
import { TestCommunityPreviewPage } from "./pages/TestCommunityPreview";
import JoinCommunityMock from "./pages/JoinCommunityMock";
import NotFound from "./pages/NotFound";

// Expose debug helpers to window object for console access
if (typeof window !== 'undefined') {
  (window as Window & { debugFirebaseConfig: typeof debugFirebaseConfig }).debugFirebaseConfig = debugFirebaseConfig;
}

export function AppRouter() {
  // Register service worker early (for identity cache, even when push not supported)
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/firebase-messaging-sw.js')
        .then(registration => {
          console.log('[SW] Service worker registered, scope:', registration.scope)
          // Check for updates periodically
          registration.update()
        })
        .catch(error => {
          console.error('[SW] Service worker registration failed:', error)
        })
    } else {
      console.warn('[SW] Service workers not supported')
    }
  }, [])

  // Check and refresh expired push notification tokens/subscriptions on app startup
  usePushNotificationRefresh();

  // Listen for service worker logs (debugging bridge)
  useEffect(() => {
    const handleSWMessage = (event: MessageEvent) => {
      if (event.data && event.data.__SW_LOG__) {
        const prefix = '[SW]'
        const message = `${prefix} ${event.data.level}: ${event.data.text}`

        if (event.data.level === 'error') {
          console.error(message)
        } else if (event.data.level === 'warn') {
          console.warn(message)
        } else {
          console.log(message)
        }
      }
    }

    navigator.serviceWorker?.addEventListener('message', handleSWMessage)

    return () => {
      navigator.serviceWorker?.removeEventListener('message', handleSWMessage)
    }
  }, [])

  // Auto-update service worker when user returns to tab
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && 'serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration()
        if (registration) {
          // Check for updates when user returns to app
          registration.update().catch(err => {
            console.warn('[SW] Update check failed:', err)
          })
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  // Initialize foreground notification handler (for when app is in focus)
  useEffect(() => {
    const setupForegroundNotifications = async () => {
      await initializeForegroundNotifications()
    }

    setupForegroundNotifications()
  }, [])

  return (
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <ScrollToTop />
      <Layout>
        <Routes>
          <Route path="/" element={<Index />} />
          {/* Peek-specific routes */}
          <Route path="/create" element={<CreateSticker />} /> {/* QR sticker generator (public, no auth) */}
          <Route path="/c/join-community" element={<JoinCommunityMock />} /> {/* Mock page for local dev only */}
          <Route path="/c/:communityId" element={<Community />} /> {/* Community page: shows join flow or chat based on membership */}
          <Route path="/test-location" element={<TestLocationPage />} />
          <Route path="/test-preview" element={<TestCommunityPreviewPage />} />
          {/* NIP-19 route for npub1, note1, naddr1, nevent1, nprofile1 */}
          <Route path="/:nip19" element={<NIP19Page />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
export default AppRouter;