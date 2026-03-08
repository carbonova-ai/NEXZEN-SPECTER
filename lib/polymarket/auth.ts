/**
 * Polymarket CLOB API Authentication
 *
 * Uses HMAC-SHA256 to sign requests.
 * Headers: POLY_API_KEY, POLY_TIMESTAMP, POLY_SIGNATURE, POLY_PASSPHRASE
 */

const CLOB_BASE = 'https://clob.polymarket.com';

interface ClobCredentials {
  apiKey: string;
  apiSecret: string;
  passphrase: string;
}

function getCredentials(): ClobCredentials {
  const apiKey = process.env.POLYMARKET_API_KEY;
  const apiSecret = process.env.POLYMARKET_API_SECRET;
  const passphrase = process.env.POLYMARKET_API_PASSPHRASE;

  if (!apiKey || !apiSecret || !passphrase) {
    throw new Error(
      'Missing Polymarket CLOB credentials. Set POLYMARKET_API_KEY, POLYMARKET_API_SECRET, POLYMARKET_API_PASSPHRASE in .env.local'
    );
  }

  return { apiKey, apiSecret, passphrase };
}

/**
 * Create HMAC-SHA256 signature for CLOB API authentication.
 * message = timestamp + method + requestPath + body
 */
async function createHmacSignature(
  secret: string,
  timestamp: string,
  method: string,
  requestPath: string,
  body: string
): Promise<string> {
  const message = timestamp + method + requestPath + body;

  // Decode base64 secret
  const secretBytes = Uint8Array.from(atob(secret), c => c.charCodeAt(0));

  const key = await crypto.subtle.importKey(
    'raw',
    secretBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const encoder = new TextEncoder();
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));

  // Encode signature as base64
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

/**
 * Build authentication headers for a CLOB API request.
 */
export async function buildAuthHeaders(
  method: string,
  requestPath: string,
  body: string = ''
): Promise<Record<string, string>> {
  const creds = getCredentials();
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const signature = await createHmacSignature(
    creds.apiSecret,
    timestamp,
    method.toUpperCase(),
    requestPath,
    body
  );

  return {
    'POLY_API_KEY': creds.apiKey,
    'POLY_TIMESTAMP': timestamp,
    'POLY_SIGNATURE': signature,
    'POLY_PASSPHRASE': creds.passphrase,
    'Content-Type': 'application/json',
  };
}

/**
 * Make an authenticated request to the Polymarket CLOB API.
 */
export async function clobFetch(
  method: string,
  path: string,
  body?: Record<string, unknown>
): Promise<Response> {
  const bodyStr = body ? JSON.stringify(body) : '';
  const headers = await buildAuthHeaders(method, path, bodyStr);

  return fetch(`${CLOB_BASE}${path}`, {
    method: method.toUpperCase(),
    headers,
    body: bodyStr || undefined,
  });
}

/**
 * Check if CLOB credentials are configured.
 */
export function hasClobCredentials(): boolean {
  return !!(
    process.env.POLYMARKET_API_KEY &&
    process.env.POLYMARKET_API_SECRET &&
    process.env.POLYMARKET_API_PASSPHRASE
  );
}
