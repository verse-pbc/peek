/**
 * PKCE (Proof Key for Code Exchange) utilities for OAuth 2.0
 * RFC 7636: https://tools.ietf.org/html/rfc7636
 */

/**
 * Base64URL encode a buffer (no padding, URL-safe)
 */
function base64URLEncode(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Generate PKCE code verifier and challenge
 *
 * Optionally embeds nsec in verifier for BYOK (Bring Your Own Key) flow.
 * Verifier format: {random_base64}.{nsec} when nsec is provided
 *
 * @param nsec - Optional: hex or bech32 nsec to embed in verifier (BYOK mode)
 * @returns Promise resolving to { verifier, challenge }
 */
export async function generatePKCE(nsec?: string): Promise<{
  verifier: string;
  challenge: string;
}> {
  // Generate random verifier (32 bytes = 43 base64url chars)
  const verifierBytes = new Uint8Array(32);
  crypto.getRandomValues(verifierBytes);
  const randomPart = base64URLEncode(verifierBytes.buffer);

  // Embed nsec in verifier if provided (BYOK flow)
  // Format: {random}.{nsec}
  const verifier = nsec ? `${randomPart}.${nsec}` : randomPart;

  console.log('[PKCE] Generated verifier - nsec provided:', !!nsec);
  console.log('[PKCE] Verifier length:', verifier.length);
  console.log('[PKCE] Verifier has dot:', verifier.includes('.'));
  if (nsec) {
    console.log('[PKCE] Nsec length:', nsec.length);
    console.log('[PKCE] Nsec first 8 chars:', nsec.substring(0, 8));
  }

  // Generate SHA-256 challenge
  // CRITICAL: Hash the ENTIRE verifier (including nsec if present)
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(verifier)
  );
  const challenge = base64URLEncode(hashBuffer);

  return { verifier, challenge };
}
