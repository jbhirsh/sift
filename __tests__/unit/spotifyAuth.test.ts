import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthRequest } from 'expo-auth-session';
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

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  multiGet: jest.fn(),
  multiSet: jest.fn(),
  multiRemove: jest.fn(),
}));

jest.mock('expo-crypto', () => ({
  getRandomBytes: jest.fn(() => new Uint8Array(64)),
  digestStringAsync: jest.fn(() => Promise.resolve('mocked-digest-base64==')),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { BASE64: 'base64' },
}));

jest.mock('expo-auth-session', () => ({
  makeRedirectUri: jest.fn(() => 'sift-music://spotify-callback'),
  AuthRequest: jest.fn(),
  CodeChallengeMethod: { S256: 'S256' },
  ResponseType: { Code: 'code' },
}));

jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Typed mock references
// ---------------------------------------------------------------------------

const mockGetItem = AsyncStorage.getItem as jest.MockedFunction<
  typeof AsyncStorage.getItem
>;
const mockSetItem = AsyncStorage.setItem as jest.MockedFunction<
  typeof AsyncStorage.setItem
>;
const mockRemoveItem = AsyncStorage.removeItem as jest.MockedFunction<
  typeof AsyncStorage.removeItem
>;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
});

describe('isAuthenticated', () => {
  test('returns false when no token stored', async () => {
    mockGetItem.mockResolvedValueOnce(null); // access token
    mockGetItem.mockResolvedValueOnce(null); // expiration

    const result = await isAuthenticated();

    expect(result).toBe(false);
  });

  test('returns false when token is expired', async () => {
    const pastExpiration = String(Date.now() - 60_000); // 1 minute ago

    mockGetItem.mockResolvedValueOnce('some-token');     // access token
    mockGetItem.mockResolvedValueOnce(pastExpiration);   // expiration

    const result = await isAuthenticated();

    expect(result).toBe(false);
  });

  test('returns true when token is valid', async () => {
    const futureExpiration = String(Date.now() + 3600_000); // 1 hour from now

    mockGetItem.mockResolvedValueOnce('valid-token');       // access token
    mockGetItem.mockResolvedValueOnce(futureExpiration);    // expiration

    const result = await isAuthenticated();

    expect(result).toBe(true);
  });
});

describe('getAccessToken', () => {
  test('returns stored token', async () => {
    mockGetItem.mockResolvedValueOnce('my-access-token');

    const token = await getAccessToken();

    expect(token).toBe('my-access-token');
  });

  test('returns null when no token', async () => {
    mockGetItem.mockResolvedValueOnce(null);

    const token = await getAccessToken();

    expect(token).toBeNull();
  });
});

describe('logout', () => {
  test('clears all stored tokens', async () => {
    mockRemoveItem.mockResolvedValue(undefined);

    await logout();

    expect(mockRemoveItem).toHaveBeenCalledTimes(3);
    expect(mockRemoveItem).toHaveBeenCalledWith('spotify_access_token');
    expect(mockRemoveItem).toHaveBeenCalledWith('spotify_refresh_token');
    expect(mockRemoveItem).toHaveBeenCalledWith('spotify_token_expiration');
  });
});

describe('generateCodeVerifier', () => {
  test('returns a base64url encoded string', () => {
    const verifier = generateCodeVerifier();
    expect(typeof verifier).toBe('string');
    expect(verifier.length).toBeGreaterThan(0);
    // Should not contain +, /, or = (base64url)
    expect(verifier).not.toMatch(/[+/=]/);
  });
});

describe('generateCodeChallenge', () => {
  test('returns a base64url encoded challenge', async () => {
    const challenge = await generateCodeChallenge('test-verifier');
    expect(typeof challenge).toBe('string');
    // Should not contain +, /, or = (base64url)
    expect(challenge).not.toMatch(/[+/=]/);
  });
});

