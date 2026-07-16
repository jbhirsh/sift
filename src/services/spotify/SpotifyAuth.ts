import * as Sentry from '@sentry/react-native';
import * as AuthSession from 'expo-auth-session';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import * as SecureStore from 'expo-secure-store';
// Imported solely to purge tokens that pre-migration builds wrote in plaintext.
import AsyncStorage from '@react-native-async-storage/async-storage';

// Ensure the browser session is dismissed when the auth completes
WebBrowser.maybeCompleteAuthSession();

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CLIENT_ID = '016e974fdcad481e9977a4fc59e2df5c';
const REDIRECT_URI = AuthSession.makeRedirectUri({
  scheme: 'sift',
  path: 'spotify-callback',
});
const SCOPES = 'user-library-read playlist-read-private playlist-modify-public playlist-modify-private';
const AUTH_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';

// SecureStore keys (alphanumeric + `_` — valid SecureStore key characters)
const STORAGE_KEY_ACCESS_TOKEN = 'spotify_access_token';
const STORAGE_KEY_REFRESH_TOKEN = 'spotify_refresh_token';
const STORAGE_KEY_TOKEN_EXPIRATION = 'spotify_token_expiration';

// ---------------------------------------------------------------------------
// PKCE helpers
// ---------------------------------------------------------------------------

/**
 * Generate a cryptographically random code verifier for PKCE.
 * 64 random bytes encoded as base64url (no padding).
 */
export function generateCodeVerifier(): string {
  const randomBytes = Crypto.getRandomBytes(64);
  return base64urlEncode(randomBytes);
}

/**
 * Derive the code challenge from a verifier using SHA-256.
 */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    verifier,
    { encoding: Crypto.CryptoEncoding.BASE64 },
  );
  // Convert standard base64 to base64url (no padding)
  return digest.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ---------------------------------------------------------------------------
// Token management
// ---------------------------------------------------------------------------

/** Persist tokens returned from the Spotify token endpoint. */
async function storeTokens(data: {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}): Promise<void> {
  const expiration = Date.now() + data.expires_in * 1000;
  await SecureStore.setItemAsync(STORAGE_KEY_ACCESS_TOKEN, data.access_token);
  await SecureStore.setItemAsync(STORAGE_KEY_TOKEN_EXPIRATION, String(expiration));
  if (data.refresh_token) {
    await SecureStore.setItemAsync(STORAGE_KEY_REFRESH_TOKEN, data.refresh_token);
  }
}

/** Read the current access token from storage. */
export async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(STORAGE_KEY_ACCESS_TOKEN);
}

/**
 * Best-effort removal of Spotify tokens that pre-migration builds persisted in
 * plaintext AsyncStorage. The current code only ever reads/writes tokens via
 * SecureStore, so deleting these legacy keys can never affect a live session.
 * Wrapped in try/catch so a storage failure can never break authentication.
 */
async function clearLegacyPlaintextTokens(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY_ACCESS_TOKEN);
    await AsyncStorage.removeItem(STORAGE_KEY_REFRESH_TOKEN);
    await AsyncStorage.removeItem(STORAGE_KEY_TOKEN_EXPIRATION);
  } catch {
    // Purging the old plaintext copy is best-effort; leave the (unused) keys
    // in place rather than disturb the auth flow.
  }
}

/** Check whether the user has a non-expired access token. */
export async function isAuthenticated(): Promise<boolean> {
  // Proactively purge any legacy plaintext tokens on the auth-check path, so a
  // user who authenticated before the SecureStore migration is cleaned up on
  // their next use even if they never explicitly log out or re-authenticate.
  await clearLegacyPlaintextTokens();

  const token = await SecureStore.getItemAsync(STORAGE_KEY_ACCESS_TOKEN);
  const expiration = await SecureStore.getItemAsync(STORAGE_KEY_TOKEN_EXPIRATION);
  if (!token || !expiration) return false;
  return Date.now() < Number(expiration);
}

/**
 * If the token is expired (or will expire within 60 s), use the refresh
 * token to obtain a fresh access token.
 */
export async function refreshTokenIfNeeded(): Promise<void> {
  const tokenValue = await SecureStore.getItemAsync(STORAGE_KEY_ACCESS_TOKEN);
  const expirationValue = await SecureStore.getItemAsync(STORAGE_KEY_TOKEN_EXPIRATION);
  const refreshToken = await SecureStore.getItemAsync(STORAGE_KEY_REFRESH_TOKEN);

  const expiration = Number(expirationValue);

  // Nothing to refresh
  if (!tokenValue || !refreshToken) return;

  // Still valid for at least 60 seconds — skip refresh
  if (Date.now() < expiration - 60_000) return;

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: CLIENT_ID,
  });

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    Sentry.addBreadcrumb({ category: 'spotify-auth', message: `Token refresh failed: ${response.status}`, level: 'warning' });
    // Refresh failed — force re-auth on next action
    await logout();
    return;
  }

  const data = await response.json();
  await storeTokens(data);
}

// ---------------------------------------------------------------------------
// Authorization flow (PKCE)
// ---------------------------------------------------------------------------

/**
 * Run the full Spotify OAuth 2.0 PKCE authorization flow.
 *
 * Opens the system browser to the Spotify consent screen, waits for the
 * redirect callback, exchanges the authorization code for tokens, and
 * persists them in the device's secure keystore (expo-secure-store).
 *
 * @returns `true` when tokens were obtained and stored, `false` otherwise.
 */
export async function authorize(): Promise<boolean> {
  try {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);

    const discovery = {
      authorizationEndpoint: AUTH_URL,
      tokenEndpoint: TOKEN_URL,
    };

    const request = new AuthSession.AuthRequest({
      clientId: CLIENT_ID,
      scopes: SCOPES.split(' '),
      redirectUri: REDIRECT_URI,
      codeChallengeMethod: AuthSession.CodeChallengeMethod.S256,
      codeChallenge,
      usePKCE: false, // We handle PKCE manually
      responseType: AuthSession.ResponseType.Code,
    });

    const result = await request.promptAsync(discovery);

    if (result.type !== 'success' || !result.params.code) {
      return false;
    }

    const code = result.params.code;

    // Exchange authorization code for tokens
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      code_verifier: codeVerifier,
    });

    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) return false;

    const data = await response.json();
    await storeTokens(data);
    return true;
  } catch (err) {
    Sentry.captureException(err, { tags: { flow: 'spotify-authorize' } });
    return false;
  }
}

// ---------------------------------------------------------------------------
// Logout
// ---------------------------------------------------------------------------

/** Clear all stored Spotify tokens (both SecureStore and any legacy plaintext). */
export async function logout(): Promise<void> {
  await SecureStore.deleteItemAsync(STORAGE_KEY_ACCESS_TOKEN);
  await SecureStore.deleteItemAsync(STORAGE_KEY_REFRESH_TOKEN);
  await SecureStore.deleteItemAsync(STORAGE_KEY_TOKEN_EXPIRATION);
  await clearLegacyPlaintextTokens();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Encode a Uint8Array as a base64url string (no padding). */
function base64urlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
