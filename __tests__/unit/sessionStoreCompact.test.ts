import type * as SessionStoreModule from '../../src/services/SessionStore';
import type { SiftSession, Track } from '../../src/types';

jest.mock('@sentry/react-native', () => ({
  captureException: jest.fn(),
  addBreadcrumb: jest.fn(),
}));

// The store against async-storage's in-memory mock (#150).
let store: typeof SessionStoreModule;
// The store module afresh, as after an app relaunch, on the same storage
// (and the same mock functions, so calls can be checked).
const asyncStorageModule = jest.requireMock('@react-native-async-storage/async-storage');
const AsyncStorage = asyncStorageModule.default as {
  getItem: jest.Mock; setItem: jest.Mock; removeItem: jest.Mock; clear: jest.Mock;
};
const setItem = AsyncStorage.setItem;
const relaunch = () => {
  jest.isolateModules(() => {
    jest.doMock('@react-native-async-storage/async-storage', () => asyncStorageModule);
    store = require('../../src/services/SessionStore');
  });
};

const track = (i: number): Track => ({
  id: `t${i}`, name: `Track ${i}`, artist: `Artist ${i}`, album: `Album ${i}`, duration: 200 + i, playCount: i % 50,
  dateAdded: '2020-01-01T00:00:00.000Z', artworkURL: `https://example.com/artwork/${i}.jpg`,
});
const sessionOf = (tracks: Track[], cursor: number): SiftSession => ({
  tracks, cursor,
  kept: tracks.slice(0, cursor).filter((_, i) => i % 3 === 0),
  removed: tracks.slice(0, cursor).filter((_, i) => i % 3 === 1),
  skipped: tracks.slice(0, cursor).filter((_, i) => i % 3 === 2),
  sortOrder: 'least-played', savedAt: '2026-10-10T00:00:00.000Z', provider: 'apple-music', source: { type: 'library' },
  pendingKeeps: [], removalErrors: [], failedRemovalIds: [], siftedPlaylistId: null,
});
const keysWritten = () => setItem.mock.calls.map(([key]) => key as string);

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
  relaunch();
});

