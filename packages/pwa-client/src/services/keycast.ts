/**
 * Keycast Remote Signer Service
 *
 * Provides integration with Keycast (oauth.divine.video) for secure Nostr identity
 * management via NIP-46 bunker URLs. Users authenticate via OAuth popup flow and can
 * optionally import their existing keys (BYOK - Bring Your Own Key).
 */

import { generatePKCE } from '../lib/pkce';
import { openCenteredPopup } from '../lib/popup';

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
 * Connect with Keycast using OAuth popup flow.
 * Optionally imports an existing Nostr key (BYOK) when in upgrade mode.
 *
 * @param nsec - Optional: hex or bech32 nsec to import (only used in upgrade mode)
 * @param mode - 'upgrade' to create new account with nsec import, 'switch' to login to existing account
 * @returns Promise resolving to bunker URL
 *
 * CRITICAL: Must be called synchronously in a user event handler (e.g., button click)
 * to avoid iOS PWA popup blocking. The popup is opened immediately before async work.
 *
 * NOTE: Relays are configured at Keycast deployment level, not per-user.
 * The returned bunker URL will contain the relays configured by the Keycast operator.
 */
export async function connectWithKeycast(
  nsec?: string,
  mode: 'upgrade' | 'switch' = 'upgrade'
): Promise<string> {
  const redirectUri = `${window.location.origin}/oauth-callback.html`;

  try {
    // Generate PKCE challenge
    const { verifier, challenge } = await generatePKCE();

    // Store verifier for later exchange
    sessionStorage.setItem('pkce_verifier', verifier);

    // Build authorization URL
    const authUrl = new URL(`${KEYCAST_URL}/api/oauth/authorize`);
    authUrl.searchParams.set('client_id', CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('scope', 'sign_event encrypt decrypt');
    authUrl.searchParams.set('code_challenge', challenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');

    // Only enable import_key for upgrade mode (registering with existing nsec)
    if (mode === 'upgrade' && nsec) {
      authUrl.searchParams.set('import_key', 'true');
    }

    // Open popup (500x700 centered)
    const popup = openCenteredPopup(authUrl.toString(), 'keycast-oauth', 500, 700);

    if (!popup) {
      throw new KeycastError('Popup blocked. Please allow popups for this site.');
    }

    // Setup message listeners
    const keycastOrigin = new URL(KEYCAST_URL).origin;

    // Listen for bunker URL from callback
    const bunkerUrl = await new Promise<string>((resolve, reject) => {
      // Listener 1: keycast_ready (from Keycast domain)
      const readyHandler = (event: MessageEvent) => {
        if (event.origin !== keycastOrigin) return;

        // Only send nsec for upgrade mode (importing key into new account)
        if (event.data.type === 'keycast_ready' && mode === 'upgrade' && nsec) {
          popup.postMessage(
            {
              type: 'import_nsec',
              nsec
            },
            keycastOrigin
          );
        }
      };

      // Listener 2: oauth_callback (from callback page)
      const callbackHandler = async (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        if (event.data.type !== 'oauth_callback') return;

        // Cleanup listeners
        window.removeEventListener('message', readyHandler);
        window.removeEventListener('message', callbackHandler);

        // Handle error
        if (event.data.error) {
          reject(
            new KeycastError(
              event.data.error_description || event.data.error
            )
          );
          return;
        }

        // Handle success - exchange code
        if (event.data.code) {
          try {
            const bunker = await exchangeCodeForBunker(
              event.data.code,
              verifier,
              redirectUri
            );
            resolve(bunker);
          } catch (error) {
            reject(error);
          }
        }
      };

      window.addEventListener('message', readyHandler);
      window.addEventListener('message', callbackHandler);

      // Timeout after 5 minutes
      setTimeout(() => {
        window.removeEventListener('message', readyHandler);
        window.removeEventListener('message', callbackHandler);
        reject(new KeycastError('Authentication timeout'));
      }, 300000);
    });

    return bunkerUrl;

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
