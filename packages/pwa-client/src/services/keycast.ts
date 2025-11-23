/**
 * Keycast Remote Signer Service
 *
 * Provides integration with Keycast (keycast.dcadenas.dev) for secure Nostr identity
 * management via NIP-46 bunker URLs.
 *
 * Uses a Hybrid Flow:
 * 1. Redirect Flow for standard web (Desktop/Mobile Browser) - Most reliable.
 * 2. Polling Flow for iOS PWA - Required because Safari cannot redirect back to PWA instance.
 */

import { generatePKCE } from '../lib/pkce';
import { shouldUsePollingFlow } from '../lib/pwa-detection';
import { nip19, getPublicKey } from 'nostr-tools';
import { hexToBytes } from '../lib/hex';

const KEYCAST_URL = import.meta.env.VITE_KEYCAST_URL || 'https://keycast.dcadenas.dev';
const CLIENT_ID = import.meta.env.VITE_KEYCAST_CLIENT_ID || 'peek-app';

export interface KeycastTokenResponse {
  bunker_url: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

export interface KeycastErrorResponse {
  error: string;
  error_description?: string;
}

export class KeycastError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public originalError?: unknown
  ) {
    super(message);
    this.name = 'KeycastError';
  }
}

/**
 * Extract public key from nsec (hex or bech32 format)
 *
 * @param nsecHex - Secret key in hex or bech32 nsec1... format
 * @returns Public key in hex format
 */
function extractPubkeyFromNsec(nsecHex: string): string {
  try {
    let secretKeyBytes: Uint8Array;

    // Check if it's bech32 nsec1... format
    if (nsecHex.startsWith('nsec1')) {
      const decoded = nip19.decode(nsecHex);
      secretKeyBytes = decoded.data as Uint8Array;
    } else {
      // Assume hex format
      secretKeyBytes = hexToBytes(nsecHex);
    }

    // Get public key from secret key
    const publicKey = getPublicKey(secretKeyBytes);
    return publicKey;
  } catch (error) {
    throw new KeycastError(
      'Invalid nsec format. Must be hex or nsec1...',
      undefined,
      error
    );
  }
}

/**
 * Connect with Keycast using OAuth flow.
 * Automatically selects Redirect flow (Web) or Polling flow (iOS PWA).
 *
 * @param nsec - Optional: hex or bech32 nsec to import (only used in upgrade mode)
 * @param mode - 'upgrade' to create new account with nsec import, 'switch' to login to existing account
 * @returns Promise resolving to bunker URL (only for polling flow). For redirect flow, this promise never resolves as the page unloads.
 */
export async function connectWithKeycast(
  nsec?: string,
  mode: 'upgrade' | 'switch' = 'upgrade'
): Promise<string> {
  // Auto-select flow based on environment
  const usePWAFlow = shouldUsePollingFlow();

  if (usePWAFlow) {
    // iOS PWA: Use Polling Flow (opens Safari, polls for completion)
    // Redirect URI is just a dummy here as we rely on polling
    const redirectUri = `${window.location.origin}/oauth-callback.html`; 
    return connectWithKeycastPolling(nsec, mode, redirectUri);
  } else {
    // Standard Web: Use Redirect Flow (full page redirect)
    // Redirect back to app root to handle callback
    const redirectUri = `${window.location.origin}/`;
    await connectWithKeycastRedirect(nsec, mode, redirectUri);
    return new Promise(() => {}); // Never resolves as page unloads
  }
}

/**
 * Connect with Keycast using Redirect Flow (Web/Desktop)
 * 
 * Redirects the full page to Keycast. The app will reload on return
 * and `completeOAuthFlow` should be called.
 */
