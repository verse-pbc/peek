import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ScrollToTop } from "./components/ScrollToTop";
import { Layout } from "./components/Layout";

import Index from "./pages/Index";
import Community from "./pages/Community";
import { NIP19Page } from "./pages/NIP19Page";
import { TestLocationPage } from "./pages/TestLocation";
import { TestCommunityPreviewPage } from "./pages/TestCommunityPreview";
import { JoinFlow } from "./pages/JoinFlow";
import JoinCommunityMock from "./pages/JoinCommunityMock";
import NotFound from "./pages/NotFound";

export function AppRouter() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Layout>
        <Routes>
          <Route path="/" element={<Index />} />
          {/* Peek-specific routes */}
          <Route path="/join/:communityId" element={<JoinFlow />} />
          <Route path="/c/join-community" element={<JoinCommunityMock />} /> {/* Mock page for local dev only */}
          <Route path="/c/:communityId" element={<JoinFlow />} /> {/* Alternative path for QR codes */}
          <Route path="/community/:communityId" element={<Community />} /> {/* Community page after validation */}
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