import * as Sentry from '@sentry/react-native';
import * as AuthSession from 'expo-auth-session';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
// Real code reads/writes tokens via SecureStore; AsyncStorage is used only to
// purge legacy plaintext tokens. It resolves to the project's async-storage
// jest mock via moduleNameMapper in jest.config.js.
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  isAuthenticated,
  getAccessToken,
  logout,
  generateCodeVerifier,
  generateCodeChallenge,
  authorize,
  refreshTokenIfNeeded,
} from '../../src/services/spotify/SpotifyAuth';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

jest.mock('expo-crypto', () => ({
  getRandomBytes: jest.fn(() => new Uint8Array(64)),
  digestStringAsync: jest.fn(() => Promise.resolve('mocked-digest-base64==')),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { BASE64: 'base64' },
}));

jest.mock('expo-auth-session', () => ({
  // Arg-dependent so the scheme/path config is observable in REDIRECT_URI: the
  // real Expo helper derives the URI from these fields, so a mutated scheme or
  // path flows through to the token-exchange body we assert on below.
  makeRedirectUri: jest.fn(
    (opts: { scheme?: string; path?: string } = {}) =>
      `${opts.scheme}://${opts.path}`,
  ),
  AuthRequest: jest.fn(),
  CodeChallengeMethod: { S256: 'S256' },
  ResponseType: { Code: 'code' },
}));

jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
}));

