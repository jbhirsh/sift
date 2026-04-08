import AsyncStorage from '@react-native-async-storage/async-storage';
import { saveSession, loadSession, clearSession, hasSession } from '../../src/services/SessionStore';
import { SiftSession } from '../../src/types';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

jest.mock('@sentry/react-native', () => ({
  captureException: jest.fn(),
  addBreadcrumb: jest.fn(),
}));

const mockGetItem = AsyncStorage.getItem as jest.Mock;
const mockSetItem = AsyncStorage.setItem as jest.Mock;
const mockRemoveItem = AsyncStorage.removeItem as jest.Mock;

const sampleSession: SiftSession = {
  tracks: [
    {
      id: '1',
      name: 'Test Song',
      artist: 'Test Artist',
      album: 'Test Album',
      duration: 210,
      playCount: 5,
      dateAdded: '2025-01-15T00:00:00Z',
    },
  ],
  cursor: 0,
  kept: [],
  removed: [],
  skipped: [],
  sortOrder: 'least-played',
  savedAt: '2026-04-03T12:00:00Z',
  provider: 'apple-music',
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('saveSession', () => {
  it('stores session as JSON', async () => {
    mockSetItem.mockResolvedValue(undefined);

    await saveSession(sampleSession);

    expect(mockSetItem).toHaveBeenCalledTimes(1);
    expect(mockSetItem).toHaveBeenCalledWith('sift_session', JSON.stringify(sampleSession));
  });
});

describe('loadSession', () => {
  it('returns parsed session', async () => {
    mockGetItem.mockResolvedValue(JSON.stringify(sampleSession));

    const result = await loadSession();

    expect(result).toEqual(sampleSession);
  });

  it('returns null when no session', async () => {
    mockGetItem.mockResolvedValue(null);

    const result = await loadSession();

    expect(result).toBeNull();
  });

  it('returns null on invalid JSON', async () => {
    mockGetItem.mockResolvedValue('not valid json {{{');

    const result = await loadSession();

    expect(result).toBeNull();
  });
});

describe('clearSession', () => {
  it('removes the key', async () => {
    mockRemoveItem.mockResolvedValue(undefined);

    await clearSession();

    expect(mockRemoveItem).toHaveBeenCalledTimes(1);
    expect(mockRemoveItem).toHaveBeenCalledWith('sift_session');
  });
});

describe('hasSession', () => {
  it('returns true when session exists', async () => {
    mockGetItem.mockResolvedValue(JSON.stringify(sampleSession));

    const result = await hasSession();

    expect(result).toBe(true);
  });

  it('returns false when no session', async () => {
    mockGetItem.mockResolvedValue(null);

    const result = await hasSession();

    expect(result).toBe(false);
  });

  it('returns false when getItem throws', async () => {
    mockGetItem.mockRejectedValue(new Error('storage error'));

    const result = await hasSession();

    expect(result).toBe(false);
  });
});

describe('saveSession error handling', () => {
  it('catches and reports error to Sentry', async () => {
    const Sentry = jest.requireMock('@sentry/react-native');
    mockSetItem.mockRejectedValue(new Error('write error'));

    await saveSession(sampleSession);

    expect(Sentry.captureException).toHaveBeenCalled();
  });
});

describe('clearSession error handling', () => {
  it('catches error and adds Sentry breadcrumb', async () => {
    const Sentry = jest.requireMock('@sentry/react-native');
    mockRemoveItem.mockRejectedValue(new Error('remove error'));

    await clearSession();

    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'session' }),
    );
  });
});
