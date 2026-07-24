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
  it('reports the caught error to Sentry with the session-save flow tag', async () => {
    const Sentry = jest.requireMock('@sentry/react-native');
    const error = new Error('write error');
    mockSetItem.mockRejectedValue(error);

    await saveSession(sampleSession);

    // Pins both the reported error and the exact tag payload so mutations that
    // blank the flow string or empty the tags object are caught.
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(Sentry.captureException).toHaveBeenCalledWith(error, {
      tags: { flow: 'session-save' },
    });
  });
});

describe('loadSession error handling', () => {
  it('reports parse failures to Sentry with the session-load flow tag', async () => {
    const Sentry = jest.requireMock('@sentry/react-native');
    mockGetItem.mockResolvedValue('not valid json {{{');

    const result = await loadSession();

    expect(result).toBeNull();
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error), {
      tags: { flow: 'session-load' },
    });
  });
});

describe('clearSession error handling', () => {
  it('records a warning breadcrumb describing the clear failure', async () => {
    const Sentry = jest.requireMock('@sentry/react-native');
    mockRemoveItem.mockRejectedValue(new Error('remove error'));

    await clearSession();

    // Pins the breadcrumb category, level, and message text so mutations that
    // empty the breadcrumb object, blank the level, or blank the message survive no more.
    expect(Sentry.addBreadcrumb).toHaveBeenCalledTimes(1);
    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'session',
        level: 'warning',
        message: expect.stringContaining('Clear session failed'),
      }),
    );
  });
});

describe('hasSession error handling', () => {
  it('records a warning breadcrumb describing the check failure', async () => {
    const Sentry = jest.requireMock('@sentry/react-native');
    mockGetItem.mockRejectedValue(new Error('storage error'));

    const result = await hasSession();

    expect(result).toBe(false);
    expect(Sentry.addBreadcrumb).toHaveBeenCalledTimes(1);
    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'session',
        level: 'warning',
        message: expect.stringContaining('Check session failed'),
      }),
    );
  });
});