describe('SessionStore, compact format (#150)', () => {
  test('saves and loads a session', async () => {
    const tracks = Array.from({ length: 10 }, (_, i) => track(i));
    const session = sessionOf(tracks, 4);
    await store.saveSession(session);
    relaunch();
    await expect(store.loadSession()).resolves.toEqual(session);
  });

  test('migrates a legacy session: loads it, and drops it once the new one is written', async () => {
    const tracks = Array.from({ length: 5 }, (_, i) => track(i));
    const legacy = sessionOf(tracks, 2);
    await AsyncStorage.setItem('sift_session', JSON.stringify(legacy));
    const loaded = await store.loadSession();
    expect(loaded).toEqual(legacy);
    // Still there until a compact session has been written.
    await expect(AsyncStorage.getItem('sift_session')).resolves.not.toBeNull();
    await store.saveSession({ ...legacy, cursor: 3, skipped: [...legacy.skipped, tracks[2]] });
    await expect(AsyncStorage.getItem('sift_session')).resolves.toBeNull();
    await expect(store.loadSession()).resolves.toMatchObject({ cursor: 3 });
  });

  test('after a resume, a decision writes only the small record', async () => {
    const tracks = Array.from({ length: 5 }, (_, i) => track(i));
    await store.saveSession(sessionOf(tracks, 1));
    relaunch();
    const resumed = await store.loadSession();
    if (!resumed) throw new Error('no session');
    setItem.mockClear();
    await store.saveSession({ ...resumed, cursor: 2, removed: [...resumed.removed, tracks[1]] });
    expect(keysWritten()).toEqual(['sift_session_v2']);
  });

  test('loading again (Setup does on every visit) keeps the stored list, so the next save writes only the record', async () => {
    const tracks = Array.from({ length: 5 }, (_, i) => track(i));
    await store.saveSession(sessionOf(tracks, 1));
    const loaded = await store.loadSession();
    if (!loaded) throw new Error('no session');
    expect(loaded.tracks).toBe(tracks);
    setItem.mockClear();
    await store.saveSession({ ...loaded, cursor: 2, removed: [...loaded.removed, tracks[1]] });
    expect(keysWritten()).toEqual(['sift_session_v2']);
  });

  test('a load waits for a save in progress', async () => {
    const tracks = Array.from({ length: 4 }, (_, i) => track(i));
    const saving = store.saveSession(sessionOf(tracks, 2));
    const loading = store.loadSession();
    await saving;
    await expect(loading).resolves.toMatchObject({ cursor: 2 });
  });

  test('a crash between writing a re-sorted list and its record keeps the last session', async () => {
    const tracks = Array.from({ length: 6 }, (_, i) => track(i));
    const before = sessionOf(tracks, 2);
    await store.saveSession(before);
    // Re-sorting the rest writes a new list, in the other slot; the record
    // that would point at it never lands.
    const resorted = { ...before, tracks: [...tracks.slice(0, 2), ...tracks.slice(2).reverse()] };
    setItem.mockImplementationOnce(async (key: string, value: string) => AsyncStorage.setItem(key, value));
    setItem.mockRejectedValueOnce(new Error('killed'));
    await store.saveSession(resorted);
    relaunch();
    await expect(store.loadSession()).resolves.toEqual(before);
  });

  test("a record that doesn't match its list is set aside", async () => {
    const tracks = Array.from({ length: 3 }, (_, i) => track(i));
    await store.saveSession(sessionOf(tracks, 1));
    const record = JSON.parse((await AsyncStorage.getItem('sift_session_v2')) ?? 'null');
    await AsyncStorage.setItem('sift_session_v2', JSON.stringify({ ...record, keptIds: ['missing'] }));
    await expect(store.loadSession()).resolves.toBeNull();
    await expect(AsyncStorage.getItem('sift_session_v2')).resolves.toBeNull();
    await expect(AsyncStorage.getItem('sift_session.invalid')).resolves.not.toBeNull();
  });

  test('a save still writing when the session is cleared does not bring it back', async () => {
    const tracks = Array.from({ length: 3 }, (_, i) => track(i));
    const saving = store.saveSession(sessionOf(tracks, 1));
    const clearing = store.clearSession();
    await Promise.all([saving, clearing]);
    await expect(store.loadSession()).resolves.toBeNull();
    await expect(store.hasSession()).resolves.toBe(false);
  });

  test('per-decision writes shrink by over 95% at 5,000 tracks', async () => {
    const tracks = Array.from({ length: 5000 }, (_, i) => track(i));
    const session = sessionOf(tracks, 2500);
    const legacyBytes = JSON.stringify(session).length;
    await store.saveSession(session);
    setItem.mockClear();
    await store.saveSession({ ...session, cursor: 2501, skipped: [...session.skipped, tracks[2500]] });
    const [[, written]] = setItem.mock.calls;
    expect(written.length / legacyBytes).toBeLessThan(0.05);
  });

  test('a new list alternates slots, each with its own version', async () => {
    const lists = [0, 1, 2].map((n) => Array.from({ length: 3 }, (_, i) => track(n * 10 + i)));
    const written: string[] = [];
    for (const list of lists) {
      setItem.mockClear();
      await store.saveSession(sessionOf(list, 0));
      written.push(keysWritten()[0]);
    }
    expect(written).toEqual(['sift_session_v2_tracks_a', 'sift_session_v2_tracks_b', 'sift_session_v2_tracks_a']);
    const versionOf = async (slot: string) =>
      JSON.parse((await AsyncStorage.getItem(`sift_session_v2_tracks_${slot}`)) ?? '{}').version as string;
    const [a, b] = [await versionOf('a'), await versionOf('b')];
    expect(a).toEqual(expect.any(String));
    expect(a).not.toBe('');
    expect(a).not.toBe(b);
  });

  test.each([
    ['its track list is missing', async () => {
      await AsyncStorage.removeItem('sift_session_v2_tracks_a');
    }],
    ['it names no slot', async () => {
      const record = JSON.parse((await AsyncStorage.getItem('sift_session_v2')) ?? 'null');
      await AsyncStorage.setItem('sift_session_v2', JSON.stringify({ ...record, tracksSlot: 'c' }));
    }],
    ['it has the wrong shape', async () => {
      const record = JSON.parse((await AsyncStorage.getItem('sift_session_v2')) ?? 'null');
      await AsyncStorage.setItem('sift_session_v2', JSON.stringify({ ...record, v: 1 }));
    }],
    ['its list is malformed', async () => {
      await AsyncStorage.setItem('sift_session_v2_tracks_a', JSON.stringify({ version: 'x', tracks: [{ id: 1 }] }));
    }],
  ])('a record is set aside, reported, when %s', async (_case, corrupt) => {
    const Sentry = jest.requireMock('@sentry/react-native');
    const tracks = Array.from({ length: 3 }, (_, i) => track(i));
    await store.saveSession(sessionOf(tracks, 1));
    await corrupt();
    relaunch();
    await expect(store.loadSession()).resolves.toBeNull();
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error), { tags: { flow: 'session-load' } });
    const setAside = JSON.parse((await AsyncStorage.getItem('sift_session.invalid')) ?? 'null');
    // Both raw values, kept for recovery (the list is null when it was missing).
    expect(Object.keys(setAside).sort()).toEqual(['state', 'tracks']);
    expect(JSON.parse(setAside.state).cursor).toBe(1);
    await expect(AsyncStorage.getItem('sift_session_v2')).resolves.toBeNull();
  });

  test('a record set aside falls back to a legacy session still on disk', async () => {
    const tracks = Array.from({ length: 3 }, (_, i) => track(i));
    const legacy = sessionOf(tracks, 2);
    await AsyncStorage.setItem('sift_session', JSON.stringify(legacy));
    await AsyncStorage.setItem('sift_session_v2', JSON.stringify({ v: 2, tracksSlot: 'a' }));
    await expect(store.loadSession()).resolves.toEqual(legacy);
  });

  test('a failed read reports and leaves everything in place', async () => {
    const Sentry = jest.requireMock('@sentry/react-native');
    const tracks = Array.from({ length: 3 }, (_, i) => track(i));
    await store.saveSession(sessionOf(tracks, 1));
    AsyncStorage.getItem.mockRejectedValueOnce(new Error('disk'));
    await expect(store.loadSession()).resolves.toBeNull();
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error), { tags: { flow: 'session-load' } });
    await expect(AsyncStorage.getItem('sift_session_v2')).resolves.not.toBeNull();
  });

  test('with no legacy session found, saves stop trying to remove one', async () => {
    await expect(store.loadSession()).resolves.toBeNull();
    const removeItem = AsyncStorage.removeItem;
    removeItem.mockClear();
    await store.saveSession(sessionOf([track(1)], 0));
    expect(removeItem).not.toHaveBeenCalledWith('sift_session');
  });
});