async function connectWithKeycastRedirect(
  nsec: string | undefined,
  mode: 'upgrade' | 'switch',
  redirectUri: string
): Promise<void> {
  try {
    // 1. Generate PKCE
    const { verifier, challenge } = await generatePKCE(nsec);

    // Store verifier for later exchange (persists across page loads)
    sessionStorage.setItem('pkce_verifier', verifier);

    // 2. Build authorization URL
    const authUrl = new URL(`${KEYCAST_URL}/api/oauth/authorize`);
    authUrl.searchParams.set('client_id', CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('scope', 'sign_event encrypt decrypt');
    authUrl.searchParams.set('code_challenge', challenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');

    // BYOK: Send pubkey so server knows to expect nsec in verifier
    if (mode === 'upgrade' && nsec) {
      const pubkey = extractPubkeyFromNsec(nsec);
      authUrl.searchParams.set('byok_pubkey', pubkey);
      console.log('[Keycast] BYOK - sending pubkey:', pubkey.substring(0, 16) + '...');
      console.log('[Keycast] BYOK - verifier has nsec:', verifier.includes('.'));
    } else if (mode === 'upgrade') {
      console.warn('[Keycast] BYOK - NO nsec provided for upgrade mode!');
    }

    // Default to registration form for upgrade mode
    if (mode === 'upgrade') {
      authUrl.searchParams.set('default_register', 'true');
    }

    // Force login prompt for switch mode (ignore existing session)
    if (mode === 'switch') {
      authUrl.searchParams.set('prompt', 'login');
    }

    console.log('[Keycast] Redirecting to:', authUrl.toString().substring(0, 150) + '...');

    // 3. Redirect User
    window.location.href = authUrl.toString();

  } catch (error) {
    sessionStorage.removeItem('pkce_verifier');
    if (error instanceof KeycastError) throw error;
    throw new KeycastError(
      'Failed to initiate connection to Keycast.',
      undefined,
      error
    );
  }
}

/**
 * Connect with Keycast using polling flow (iOS PWA)
 *
 * Opens Safari for authentication, then polls for authorization code.
 * User must manually switch back to PWA after authentication.
 */
async function connectWithKeycastPolling(
  nsec: string | undefined,
  mode: 'upgrade' | 'switch',
  redirectUri: string
): Promise<string> {
  try {
    // Generate state token for polling
    const state = crypto.randomUUID();

    // Generate PKCE with embedded nsec
    const { verifier, challenge } = await generatePKCE(nsec);

    // Store verifier with state key for later retrieval
    sessionStorage.setItem(`pkce_verifier_${state}`, verifier);
    sessionStorage.setItem('oauth_state', state);

    // Build authorization URL with state parameter
    const authUrl = new URL(`${KEYCAST_URL}/api/oauth/authorize`);
    authUrl.searchParams.set('client_id', CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('scope', 'sign_event encrypt decrypt');
    authUrl.searchParams.set('code_challenge', challenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('state', state);  // Tells server to use polling

    // BYOK: Send pubkey
    if (mode === 'upgrade' && nsec) {
      const pubkey = extractPubkeyFromNsec(nsec);
      authUrl.searchParams.set('byok_pubkey', pubkey);
      console.log('[Keycast] BYOK - sending pubkey:', pubkey.substring(0, 16) + '...');
      console.log('[Keycast] BYOK - verifier has nsec:', verifier.includes('.'));
    } else if (mode === 'upgrade') {
      console.warn('[Keycast] BYOK - NO nsec provided for upgrade mode!');
    }

    // Default to registration form for upgrade mode
    if (mode === 'upgrade') {
      authUrl.searchParams.set('default_register', 'true');
    }

    // Force login prompt for switch mode (ignore existing session)
    if (mode === 'switch') {
      authUrl.searchParams.set('prompt', 'login');
    }

    console.log('[Keycast] Polling flow - redirecting to:', authUrl.toString().substring(0, 150) + '...');

    // Redirect to Safari with x-safari-https:// scheme
    const safariUrl = `x-safari-https://${authUrl.toString().replace('https://', '')}`;
    window.location.href = safariUrl;

    // Start polling (will resume when user returns)
    return pollForCode(state, redirectUri);

  } catch (error) {
    // Clean up
    const state = sessionStorage.getItem('oauth_state');
    if (state) {
      sessionStorage.removeItem(`pkce_verifier_${state}`);
      sessionStorage.removeItem('oauth_state');
    }

    if (error instanceof KeycastError) {
      throw error;
    }

    throw new KeycastError(
      'Failed to connect to Keycast. Please check your internet connection.',
      undefined,
      error
    );
  }
}

/**
 * Poll for authorization code (iOS PWA flow)
 *
 * Polls /api/oauth/poll?state=... every 2 seconds until code is ready.
 */
async function pollForCode(state: string, redirectUri: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`${KEYCAST_URL}/api/oauth/poll?state=${state}`, {
          cache: 'no-store'
        });

        if (response.status === 200) {
          // Code ready!
          clearInterval(pollInterval);
          const { code } = await response.json();

          // Retrieve stored verifier
          const verifier = sessionStorage.getItem(`pkce_verifier_${state}`);
          if (!verifier) {
            reject(new KeycastError('Lost PKCE verifier during polling'));
            return;
          }

          // Clean up
          sessionStorage.removeItem(`pkce_verifier_${state}`);
          sessionStorage.removeItem('oauth_state');

          // Exchange code for bunker URL
          const bunkerUrl = await exchangeCodeForBunker(code, verifier, redirectUri);
          resolve(bunkerUrl);

        } else if (response.status === 202) {
          // Still pending - keep polling
          console.log('[Keycast] Polling... waiting for authorization');
        } else {
          // Error or expired
          clearInterval(pollInterval);
          sessionStorage.removeItem(`pkce_verifier_${state}`);
          sessionStorage.removeItem('oauth_state');
          reject(new KeycastError('Authorization failed or expired'));
        }
      } catch (error) {
        clearInterval(pollInterval);
        reject(error);
      }
    }, 2000);  // Poll every 2 seconds

    // Timeout after 5 minutes
    setTimeout(() => {
      clearInterval(pollInterval);
      reject(new KeycastError('Polling timeout - authorization took too long'));
    }, 300000);
  });
}