describe('refreshTokenIfNeeded', () => {
  test('does nothing when no token stored', async () => {
    mockGetItem.mockResolvedValueOnce(null); // access token
    mockGetItem.mockResolvedValueOnce(null); // expiration
    mockGetItem.mockResolvedValueOnce(null); // refresh token

    await refreshTokenIfNeeded();
    // Should not throw or make any fetch calls
  });

  test('does nothing when no refresh token', async () => {
    mockGetItem.mockResolvedValueOnce('token');
    mockGetItem.mockResolvedValueOnce(String(Date.now() - 1000)); // expired
    mockGetItem.mockResolvedValueOnce(null); // no refresh token

    await refreshTokenIfNeeded();
  });

  test('skips refresh when token still valid', async () => {
    const farFuture = String(Date.now() + 120_000); // 2 minutes
    mockGetItem.mockResolvedValueOnce('token');
    mockGetItem.mockResolvedValueOnce(farFuture);
    mockGetItem.mockResolvedValueOnce('refresh-token');

    await refreshTokenIfNeeded();
    // Should not make any fetch calls since token is valid
  });

  test('refreshes token when expired', async () => {
    const pastExpiration = String(Date.now() - 1000);
    mockGetItem.mockResolvedValueOnce('old-token');
    mockGetItem.mockResolvedValueOnce(pastExpiration);
    mockGetItem.mockResolvedValueOnce('refresh-token');

    const mockResponse = {
      ok: true,
      json: jest.fn().mockResolvedValue({
        access_token: 'new-token',
        refresh_token: 'new-refresh',
        expires_in: 3600,
      }),
    };
    global.fetch = jest.fn().mockResolvedValue(mockResponse);

    await refreshTokenIfNeeded();

    expect(global.fetch).toHaveBeenCalled();
    expect(mockSetItem).toHaveBeenCalledWith('spotify_access_token', 'new-token');
    expect(mockSetItem).toHaveBeenCalledWith('spotify_refresh_token', 'new-refresh');
  });

  test('logs out when refresh fails', async () => {
    const pastExpiration = String(Date.now() - 1000);
    mockGetItem.mockResolvedValueOnce('old-token');
    mockGetItem.mockResolvedValueOnce(pastExpiration);
    mockGetItem.mockResolvedValueOnce('refresh-token');

    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401 });

    await refreshTokenIfNeeded();

    expect(mockRemoveItem).toHaveBeenCalled();
  });
});

describe('authorize', () => {
  const MockAuthRequest = jest.mocked(AuthRequest);

  test('returns false when user cancels', async () => {
    MockAuthRequest.mockImplementation(() => ({
      promptAsync: jest.fn().mockResolvedValue({ type: 'cancel' }),
    }));

    const result = await authorize();
    expect(result).toBe(false);
  });

  test('returns true on successful authorization', async () => {
    MockAuthRequest.mockImplementation(() => ({
      promptAsync: jest.fn().mockResolvedValue({
        type: 'success',
        params: { code: 'auth-code' },
      }),
    }));

    const mockResponse = {
      ok: true,
      json: jest.fn().mockResolvedValue({
        access_token: 'new-token',
        refresh_token: 'refresh',
        expires_in: 3600,
      }),
    };
    global.fetch = jest.fn().mockResolvedValue(mockResponse);

    const result = await authorize();
    expect(result).toBe(true);
    expect(mockSetItem).toHaveBeenCalledWith('spotify_access_token', 'new-token');
  });

  test('returns false when token exchange fails', async () => {
    MockAuthRequest.mockImplementation(() => ({
      promptAsync: jest.fn().mockResolvedValue({
        type: 'success',
        params: { code: 'auth-code' },
      }),
    }));

    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 400 });

    const result = await authorize();
    expect(result).toBe(false);
  });

  test('returns false on exception', async () => {
    MockAuthRequest.mockImplementation(() => ({
      promptAsync: jest.fn().mockRejectedValue(new Error('network error')),
    }));

    const result = await authorize();
    expect(result).toBe(false);
  });
});
