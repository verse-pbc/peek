import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ScrollToTop } from "./components/ScrollToTop";
import { Layout } from "./components/Layout";
import { usePushNotificationRefresh } from "./hooks/usePushNotificationRefresh";

import Index from "./pages/Index";
import Community from "./pages/Community";
import CreateSticker from "./pages/CreateSticker";
import { NIP19Page } from "./pages/NIP19Page";
import { TestLocationPage } from "./pages/TestLocation";
import { TestCommunityPreviewPage } from "./pages/TestCommunityPreview";
import JoinCommunityMock from "./pages/JoinCommunityMock";
import NotFound from "./pages/NotFound";

export function AppRouter() {
  // Check and refresh expired push notification tokens/subscriptions on app startup
  usePushNotificationRefresh();

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