import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  isAuthenticated,
  getAccessToken,
  logout,
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
