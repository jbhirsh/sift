import type * as SessionStoreModule from '../../src/services/SessionStore';
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

// The store keeps module state (the track list it last wrote, whether a
// legacy session may remain), so each test gets a fresh copy of the module
// and of its mocks.
let saveSession: typeof SessionStoreModule.saveSession;
let loadSession: typeof SessionStoreModule.loadSession;
let clearSession: typeof SessionStoreModule.clearSession;
let hasSession: typeof SessionStoreModule.hasSession;
let mockGetItem: jest.Mock;
let mockSetItem: jest.Mock;
let mockRemoveItem: jest.Mock;
let Sentry: { captureException: jest.Mock; addBreadcrumb: jest.Mock };

/** A session saved by a build before the compact format (#150). */
const storeLegacy = (json: string | null) =>
  mockGetItem.mockImplementation(async (key: string) => (key === 'sift_session' ? json : null));

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
  jest.resetModules();
  const AsyncStorage = require('@react-native-async-storage/async-storage');
  mockGetItem = AsyncStorage.getItem;
  mockSetItem = AsyncStorage.setItem;
  mockRemoveItem = AsyncStorage.removeItem;
  Sentry = require('@sentry/react-native');
  ({ saveSession, loadSession, clearSession, hasSession } = require('../../src/services/SessionStore'));
});

describe('saveSession', () => {
  it('stores the track list once and a compact record of ids, then drops the legacy key (#150)', async () => {
    mockSetItem.mockResolvedValue(undefined);
    mockRemoveItem.mockResolvedValue(undefined);

    await saveSession(sampleSession);

    expect(mockSetItem).toHaveBeenCalledTimes(2);
    const [tracksKey, tracksJson] = mockSetItem.mock.calls[0];
    const [stateKey, stateJson] = mockSetItem.mock.calls[1];
    expect(tracksKey).toBe('sift_session_v2_tracks_a');
    expect(JSON.parse(tracksJson).tracks).toEqual(sampleSession.tracks);
    expect(stateKey).toBe('sift_session_v2');
    expect(JSON.parse(stateJson)).toMatchObject({ v: 2, tracksSlot: 'a', cursor: 0, keptIds: [], sortOrder: 'least-played' });
    expect(stateJson).not.toContain('Test Song');
    // Only after the new record is down.
    expect(mockRemoveItem).toHaveBeenCalledWith('sift_session');
    expect(mockSetItem.mock.invocationCallOrder[1]).toBeLessThan(mockRemoveItem.mock.invocationCallOrder[0]);

    // The next decision writes only the record.
    mockSetItem.mockClear();
    mockRemoveItem.mockClear();
    await saveSession({ ...sampleSession, cursor: 1, skipped: sampleSession.tracks });
    expect(mockSetItem).toHaveBeenCalledTimes(1);
    expect(mockSetItem.mock.calls[0][0]).toBe('sift_session_v2');
    expect(mockRemoveItem).not.toHaveBeenCalled();
  });

  it('keeps the legacy session when the new record fails to write', async () => {
    mockSetItem.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('disk full'));
    await saveSession(sampleSession);
    expect(mockRemoveItem).not.toHaveBeenCalled();
  });
});

describe('loadSession', () => {
  it('returns parsed session', async () => {
    storeLegacy(JSON.stringify(sampleSession));

    const result = await loadSession();

    expect(result).toEqual(sampleSession);
  });

  it('returns null when no session', async () => {
    storeLegacy(null);

    const result = await loadSession();

    expect(result).toBeNull();
  });

  it('returns null on invalid JSON', async () => {
    storeLegacy('not valid json {{{');

    const result = await loadSession();

    expect(result).toBeNull();
  });
});

describe('clearSession', () => {
  it('removes the compact record, both track lists and any legacy session', async () => {
    mockRemoveItem.mockResolvedValue(undefined);

    await clearSession();

    expect(mockRemoveItem.mock.calls.map(([key]) => key)).toEqual([
      'sift_session_v2', 'sift_session_v2_tracks_a', 'sift_session_v2_tracks_b', 'sift_session',
    ]);
  });
});

describe('hasSession', () => {
  it('returns true when session exists', async () => {
    storeLegacy(JSON.stringify(sampleSession));

    const result = await hasSession();

    expect(result).toBe(true);
  });

  it('returns false when no session', async () => {
    storeLegacy(null);

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
    storeLegacy('not valid json {{{');

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
    storeLegacy(JSON.stringify(stored));
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
    storeLegacy(JSON.stringify({ ...sampleSession, tracks: [{ id: '1' }] }));

    expect(await loadSession()).toBeNull();
    expect(mockRemoveItem).toHaveBeenCalledWith('sift_session');
  });

  it('rejects a stored value that is valid JSON but not an object', async () => {
    storeLegacy('null');

    expect(await loadSession()).toBeNull();
    expect(mockRemoveItem).toHaveBeenCalledWith('sift_session');
  });

  it('sets unparseable JSON aside so it is not offered again', async () => {
    storeLegacy('not valid json {{{');

    expect(await loadSession()).toBeNull();
    expect(mockSetItem).toHaveBeenCalledWith('sift_session.invalid', 'not valid json {{{');
    expect(mockRemoveItem).toHaveBeenCalledWith('sift_session');
  });

  it('leaves an invalid session in place when it cannot be set aside', async () => {
    storeLegacy(JSON.stringify({ ...sampleSession, tracks: undefined }));
    mockSetItem.mockRejectedValue(new Error('storage full'));

    expect(await loadSession()).toBeNull();
    expect(mockRemoveItem).not.toHaveBeenCalled();
    // One event for the invalid session, carrying the failure as a breadcrumb.
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'session', message: expect.stringContaining('left in place') }),
    );
  });

  it('resumes a legacy session with its id-less tracks removed', async () => {
    // Builds before local files were skipped saved them with id null (they
    // came from Spotify, since removed: a Spotify session itself is now set
    // aside, see validators).
    const local = (n: number) => ({ ...sampleSession.tracks[0], id: null, name: `Local ${n}` });
    const t = (id: string) => ({ ...sampleSession.tracks[0], id });
    const legacy = {
      ...sampleSession,
      // Decided: a, local1, b, local2 (cursor 4); next up: c, local3, d.
      tracks: [t('a'), local(1), t('b'), local(2), t('c'), local(3), t('d')],
      cursor: 4,
      kept: [t('a'), local(1)],
      removed: [t('b')],
      skipped: [local(2)],
      pendingKeeps: [local(1)],
    };
    storeLegacy(JSON.stringify(legacy));

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
    storeLegacy(JSON.stringify(full));

    expect(await loadSession()).toEqual(full);
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(mockRemoveItem).not.toHaveBeenCalled();
  });
});
