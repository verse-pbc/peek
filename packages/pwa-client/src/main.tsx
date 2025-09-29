import { createRoot } from 'react-dom/client';

// Import polyfills first
import './lib/polyfills.ts';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import App from './App.tsx';
import './index.css';

// Import custom fonts
import '@fontsource-variable/rubik';
import '@fontsource-variable/inter';

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
