import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ScrollToTop } from "./components/ScrollToTop";
import { Layout } from "./components/Layout";
import { usePushNotificationRefresh } from "./hooks/usePushNotificationRefresh";
import { debugFirebaseConfig } from "./config/firebase";
import { initializeForegroundNotifications } from "./services/firebase";
import { useEffect, useState } from "react";
import { PWALoginPrompt } from "./components/PWALoginPrompt";
import { isFirstPWALaunch } from "./lib/pwa-detection";
import { completeOAuthFlow, storeKeycastCredentials } from "./services/keycast";
import { useNostrLogin } from "./lib/nostr-identity";
import { useToast } from "./hooks/useToast";
import { useTranslation } from "react-i18next";

import Index from "./pages/Index";
import Community from "./pages/Community";
import CreateSticker from "./pages/CreateSticker";
import { NIP19Page } from "./pages/NIP19Page";
import { TestLocationPage } from "./pages/TestLocation";
import { TestCommunityPreviewPage } from "./pages/TestCommunityPreview";
import JoinCommunityMock from "./pages/JoinCommunityMock";
import NotFound from "./pages/NotFound";

// Expose debug helpers to window object for console access
declare global {
  interface Window {
    debugFirebaseConfig: typeof debugFirebaseConfig
  }
}

if (import.meta.env.DEV && typeof window !== 'undefined') {
  window.debugFirebaseConfig = debugFirebaseConfig;
}

export function AppRouter() {
  const [showPWALoginPrompt, setShowPWALoginPrompt] = useState(false);
  const { loginWithBunker } = useNostrLogin();
  const { toast } = useToast();
  const { t } = useTranslation();

  // Handle Keycast OAuth Callback (Redirect Flow)
  useEffect(() => {
    const handleOAuthCallback = async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const state = params.get('state'); // Presence of state implies polling flow (PWA), not redirect flow
      const error = params.get('error');
      const errorDescription = params.get('error_description');

      // Only handle Redirect Flow callbacks (no state)
      if (code && !state) {
        try {
          // Clean URL immediately to avoid re-triggering
          window.history.replaceState({}, document.title, window.location.pathname);

          const bunkerUrl = await completeOAuthFlow(code);
          
          // Store and Login
          storeKeycastCredentials(bunkerUrl);
          if (loginWithBunker) {
            await loginWithBunker(bunkerUrl);
          }

          toast({
            title: t('identity_modal.keycast.success.connected'),
            description: t('identity_modal.keycast.success.reloading'),
          });

          // Hard reload to ensure clean state
          setTimeout(() => {
            window.location.reload();
          }, 1000);

        } catch (err) {
          console.error('[AppRouter] OAuth Callback failed:', err);
          toast({
            variant: "destructive",
            title: "Connection Failed",
            description: err instanceof Error ? err.message : "Unknown error during authentication",
          });
        }
      } else if (error && !state) {
        // Handle error redirect
        window.history.replaceState({}, document.title, window.location.pathname);
        toast({
          variant: "destructive",
          title: "Authorization Failed",
          description: errorDescription || error || "Access denied",
        });
      }
    };

    handleOAuthCallback();
  }, [loginWithBunker, toast, t]);

  // Check for first PWA launch and show login prompt
  useEffect(() => {
    if (isFirstPWALaunch()) {
      // Small delay to let the app fully load first
      setTimeout(() => {
        setShowPWALoginPrompt(true);
      }, 1000);
    }
  }, []);

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

      {/* PWA Login Prompt - show on first launch after installation */}
      <PWALoginPrompt
        open={showPWALoginPrompt}
        onOpenChange={setShowPWALoginPrompt}
      />
    </BrowserRouter>
  );
}
export default AppRouter;