import { createRoot } from 'react-dom/client';
import { Suspense } from 'react';

// Import polyfills first
import './lib/polyfills.ts';

// Import i18n configuration
import './i18n/config';
import './i18n/types';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import App from './App.tsx';
import './index.css';

// Import custom fonts
import '@fontsource-variable/rubik';
import '@fontsource-variable/inter';

// Prevent pinch-to-zoom gestures on mobile
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('gesturechange', (e) => e.preventDefault());
document.addEventListener('gestureend', (e) => e.preventDefault());

// Prevent double-tap zoom with touchend
let lastTouchEnd = 0;
document.addEventListener('touchend', (e) => {
  const now = Date.now();
  if (now - lastTouchEnd <= 300) {
    e.preventDefault();
  }
  lastTouchEnd = now;
}, false);

// Prevent pinch zoom with wheel event (trackpad/mouse)
document.addEventListener('wheel', (e) => {
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
  }
}, { passive: false });

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-coral mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    }>
      <App />
    </Suspense>
  </ErrorBoundary>
);
