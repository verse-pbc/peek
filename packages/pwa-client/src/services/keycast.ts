/**
 * Keycast Remote Signer Service
 *
 * Provides integration with Keycast (oauth.divine.video) for secure Nostr identity
 * management via NIP-46 bunker URLs. Users can backup their keys and access them
 * across devices using email/password authentication.
 */

const KEYCAST_URL = import.meta.env.VITE_KEYCAST_URL || 'https://oauth.divine.video';

export interface KeycastRegisterRequest {
  email: string;
  password: string;
  nsec?: string; // Optional: import existing key (hex or bech32 format)
}

export interface KeycastRegisterResponse {
  user_id: string;
  email: string;
  pubkey: string;
  token: string;
}

export interface KeycastLoginRequest {
  email: string;
  password: string;
}

export interface KeycastLoginResponse {
  token: string;
  pubkey: string;
}

export interface KeycastBunkerResponse {
  bunker_url: string;
}

export interface KeycastErrorResponse {
  error: string;
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
 * Register a new Keycast account or import an existing Nostr key.
 * If nsec is provided, imports that key. Otherwise, Keycast generates a new keypair.
 *
 * If the key is already registered, automatically attempts to login instead.
 */
export async function registerWithKeycast(
  email: string,
  password: string,
  nsec?: string
): Promise<{ token: string; pubkey: string; bunker_url: string }> {
  try {
    const registerRes = await fetch(`${KEYCAST_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({
        email,
        password,
        ...(nsec && { nsec })
      })
    });

    if (!registerRes.ok) {
      const errorData = await registerRes.json() as KeycastErrorResponse;

      // If key already registered, try login instead
      if (errorData.error?.includes('already registered')) {
        console.log('Key already registered, attempting login...');
        return await loginToKeycast(email, password);
      }

      throw new KeycastError(
        errorData.error || 'Registration failed',
        registerRes.status
      );
    }

    const data = await registerRes.json() as KeycastRegisterResponse;

    // Get bunker URL using the JWT token
    const bunker_url = await getBunkerUrl(data.token);

    return {
      token: data.token,
      pubkey: data.pubkey,
      bunker_url
    };

  } catch (error) {
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
 * Login to an existing Keycast account.
 */
export async function loginToKeycast(
  email: string,
  password: string
): Promise<{ token: string; pubkey: string; bunker_url: string }> {
  try {
    const loginRes = await fetch(`${KEYCAST_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ email, password })
    });

    if (!loginRes.ok) {
      const errorData = await loginRes.json() as KeycastErrorResponse;
      throw new KeycastError(
        errorData.error || 'Login failed',
        loginRes.status
      );
    }

    const data = await loginRes.json() as KeycastLoginResponse;
    const bunker_url = await getBunkerUrl(data.token);

    return {
      token: data.token,
      pubkey: data.pubkey,
      bunker_url
    };

  } catch (error) {
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
 * Fetch the NIP-46 bunker URL for the authenticated user.
 * Requires a valid JWT token from login or registration.
 */
export async function getBunkerUrl(token: string): Promise<string> {
  try {
    const bunkerRes = await fetch(`${KEYCAST_URL}/api/user/bunker`, {
      headers: { 'Authorization': `Bearer ${token}` },
      cache: 'no-store'
    });

    if (!bunkerRes.ok) {
      const errorData = await bunkerRes.json() as KeycastErrorResponse;
      throw new KeycastError(
        errorData.error || 'Failed to get bunker URL',
        bunkerRes.status
      );
    }

    const data = await bunkerRes.json() as KeycastBunkerResponse;
    return data.bunker_url;

  } catch (error) {
    if (error instanceof KeycastError) {
      throw error;
    }

    throw new KeycastError(
      'Failed to retrieve bunker URL from Keycast.',
      undefined,
      error
    );
  }
}

/**
 * Store Keycast credentials in localStorage for persistence across sessions.
 */
export function storeKeycastCredentials(email: string, token: string, bunker_url: string): void {
  localStorage.setItem('keycast_email', email);
  localStorage.setItem('keycast_jwt', token);
  localStorage.setItem('keycast_bunker_url', bunker_url);
}

/**
 * Retrieve stored Keycast credentials from localStorage.
 */
export function getKeycastCredentials(): {
  email: string | null;
  token: string | null;
  bunker_url: string | null;
} {
  return {
    email: localStorage.getItem('keycast_email'),
    token: localStorage.getItem('keycast_jwt'),
    bunker_url: localStorage.getItem('keycast_bunker_url')
  };
}

/**
 * Clear Keycast credentials from localStorage (e.g., on logout).
 */
export function clearKeycastCredentials(): void {
  localStorage.removeItem('keycast_email');
  localStorage.removeItem('keycast_jwt');
  localStorage.removeItem('keycast_bunker_url');
}
