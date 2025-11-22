/**
 * Keycast Remote Signer Service
 *
 * Provides integration with Keycast (oauth.divine.video) for secure Nostr identity
 * management via NIP-46 bunker URLs. Users authenticate via OAuth popup flow and can
 * optionally import their existing keys (BYOK - Bring Your Own Key).
 */

import { generatePKCE } from '../lib/pkce';
import { openCenteredPopup } from '../lib/popup';
import { shouldUsePollingFlow } from '../lib/pwa-detection';
import { nip19, getPublicKey } from 'nostr-tools';
import { hexToBytes } from '../lib/hex';

const KEYCAST_URL = import.meta.env.VITE_KEYCAST_URL || 'https://oauth.divine.video';
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
 * Automatically selects popup (web/desktop) or polling (iOS PWA) flow.
 * Optionally imports an existing Nostr key (BYOK) when in upgrade mode.
 *
 * @param nsec - Optional: hex or bech32 nsec to import (only used in upgrade mode)
 * @param mode - 'upgrade' to create new account with nsec import, 'switch' to login to existing account
 * @returns Promise resolving to bunker URL
 *
 * NOTE: Relays are configured at Keycast deployment level, not per-user.
 * The returned bunker URL will contain the relays configured by the Keycast operator.
 */
export async function connectWithKeycast(
  nsec?: string,
  mode: 'upgrade' | 'switch' = 'upgrade'
): Promise<string> {
  const redirectUri = `${window.location.origin}/oauth-callback.html`;

  // Auto-select flow based on environment
  const usePWAFlow = shouldUsePollingFlow();

  if (usePWAFlow) {
    return connectWithKeycastPolling(nsec, mode, redirectUri);
  } else {
    return connectWithKeycastPopup(nsec, mode, redirectUri);
  }
}

/**
 * Connect with Keycast using popup + postMessage flow (web/desktop)
 *
 * CRITICAL: Must be called synchronously in a user event handler (e.g., button click)
 * to avoid popup blocking.
 */
async function connectWithKeycastPopup(
  nsec: string | undefined,
  mode: 'upgrade' | 'switch',
  redirectUri: string
): Promise<string> {
  try {
    // Generate PKCE with embedded nsec
    const { verifier, challenge } = await generatePKCE(nsec);

    // Store verifier for later exchange
    sessionStorage.setItem('pkce_verifier', verifier);

    // Build authorization URL
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
    }

    // Open popup (500x700 centered)
    const popup = openCenteredPopup(authUrl.toString(), 'keycast-oauth', 500, 700);

    if (!popup) {
      throw new KeycastError('Popup blocked. Please allow popups for this site.');
    }

    // Wait for callback via postMessage
    const code = await new Promise<string>((resolve, reject) => {
      const handler = (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        if (event.data.type !== 'oauth_callback') return;

        // Cleanup listener
        window.removeEventListener('message', handler);

        // Handle error
        if (event.data.error) {
          reject(
            new KeycastError(
              event.data.error_description || event.data.error
            )
          );
          return;
        }

        // Handle success
        if (event.data.code) {
          resolve(event.data.code);
        }
      };

      window.addEventListener('message', handler);

      // Timeout after 5 minutes
      setTimeout(() => {
        window.removeEventListener('message', handler);
        reject(new KeycastError('Authentication timeout'));
      }, 300000);
    });

    // Exchange code for bunker URL
    return exchangeCodeForBunker(code, verifier, redirectUri);

  } catch (error) {
    // Clean up
    sessionStorage.removeItem('pkce_verifier');

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
    }

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