/**
 * Complete the OAuth flow by exchanging the code for a bunker URL.
 * Called by the /callback route (or main app on load).
 *
 * @param code - Authorization code from URL query params
 * @returns Promise resolving to bunker URL
 */
export async function completeOAuthFlow(code: string): Promise<string> {
  const redirectUri = `${window.location.origin}/`;
  const verifier = sessionStorage.getItem('pkce_verifier');

  if (!verifier) {
    throw new KeycastError('Missing PKCE verifier. Please try logging in again.');
  }

  console.log('[Keycast] Token exchange - verifier length:', verifier.length);
  console.log('[Keycast] Token exchange - verifier has nsec:', verifier.includes('.'));
  if (verifier.includes('.')) {
    const parts = verifier.split('.');
    console.log('[Keycast] Token exchange - nsec part length:', parts[1]?.length);
  }

  return exchangeCodeForBunker(code, verifier, redirectUri);
}

/**
 * Exchange authorization code for bunker URL (OAuth token endpoint)
 *
 * @param code - Authorization code from callback
 * @param verifier - PKCE code verifier
 * @param redirectUri - Must match the original redirect URI
 * @returns Promise resolving to bunker URL
 */
async function exchangeCodeForBunker(
  code: string,
  verifier: string,
  redirectUri: string
): Promise<string> {
  try {
    const response = await fetch(`${KEYCAST_URL}/api/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        client_id: CLIENT_ID,
        redirect_uri: redirectUri,
        code_verifier: verifier
      })
    });

    if (!response.ok) {
      const errorData = (await response.json()) as KeycastErrorResponse;
      throw new KeycastError(
        errorData.error_description || errorData.error || 'Token exchange failed',
        response.status
      );
    }

    const data = (await response.json()) as KeycastTokenResponse;

    // Clean up verifier
    sessionStorage.removeItem('pkce_verifier');

    return data.bunker_url;

  } catch (error) {
    if (error instanceof KeycastError) {
      throw error;
    }

    throw new KeycastError(
      'Failed to exchange authorization code for bunker URL.',
      undefined,
      error
    );
  }
}

/**
 * Store Keycast bunker URL in localStorage for persistence across sessions.
 */
export function storeKeycastCredentials(bunker_url: string): void {
  localStorage.setItem('keycast_bunker_url', bunker_url);
}

/**
 * Retrieve stored Keycast bunker URL from localStorage.
 */
export function getKeycastCredentials(): {
  bunker_url: string | null;
} {
  return {
    bunker_url: localStorage.getItem('keycast_bunker_url')
  };
}

/**
 * Clear Keycast credentials from localStorage (e.g., on logout).
 */
export function clearKeycastCredentials(): void {
  localStorage.removeItem('keycast_bunker_url');

  // Clean up old ROPC credentials if they exist
  localStorage.removeItem('keycast_email');
  localStorage.removeItem('keycast_jwt');
}