jest.mock('@sentry/react-native', () => ({
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Typed mock references
// ---------------------------------------------------------------------------

const mockGetItem = SecureStore.getItemAsync as jest.MockedFunction<
  typeof SecureStore.getItemAsync
>;
const mockSetItem = SecureStore.setItemAsync as jest.MockedFunction<
  typeof SecureStore.setItemAsync
>;
const mockRemoveItem = SecureStore.deleteItemAsync as jest.MockedFunction<
  typeof SecureStore.deleteItemAsync
>;
const mockLegacyRemove = AsyncStorage.removeItem as jest.MockedFunction<
  typeof AsyncStorage.removeItem
>;
const mockGetRandomBytes = Crypto.getRandomBytes as jest.MockedFunction<
  typeof Crypto.getRandomBytes
>;
const mockDigest = Crypto.digestStringAsync as jest.MockedFunction<
  typeof Crypto.digestStringAsync
>;
const mockCaptureException = Sentry.captureException as jest.MockedFunction<
  typeof Sentry.captureException
>;
const mockAddBreadcrumb = Sentry.addBreadcrumb as jest.MockedFunction<
  typeof Sentry.addBreadcrumb
>;
const MockAuthRequest = AuthSession.AuthRequest as unknown as jest.Mock;

// Storage keys (kept in sync with the module's private constants).
const KEY_ACCESS = 'spotify_access_token';
const KEY_REFRESH = 'spotify_refresh_token';
const KEY_EXPIRATION = 'spotify_token_expiration';

const CLIENT_ID = '016e974fdcad481e9977a4fc59e2df5c';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const AUTH_URL = 'https://accounts.spotify.com/authorize';
// Derived from the arg-dependent makeRedirectUri mock above.
const REDIRECT_URI = 'sift://spotify-callback';

let mockFetch: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  // Fresh fetch spy for every test so "did not call the network" is assertable.
  mockFetch = jest.fn();
  globalThis.fetch = mockFetch as unknown as typeof fetch;
});

/** Build a fetch Response stub carrying a JSON token payload. */
function tokenResponse(
  ok: boolean,
  body: Record<string, unknown> = {},
  status = ok ? 200 : 400,
) {
  return { ok, status, json: jest.fn().mockResolvedValue(body) };
}

// ---------------------------------------------------------------------------
// PKCE — generateCodeVerifier
// ---------------------------------------------------------------------------

describe('generateCodeVerifier', () => {
  test('base64url-encodes the random bytes, translating + / and dropping padding', () => {
    // 0xFB,0xFF,0xFF,0xFF encodes to standard base64 "+////w==", which exercises
    // every transform: + -> -, / -> _, and stripping the "==" padding.
    mockGetRandomBytes.mockReturnValueOnce(
      new Uint8Array([0xfb, 0xff, 0xff, 0xff]),
    );

    expect(generateCodeVerifier()).toBe('-____w');
  });

  test('requests 64 bytes of entropy', () => {
    generateCodeVerifier();
    expect(mockGetRandomBytes).toHaveBeenCalledWith(64);
  });

  test('produces a URL-safe string with no +, /, or = characters', () => {
    const verifier = generateCodeVerifier();
    expect(typeof verifier).toBe('string');
    expect(verifier.length).toBeGreaterThan(0);
    expect(verifier).not.toMatch(/[+/=]/);
  });
});

// ---------------------------------------------------------------------------
// PKCE — generateCodeChallenge
// ---------------------------------------------------------------------------

describe('generateCodeChallenge', () => {
  test('SHA-256 digests the verifier as base64, then base64url-encodes it', async () => {
    // A digest containing + and / with padding pins all three transforms.
    mockDigest.mockResolvedValueOnce('ab+/cd==');

    const challenge = await generateCodeChallenge('test-verifier');

    expect(challenge).toBe('ab-_cd');
    expect(mockDigest).toHaveBeenCalledWith('SHA-256', 'test-verifier', {
      encoding: 'base64',
    });
  });

  test('returns a URL-safe challenge with no +, /, or = characters', async () => {
    const challenge = await generateCodeChallenge('test-verifier');
    expect(challenge).not.toMatch(/[+/=]/);
  });
});

// ---------------------------------------------------------------------------
// getAccessToken
// ---------------------------------------------------------------------------

describe('getAccessToken', () => {
  test('returns the token stored under the access-token key', async () => {
    mockGetItem.mockResolvedValueOnce('my-access-token');

    const token = await getAccessToken();

    expect(token).toBe('my-access-token');
    expect(mockGetItem).toHaveBeenCalledWith(KEY_ACCESS);
  });

  test('returns null when no token is stored', async () => {
    mockGetItem.mockResolvedValueOnce(null);

    expect(await getAccessToken()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// isAuthenticated
// ---------------------------------------------------------------------------

describe('isAuthenticated', () => {
  test('returns false when no token is stored', async () => {
    mockGetItem.mockResolvedValueOnce(null); // access token
    mockGetItem.mockResolvedValueOnce(null); // expiration

    expect(await isAuthenticated()).toBe(false);
  });

  test('returns false when a token exists but the expiration is missing', async () => {
    mockGetItem.mockResolvedValueOnce('some-token'); // access token
    mockGetItem.mockResolvedValueOnce(null); // expiration

    expect(await isAuthenticated()).toBe(false);
  });

  test('returns false when the expiration exists but the token is missing', async () => {
    // Distinguishes `||` from `&&`: only one of the two values is present, so an
    // AND would fall through to the date check and wrongly report authenticated.
    mockGetItem.mockResolvedValueOnce(null); // access token
    mockGetItem.mockResolvedValueOnce(String(Date.now() + 3_600_000)); // expiration

    expect(await isAuthenticated()).toBe(false);
  });

  test('returns false when the token is expired', async () => {
    mockGetItem.mockResolvedValueOnce('some-token');
    mockGetItem.mockResolvedValueOnce(String(Date.now() - 60_000));

    expect(await isAuthenticated()).toBe(false);
  });

  test('returns true when the token is present and unexpired', async () => {
    mockGetItem.mockResolvedValueOnce('valid-token');
    mockGetItem.mockResolvedValueOnce(String(Date.now() + 3_600_000));

    expect(await isAuthenticated()).toBe(true);
  });

  test('treats a token expiring exactly now as expired (strict <)', async () => {
    const now = 1_000_000_000_000;
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(now);
    try {
      mockGetItem.mockResolvedValueOnce('token'); // access token
      mockGetItem.mockResolvedValueOnce(String(now)); // expiration == now

      expect(await isAuthenticated()).toBe(false);
    } finally {
      nowSpy.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// Legacy plaintext token migration
// ---------------------------------------------------------------------------

describe('legacy plaintext token migration', () => {
  test('isAuthenticated purges all three legacy plaintext keys from AsyncStorage', async () => {
    mockGetItem.mockResolvedValue(null);

    await isAuthenticated();

    expect(mockLegacyRemove).toHaveBeenCalledWith(KEY_ACCESS);
    expect(mockLegacyRemove).toHaveBeenCalledWith(KEY_REFRESH);
    expect(mockLegacyRemove).toHaveBeenCalledWith(KEY_EXPIRATION);
  });

  test('logout purges all three legacy plaintext keys from AsyncStorage', async () => {
    await logout();

    expect(mockLegacyRemove).toHaveBeenCalledWith(KEY_ACCESS);
    expect(mockLegacyRemove).toHaveBeenCalledWith(KEY_REFRESH);
    expect(mockLegacyRemove).toHaveBeenCalledWith(KEY_EXPIRATION);
  });

  test('a failed legacy purge is swallowed and never breaks authentication', async () => {
    mockGetItem.mockResolvedValueOnce('valid-token');
    mockGetItem.mockResolvedValueOnce(String(Date.now() + 3_600_000));
    mockLegacyRemove.mockRejectedValueOnce(new Error('storage unavailable'));

    expect(await isAuthenticated()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// refreshTokenIfNeeded
// ---------------------------------------------------------------------------

describe('refreshTokenIfNeeded', () => {
  test('does nothing when neither a token nor a refresh token is stored', async () => {
    mockGetItem.mockResolvedValueOnce(null); // access token
    mockGetItem.mockResolvedValueOnce(null); // expiration
    mockGetItem.mockResolvedValueOnce(null); // refresh token

    await refreshTokenIfNeeded();

    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('does nothing when the access token is missing (even if a refresh token exists)', async () => {
    mockGetItem.mockResolvedValueOnce(null); // access token missing
    mockGetItem.mockResolvedValueOnce(String(Date.now() - 1_000)); // expired
    mockGetItem.mockResolvedValueOnce('refresh-token'); // refresh present

    await refreshTokenIfNeeded();

    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('does nothing when the refresh token is missing (even if expired)', async () => {
    mockGetItem.mockResolvedValueOnce('token');
    mockGetItem.mockResolvedValueOnce(String(Date.now() - 1_000)); // expired
    mockGetItem.mockResolvedValueOnce(null); // no refresh token

    await refreshTokenIfNeeded();

    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('skips the refresh while the token is valid for more than 60 seconds', async () => {
    mockGetItem.mockResolvedValueOnce('token');
    mockGetItem.mockResolvedValueOnce(String(Date.now() + 120_000)); // 2 min left
    mockGetItem.mockResolvedValueOnce('refresh-token');

    await refreshTokenIfNeeded();

    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('refreshes exactly at the 60-second pre-expiry threshold (strict <)', async () => {
    const now = 1_000_000_000_000;
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(now);
    try {
      mockGetItem.mockResolvedValueOnce('token');
      mockGetItem.mockResolvedValueOnce(String(now + 60_000)); // exactly 60s away
      mockGetItem.mockResolvedValueOnce('refresh-token');
      mockFetch.mockResolvedValue(
        tokenResponse(true, { access_token: 'new', expires_in: 3600 }),
      );

      await refreshTokenIfNeeded();

      expect(mockFetch).toHaveBeenCalledTimes(1);
    } finally {
      nowSpy.mockRestore();
    }
  });

  test('POSTs the refresh grant to the token endpoint and stores the new tokens', async () => {
    const now = 1_000_000_000_000;
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(now);
    try {
      mockGetItem.mockResolvedValueOnce('old-token');
      mockGetItem.mockResolvedValueOnce(String(now - 1_000)); // expired
      mockGetItem.mockResolvedValueOnce('refresh-token');
      mockFetch.mockResolvedValue(
        tokenResponse(true, {
          access_token: 'new-token',
          refresh_token: 'new-refresh',
          expires_in: 3600,
        }),
      );

      await refreshTokenIfNeeded();

      expect(mockFetch).toHaveBeenCalledWith(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body:
          'grant_type=refresh_token&refresh_token=refresh-token&client_id=' +
          CLIENT_ID,
      });
      // now + expires_in * 1000 = 1_000_000_000_000 + 3_600_000
      expect(mockSetItem).toHaveBeenCalledWith(KEY_EXPIRATION, '1000003600000');
      expect(mockSetItem).toHaveBeenCalledWith(KEY_ACCESS, 'new-token');
      expect(mockSetItem).toHaveBeenCalledWith(KEY_REFRESH, 'new-refresh');
    } finally {
      nowSpy.mockRestore();
    }
  });

  test('keeps the existing refresh token when the response omits a new one', async () => {
    mockGetItem.mockResolvedValueOnce('old-token');
    mockGetItem.mockResolvedValueOnce(String(Date.now() - 1_000));
    mockGetItem.mockResolvedValueOnce('refresh-token');
    mockFetch.mockResolvedValue(
      tokenResponse(true, { access_token: 'new-token', expires_in: 3600 }),
    );

    await refreshTokenIfNeeded();

    // Only access token + expiration are written; the refresh key is untouched
    // rather than being overwritten with `undefined`.
    expect(mockSetItem).toHaveBeenCalledTimes(2);
    expect(mockSetItem).not.toHaveBeenCalledWith(KEY_REFRESH, undefined);
  });

  test('logs out and does not store tokens when the refresh request fails', async () => {
    mockGetItem.mockResolvedValueOnce('old-token');
    mockGetItem.mockResolvedValueOnce(String(Date.now() - 1_000));
    mockGetItem.mockResolvedValueOnce('refresh-token');
    // Response carries a valid body: if the failure branch were skipped, the
    // code would fall through and store these tokens — which we assert it never does.
    mockFetch.mockResolvedValue(
      tokenResponse(false, { access_token: 'should-not-store', expires_in: 3600 }, 401),
    );

    await refreshTokenIfNeeded();

    expect(mockRemoveItem).toHaveBeenCalledWith(KEY_ACCESS);
    expect(mockRemoveItem).toHaveBeenCalledWith(KEY_REFRESH);
    expect(mockRemoveItem).toHaveBeenCalledWith(KEY_EXPIRATION);
    expect(mockSetItem).not.toHaveBeenCalled();
  });

  test('records a Sentry breadcrumb describing the failed refresh', async () => {
    mockGetItem.mockResolvedValueOnce('old-token');
    mockGetItem.mockResolvedValueOnce(String(Date.now() - 1_000));
    mockGetItem.mockResolvedValueOnce('refresh-token');
    mockFetch.mockResolvedValue(tokenResponse(false, {}, 503));

    await refreshTokenIfNeeded();

    expect(mockAddBreadcrumb).toHaveBeenCalledWith({
      category: 'spotify-auth',
      message: 'Token refresh failed: 503',
      level: 'warning',
    });
  });
});

// ---------------------------------------------------------------------------
// authorize (PKCE authorization flow)
// ---------------------------------------------------------------------------

describe('authorize', () => {
  /** Wire up an AuthRequest whose promptAsync resolves to `result`. */
  function stubPrompt(result: unknown) {
    const promptAsync = jest.fn().mockResolvedValue(result);
    MockAuthRequest.mockImplementation(() => ({ promptAsync }));
    return promptAsync;
  }

  test('builds the PKCE AuthRequest and prompts against the Spotify discovery doc', async () => {
    const promptAsync = stubPrompt({ type: 'cancel' });

    await authorize();

    expect(MockAuthRequest).toHaveBeenCalledWith({
      clientId: CLIENT_ID,
      scopes: [
        'user-library-read',
        'playlist-read-private',
        'playlist-modify-public',
        'playlist-modify-private',
      ],
      redirectUri: REDIRECT_URI,
      codeChallengeMethod: 'S256',
      codeChallenge: 'mocked-digest-base64',
      usePKCE: false,
      responseType: 'code',
    });
    expect(promptAsync).toHaveBeenCalledWith({
      authorizationEndpoint: AUTH_URL,
      tokenEndpoint: TOKEN_URL,
    });
  });

  test('returns false and exchanges nothing when the user cancels', async () => {
    stubPrompt({ type: 'cancel' });

    expect(await authorize()).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('returns false and exchanges nothing when the redirect carries no code', async () => {
    // Success type but missing code: distinguishes `||` from `&&` and the
    // `!result.params.code` guard — an AND / dropped negation would proceed to exchange.
    stubPrompt({ type: 'success', params: {} });

    expect(await authorize()).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('exchanges the code for tokens and stores them on success', async () => {
    stubPrompt({ type: 'success', params: { code: 'auth-code' } });
    mockFetch.mockResolvedValue(
      tokenResponse(true, {
        access_token: 'new-token',
        refresh_token: 'refresh',
        expires_in: 3600,
      }),
    );

    const result = await authorize();

    expect(result).toBe(true);

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(TOKEN_URL);
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      'Content-Type': 'application/x-www-form-urlencoded',
    });
    // The authorization_code exchange body carries every PKCE field.
    const body = init.body as string;
    expect(body).toContain('grant_type=authorization_code');
    expect(body).toContain('code=auth-code');
    expect(body).toContain('redirect_uri=sift%3A%2F%2Fspotify-callback');
    expect(body).toContain(`client_id=${CLIENT_ID}`);
    expect(body).toContain('code_verifier=' + 'A'.repeat(86));

    expect(mockSetItem).toHaveBeenCalledWith(KEY_ACCESS, 'new-token');
    expect(mockSetItem).toHaveBeenCalledWith(KEY_REFRESH, 'refresh');
  });

  test('returns false and stores nothing when the token exchange fails', async () => {
    stubPrompt({ type: 'success', params: { code: 'auth-code' } });
    // Valid body again: proves the !ok guard, not an incidental crash, blocks storage.
    mockFetch.mockResolvedValue(
      tokenResponse(false, { access_token: 'x', expires_in: 3600 }, 400),
    );

    expect(await authorize()).toBe(false);
    expect(mockSetItem).not.toHaveBeenCalled();
  });

  test('returns false and reports to Sentry when the flow throws', async () => {
    MockAuthRequest.mockImplementation(() => ({
      promptAsync: jest.fn().mockRejectedValue(new Error('network error')),
    }));

    expect(await authorize()).toBe(false);
    expect(mockCaptureException).toHaveBeenCalledWith(expect.any(Error), {
      tags: { flow: 'spotify-authorize' },
    });
    expect(mockSetItem).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// logout
// ---------------------------------------------------------------------------

describe('logout', () => {
  test('deletes all three SecureStore token keys', async () => {
    await logout();

    expect(mockRemoveItem).toHaveBeenCalledWith(KEY_ACCESS);
    expect(mockRemoveItem).toHaveBeenCalledWith(KEY_REFRESH);
    expect(mockRemoveItem).toHaveBeenCalledWith(KEY_EXPIRATION);
    expect(mockRemoveItem).toHaveBeenCalledTimes(3);
  });
});
