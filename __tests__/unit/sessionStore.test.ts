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

describe('loadSession with a session saved by a different build', () => {
  const Sentry = jest.requireMock('@sentry/react-native');

  beforeEach(() => {
    // An earlier suite leaves setItem rejecting; these tests need it to work.
    mockSetItem.mockResolvedValue(undefined);
  });

  it.each([
    ['tracks', { ...sampleSession, tracks: undefined }],
    ['kept', { ...sampleSession, kept: undefined }],
    ['removed', { ...sampleSession, removed: undefined }],
    ['skipped', { ...sampleSession, skipped: undefined }],
    ['cursor', { ...sampleSession, cursor: undefined }],
    ['sortOrder', { ...sampleSession, sortOrder: undefined }],
  ])('treats a session missing %s as no session, reports it and sets it aside', async (_field, stored) => {
    mockGetItem.mockResolvedValue(JSON.stringify(stored));
    mockRemoveItem.mockResolvedValue(undefined);

    const result = await loadSession();

    expect(result).toBeNull();
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error), {
      tags: { flow: 'session-load' },
    });
    // Moved aside, never destroyed: the raw JSON is kept under another key
    // before the live key is cleared, so a validator bug is recoverable.
    expect(mockSetItem).toHaveBeenCalledWith('sift_session.invalid', JSON.stringify(stored));
    expect(mockSetItem.mock.invocationCallOrder[0]).toBeLessThan(mockRemoveItem.mock.invocationCallOrder[0]);
    expect(mockRemoveItem).toHaveBeenCalledWith('sift_session');
  });

  it('rejects a session whose tracks are malformed', async () => {
    mockGetItem.mockResolvedValue(JSON.stringify({ ...sampleSession, tracks: [{ id: '1' }] }));

    expect(await loadSession()).toBeNull();
    expect(mockRemoveItem).toHaveBeenCalledWith('sift_session');
  });

  it('rejects a stored value that is valid JSON but not an object', async () => {
    mockGetItem.mockResolvedValue('null');

    expect(await loadSession()).toBeNull();
    expect(mockRemoveItem).toHaveBeenCalledWith('sift_session');
  });

  it('sets unparseable JSON aside so it is not offered again', async () => {
    mockGetItem.mockResolvedValue('not valid json {{{');

    expect(await loadSession()).toBeNull();
    expect(mockSetItem).toHaveBeenCalledWith('sift_session.invalid', 'not valid json {{{');
    expect(mockRemoveItem).toHaveBeenCalledWith('sift_session');
  });

  it('leaves an invalid session in place when it cannot be set aside', async () => {
    mockGetItem.mockResolvedValue(JSON.stringify({ ...sampleSession, tracks: undefined }));
    mockSetItem.mockRejectedValue(new Error('storage full'));

    expect(await loadSession()).toBeNull();
    expect(mockRemoveItem).not.toHaveBeenCalled();
    // One event for the invalid session, carrying the failure as a breadcrumb.
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'session', message: expect.stringContaining('left in place') }),
    );
  });

  it('resumes a legacy Spotify session with its local files (null ids) removed', async () => {
    // Builds before local files were skipped saved them with id null.
    const local = (n: number) => ({ ...sampleSession.tracks[0], id: null, name: `Local ${n}` });
    const t = (id: string) => ({ ...sampleSession.tracks[0], id });
    const legacy = {
      ...sampleSession,
      provider: 'spotify',
      // Decided: a, local1, b, local2 (cursor 4); next up: c, local3, d.
      tracks: [t('a'), local(1), t('b'), local(2), t('c'), local(3), t('d')],
      cursor: 4,
      kept: [t('a'), local(1)],
      removed: [t('b')],
      skipped: [local(2)],
      pendingKeeps: [local(1)],
    };
    mockGetItem.mockResolvedValue(JSON.stringify(legacy));

    const result = await loadSession();

    expect(result).toEqual({
      ...legacy,
      tracks: [t('a'), t('b'), t('c'), t('d')],
      // Two id-less tracks sat before the cursor, so it still points at c.
      cursor: 2,
      kept: [t('a')],
      removed: [t('b')],
      skipped: [],
      pendingKeeps: [],
    });
    expect(result?.tracks[result.cursor].id).toBe('c');
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(mockRemoveItem).not.toHaveBeenCalled();
  });

  it('keeps the stored session when the read itself fails', async () => {
    // A storage error says nothing about the session's validity.
    mockGetItem.mockRejectedValue(new Error('storage error'));

    expect(await loadSession()).toBeNull();
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error), {
      tags: { flow: 'session-load' },
    });
    expect(mockRemoveItem).not.toHaveBeenCalled();
  });

  it('returns a valid session untouched, without reporting or clearing', async () => {
    const full: SiftSession = {
      ...sampleSession,
      cursor: 1,
      source: { type: 'playlist', playlist: { id: 'p1', name: 'Mix', trackCount: 1 } },
      pendingKeeps: [],
      removalErrors: [],
      siftedPlaylistId: null,
    };
    mockGetItem.mockResolvedValue(JSON.stringify(full));

    expect(await loadSession()).toEqual(full);
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(mockRemoveItem).not.toHaveBeenCalled();
  });
});
