import type * as SiftedImportModule from '../../src/services/SiftedImport';
import type * as LedgerModule from '../../src/services/ReviewedLedgerStore';
import type * as PlaylistLoadsModule from '../../src/services/playlistLoads';
import type { MusicProviderService } from '../../src/services/MusicProviderInterface';
import type { SiftSource, Track } from '../../src/types';

const track = (id: string, name: string, duration = 200): Track => ({
  id,
  name,
  artist: 'Artist',
  album: 'Album',
  duration,
  playCount: 0,
  dateAdded: '2020-01-01T00:00:00.000Z',
});

const peaches = track('a', 'Peaches');
const stay = track('b', 'Stay');
const intro = track('c', 'Intro');
const ROAD_TRIP: SiftSource = {
  type: 'playlist',
  playlist: { id: 'p1', name: 'Road Trip', trackCount: 3 },
};
const KEY = 'apple-music:playlist:p1';

/** A service whose playlists are `lists` (id → name and songs). */
function service(
  lists: Record<string, { name: string; tracks: Track[] }>,
  overrides: Partial<MusicProviderService> = {},
) {
  return {
    isAuthorized: jest.fn(async () => true),
    findPlaylists: jest.fn(async (name: string) =>
      Object.entries(lists)
        .filter(([, list]) => list.name === name)
        .map(([id]) => id),
    ),
    loadPlaylistTracks: jest.fn(async (id: string) => lists[id]?.tracks ?? []),
    ...overrides,
  } as unknown as MusicProviderService & {
    isAuthorized: jest.Mock;
    findPlaylists: jest.Mock;
    loadPlaylistTracks: jest.Mock;
  };
}

const roadTrip = { name: 'Road Trip', tracks: [peaches, stay, intro] };

// Both modules afresh for each test, as on a new launch (they remember
// keeps taken back and looks under way), on the same storage.
const asyncStorageModule = jest.requireMock('@react-native-async-storage/async-storage');
const AsyncStorage = asyncStorageModule.default as {
  getItem: jest.Mock;
  setItem: jest.Mock;
  clear: jest.Mock;
};
const Sentry = jest.requireMock('@sentry/react-native') as { captureException: jest.Mock };
let importSiftedKeeps: typeof SiftedImportModule.importSiftedKeeps;
let rememberSiftedPlaylist: typeof SiftedImportModule.rememberSiftedPlaylist;
let loadPlaylistTracksOnce: typeof PlaylistLoadsModule.loadPlaylistTracksOnce;
let loadReviewedIds: typeof LedgerModule.loadReviewedIds;
let markReviewed: typeof LedgerModule.markReviewed;
let unmarkReviewed: typeof LedgerModule.unmarkReviewed;

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  jest.isolateModules(() => {
    jest.doMock('@react-native-async-storage/async-storage', () => asyncStorageModule);
    jest.doMock('@sentry/react-native', () => Sentry);
    const ledger: typeof LedgerModule = require('../../src/services/ReviewedLedgerStore');
    ({ loadReviewedIds, markReviewed, unmarkReviewed } = ledger);
    ({ importSiftedKeeps, rememberSiftedPlaylist } =
      require('../../src/services/SiftedImport') as typeof SiftedImportModule);
    ({ loadPlaylistTracksOnce } =
      require('../../src/services/playlistLoads') as typeof PlaylistLoadsModule);
  });
});

describe('importSiftedKeeps', () => {
  test('remembers the playlist songs found in its "- Sifted", by song, under the playlist\'s own ids', async () => {
    // "- Sifted" files each song under a new id, and can hold songs since
    // taken out of the playlist (Levitating): only the playlist's own count.
    const music = service({
      p1: roadTrip,
      s1: {
        name: 'Road Trip - Sifted',
        tracks: [{ ...peaches, id: 'i.1' }, { ...intro, id: 'i.3' }, track('i.9', 'Levitating')],
      },
    });
    await importSiftedKeeps(music, 'apple-music', ROAD_TRIP);
    await expect(loadReviewedIds(KEY)).resolves.toEqual(new Set(['a', 'c']));
    expect(music.findPlaylists).toHaveBeenCalledWith('Road Trip - Sifted');
  });

  test('a song with the same name and artist but another length is another song', async () => {
    const music = service({
      p1: roadTrip,
      s1: { name: 'Road Trip - Sifted', tracks: [{ ...stay, id: 'i.2', duration: 320 }] },
    });
    await importSiftedKeeps(music, 'apple-music', ROAD_TRIP);
    await expect(loadReviewedIds(KEY)).resolves.toEqual(new Set());
  });

  test('every playlist of that name counts', async () => {
    const music = service({
      p1: roadTrip,
      s1: { name: 'Road Trip - Sifted', tracks: [{ ...peaches, id: 'i.1' }] },
      s2: { name: 'Road Trip - Sifted', tracks: [{ ...stay, id: 'i.2' }] },
    });
    await importSiftedKeeps(music, 'apple-music', ROAD_TRIP);
    await expect(loadReviewedIds(KEY)).resolves.toEqual(new Set(['a', 'b']));
  });

  test('uses the songs the caller just loaded instead of loading the playlist again', async () => {
    const music = service({ s1: { name: 'Road Trip - Sifted', tracks: [{ ...stay, id: 'i.2' }] } });
    await importSiftedKeeps(music, 'apple-music', ROAD_TRIP, [peaches, stay]);
    expect(music.loadPlaylistTracks.mock.calls).toEqual([['s1']]);
    await expect(loadReviewedIds(KEY)).resolves.toEqual(new Set(['b']));
  });

  test('looks once per playlist, ever: the next call reads only the flag', async () => {
    const music = service({
      p1: roadTrip,
      s1: { name: 'Road Trip - Sifted', tracks: [{ ...peaches, id: 'i.1' }] },
    });
    await importSiftedKeeps(music, 'apple-music', ROAD_TRIP);
    // A keep taken back since stays taken back.
    await unmarkReviewed(KEY, 'a');
    await importSiftedKeeps(music, 'apple-music', ROAD_TRIP);
    expect(music.findPlaylists).toHaveBeenCalledTimes(1);
    await expect(loadReviewedIds(KEY)).resolves.toEqual(new Set());
    // Another playlist is looked at on its own.
    await importSiftedKeeps(music, 'apple-music', {
      type: 'playlist',
      playlist: { id: 'p2', name: 'Chill', trackCount: 0 },
    });
    expect(music.findPlaylists).toHaveBeenLastCalledWith('Chill - Sifted');
    expect(JSON.parse((await AsyncStorage.getItem('sift_sifted_imported')) ?? 'null')).toEqual([
      KEY,
      'apple-music:playlist:p2',
    ]);
  });

  test('no "- Sifted": nothing to remember, and it isn\'t looked for again', async () => {
    const music = service({ p1: roadTrip });
    await importSiftedKeeps(music, 'apple-music', ROAD_TRIP);
    await importSiftedKeeps(music, 'apple-music', ROAD_TRIP);
    expect(music.findPlaylists).toHaveBeenCalledTimes(1);
    expect(music.loadPlaylistTracks).not.toHaveBeenCalled();
    await expect(loadReviewedIds(KEY)).resolves.toEqual(new Set());
  });

  test('two asks at once share one look', async () => {
    const music = service({
      p1: roadTrip,
      s1: { name: 'Road Trip - Sifted', tracks: [{ ...peaches, id: 'i.1' }] },
    });
    await Promise.all([
      importSiftedKeeps(music, 'apple-music', ROAD_TRIP),
      importSiftedKeeps(music, 'apple-music', ROAD_TRIP),
    ]);
    expect(music.findPlaylists).toHaveBeenCalledTimes(1);
  });

  test('a library sift has nothing to look at', async () => {
    const music = service({});
    await importSiftedKeeps(music, 'apple-music', { type: 'library' });
    expect(music.isAuthorized).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem('sift_sifted_imported')).toBeNull();
  });

  test('without access yet it waits, and looks once there is access', async () => {
    const music = service({
      p1: roadTrip,
      s1: { name: 'Road Trip - Sifted', tracks: [{ ...peaches, id: 'i.1' }] },
    });
    music.isAuthorized.mockResolvedValueOnce(false);
    await importSiftedKeeps(music, 'apple-music', ROAD_TRIP);
    expect(music.findPlaylists).not.toHaveBeenCalled();
    await importSiftedKeeps(music, 'apple-music', ROAD_TRIP);
    await expect(loadReviewedIds(KEY)).resolves.toEqual(new Set(['a']));
  });

  test('a failed look is reported, never rejects, and is tried again next time', async () => {
    const music = service({
      p1: roadTrip,
      s1: { name: 'Road Trip - Sifted', tracks: [{ ...peaches, id: 'i.1' }] },
    });
    music.findPlaylists.mockRejectedValueOnce(new Error('offline'));
    await expect(importSiftedKeeps(music, 'apple-music', ROAD_TRIP)).resolves.toBeUndefined();
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error), {
      tags: { flow: 'sifted-import' },
    });
    expect(await AsyncStorage.getItem('sift_sifted_imported')).toBeNull();
    await importSiftedKeeps(music, 'apple-music', ROAD_TRIP);
    await expect(loadReviewedIds(KEY)).resolves.toEqual(new Set(['a']));
  });

  test('a service without findPlaylists is searched through its playlist list', async () => {
    const music = service(
      { p1: roadTrip, s1: { name: 'Road Trip - Sifted', tracks: [{ ...stay, id: 'i.2' }] } },
      {
        findPlaylists: undefined,
        loadPlaylists: jest.fn(async () => [
          { id: 'p1', name: 'Road Trip', trackCount: 3 },
          { id: 's1', name: 'Road Trip - Sifted', trackCount: 1 },
        ]),
      },
    );
    await importSiftedKeeps(music, 'apple-music', ROAD_TRIP);
    await expect(loadReviewedIds(KEY)).resolves.toEqual(new Set(['b']));
  });

  test('an unreadable flag list counts as empty and is written fresh', async () => {
    await AsyncStorage.setItem('sift_sifted_imported', '{not json');
    const music = service({ p1: roadTrip });
    await importSiftedKeeps(music, 'apple-music', ROAD_TRIP);
    expect(music.findPlaylists).toHaveBeenCalledTimes(1);
    expect(JSON.parse((await AsyncStorage.getItem('sift_sifted_imported')) ?? 'null')).toEqual([
      KEY,
    ]);
  });

  test("a flag list that isn't a list of keys counts only its keys", async () => {
    await AsyncStorage.setItem('sift_sifted_imported', JSON.stringify([7, KEY]));
    const music = service({ p1: roadTrip });
    await importSiftedKeeps(music, 'apple-music', ROAD_TRIP);
    expect(music.findPlaylists).not.toHaveBeenCalled();
    await AsyncStorage.setItem('sift_sifted_imported', JSON.stringify({ [KEY]: true }));
    await importSiftedKeeps(music, 'apple-music', ROAD_TRIP);
    expect(music.findPlaylists).toHaveBeenCalledTimes(1);
  });

  test('a keep taken back this launch stays taken back', async () => {
    // A resumed old session's keep, changed in the decisions list before
    // the look finished.
    await markReviewed(KEY, 'a');
    await unmarkReviewed(KEY, 'a');
    const music = service({
      p1: roadTrip,
      s1: {
        name: 'Road Trip - Sifted',
        tracks: [
          { ...peaches, id: 'i.1' },
          { ...stay, id: 'i.2' },
        ],
      },
    });
    await importSiftedKeeps(music, 'apple-music', ROAD_TRIP);
    await expect(loadReviewedIds(KEY)).resolves.toEqual(new Set(['b']));
    expect(JSON.parse((await AsyncStorage.getItem('sift_sifted_imported')) ?? 'null')).toEqual([
      KEY,
    ]);
  });

  test('a ledger write that fails leaves the playlist to be looked at again', async () => {
    const music = service({
      p1: roadTrip,
      s1: { name: 'Road Trip - Sifted', tracks: [{ ...peaches, id: 'i.1' }] },
    });
    AsyncStorage.setItem.mockImplementationOnce(async () => {
      throw new Error('disk full');
    });
    await importSiftedKeeps(music, 'apple-music', ROAD_TRIP);
    expect(await AsyncStorage.getItem('sift_sifted_imported')).toBeNull();
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "1 of 1 kept songs weren't recorded" }),
      { tags: { flow: 'sifted-import' } },
    );
    await importSiftedKeeps(music, 'apple-music', ROAD_TRIP);
    await expect(loadReviewedIds(KEY)).resolves.toEqual(new Set(['a']));
    expect(music.findPlaylists).toHaveBeenCalledTimes(2);
  });
  describe('the playlist loads once when a sift loads it too (#179)', () => {
    /** Road Trip's own load waits for `release`; its "- Sifted" loads at once. */
    function slowRoadTrip() {
      let release: () => void = () => {};
      const loaded = new Promise<void>((resolve) => {
        release = resolve;
      });
      const music = service(
        { s1: { name: 'Road Trip - Sifted', tracks: [{ ...stay, id: 'i.2' }] } },
        {
          loadPlaylistTracks: jest.fn(async (id: string) => {
            if (id !== 'p1') return [{ ...stay, id: 'i.2' }];
            await loaded;
            return [peaches, stay, intro];
          }),
        },
      );
      return { music, release };
    }
    const p1Loads = (music: ReturnType<typeof service>) =>
      music.loadPlaylistTracks.mock.calls.filter(([id]) => id === 'p1').length;

    test("Start Sifting while Setup's import is loading the playlist: one load", async () => {
      const { music, release } = slowRoadTrip();
      const look = importSiftedKeeps(music, 'apple-music', ROAD_TRIP);
      for (let i = 0; i < 50 && p1Loads(music) === 0; i += 1)
        await new Promise<void>((r) => setImmediate(r));
      expect(p1Loads(music)).toBe(1);
      const sift = loadPlaylistTracksOnce(music, 'p1');
      release();
      await expect(sift).resolves.toEqual([peaches, stay, intro]);
      await look;
      expect(p1Loads(music)).toBe(1);
      await expect(loadReviewedIds(KEY)).resolves.toEqual(new Set(['b']));
    });

    test('the import reaching the playlist while a sift loads it: one load', async () => {
      const { music, release } = slowRoadTrip();
      const sift = loadPlaylistTracksOnce(music, 'p1');
      const look = importSiftedKeeps(music, 'apple-music', ROAD_TRIP);
      // Past its "- Sifted" and on to the playlist, which is still loading.
      const loadedSifted = () => music.loadPlaylistTracks.mock.calls.some(([id]) => id === 's1');
      for (let i = 0; i < 50 && !loadedSifted(); i += 1)
        await new Promise<void>((r) => setImmediate(r));
      for (let i = 0; i < 10; i += 1) await new Promise<void>((r) => setImmediate(r));
      release();
      await Promise.all([sift, look]);
      expect(p1Loads(music)).toBe(1);
      await expect(loadReviewedIds(KEY)).resolves.toEqual(new Set(['b']));
    });
  });

  describe('a "- Sifted" an older build\'s session named, found by id (#179)', () => {
    /** Road Trip, and its "- Sifted" copy from before a rename. */
    const renamed = (overrides: Partial<MusicProviderService> = {}) =>
      service(
        {
          p1: roadTrip,
          s9: { name: 'Roadtrip 2019 - Sifted', tracks: [{ ...peaches, id: 'i.1' }] },
        },
        {
          loadPlaylists: jest.fn(async () => [
            { id: 'p1', name: 'Road Trip', trackCount: 3 },
            { id: 's9', name: 'Roadtrip 2019 - Sifted', trackCount: 1 },
          ]),
          ...overrides,
        },
      ) as ReturnType<typeof service> & { loadPlaylists: jest.Mock };

    test("a renamed playlist's keeps still come over", async () => {
      const music = renamed();
      await rememberSiftedPlaylist('apple-music', ROAD_TRIP, 's9');
      await importSiftedKeeps(music, 'apple-music', ROAD_TRIP);
      expect(music.findPlaylists).toHaveBeenCalledWith('Road Trip - Sifted');
      await expect(loadReviewedIds(KEY)).resolves.toEqual(new Set(['a']));
    });

    test('one that also has the expected name is looked in once', async () => {
      const music = service({
        p1: roadTrip,
        s1: { name: 'Road Trip - Sifted', tracks: [{ ...peaches, id: 'i.1' }] },
      });
      await rememberSiftedPlaylist('apple-music', ROAD_TRIP, 's1');
      await importSiftedKeeps(music, 'apple-music', ROAD_TRIP);
      expect(music.loadPlaylistTracks.mock.calls.filter(([id]) => id === 's1')).toHaveLength(1);
      await expect(loadReviewedIds(KEY)).resolves.toEqual(new Set(['a']));
    });

    test('one deleted since is no keeps, not a look that fails forever', async () => {
      const music = renamed();
      await rememberSiftedPlaylist('apple-music', ROAD_TRIP, 'gone');
      await importSiftedKeeps(music, 'apple-music', ROAD_TRIP);
      expect(music.loadPlaylistTracks).not.toHaveBeenCalledWith('gone');
      expect(Sentry.captureException).not.toHaveBeenCalled();
      expect(JSON.parse((await AsyncStorage.getItem('sift_sifted_imported')) ?? 'null')).toEqual([
        KEY,
      ]);
    });

    test('a playlist already looked at by name is looked at again with it, once', async () => {
      const music = renamed();
      await importSiftedKeeps(music, 'apple-music', ROAD_TRIP);
      await expect(loadReviewedIds(KEY)).resolves.toEqual(new Set());
      await rememberSiftedPlaylist('apple-music', ROAD_TRIP, 's9');
      await importSiftedKeeps(music, 'apple-music', ROAD_TRIP);
      await expect(loadReviewedIds(KEY)).resolves.toEqual(new Set(['a']));
      // The same session loading again (until its next save) changes nothing.
      await rememberSiftedPlaylist('apple-music', ROAD_TRIP, 's9');
      await importSiftedKeeps(music, 'apple-music', ROAD_TRIP);
      expect(music.findPlaylists).toHaveBeenCalledTimes(2);
      expect(JSON.parse((await AsyncStorage.getItem('sift_sifted_ids')) ?? 'null')).toEqual({
        [KEY]: ['s9'],
      });
    });

    test('a look started while one is being remembered waits for it', async () => {
      const music = renamed();
      await importSiftedKeeps(music, 'apple-music', ROAD_TRIP);
      // An old session loading at launch as Setup picks its playlist.
      void rememberSiftedPlaylist('apple-music', ROAD_TRIP, 's9');
      await importSiftedKeeps(music, 'apple-music', ROAD_TRIP);
      await expect(loadReviewedIds(KEY)).resolves.toEqual(new Set(['a']));
    });

    test("another playlist's remembered one isn't looked in", async () => {
      const music = renamed();
      await rememberSiftedPlaylist(
        'apple-music',
        { type: 'playlist', playlist: { id: 'p2', name: 'Chill', trackCount: 0 } },
        's9',
      );
      await importSiftedKeeps(music, 'apple-music', ROAD_TRIP);
      await expect(loadReviewedIds(KEY)).resolves.toEqual(new Set());
      expect(music.loadPlaylists).not.toHaveBeenCalled();
    });

    test('a library session has none to remember', async () => {
      await rememberSiftedPlaylist('apple-music', { type: 'library' }, 's9');
      expect(await AsyncStorage.getItem('sift_sifted_ids')).toBeNull();
    });

    test('an unreadable list of them counts as empty; a failed write is reported, never rejects', async () => {
      await AsyncStorage.setItem('sift_sifted_ids', '{not json');
      await rememberSiftedPlaylist('apple-music', ROAD_TRIP, 's9');
      expect(JSON.parse((await AsyncStorage.getItem('sift_sifted_ids')) ?? 'null')).toEqual({
        [KEY]: ['s9'],
      });
      AsyncStorage.setItem.mockImplementationOnce(async () => {
        throw new Error('disk full');
      });
      await expect(
        rememberSiftedPlaylist('apple-music', ROAD_TRIP, 's10'),
      ).resolves.toBeUndefined();
      expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error), {
        tags: { flow: 'sifted-import' },
      });
    });

    test("entries that aren't lists of ids count only their ids", async () => {
      await AsyncStorage.setItem(
        'sift_sifted_ids',
        JSON.stringify({ [KEY]: ['s9', 7], other: 'x' }),
      );
      const music = renamed();
      await importSiftedKeeps(music, 'apple-music', ROAD_TRIP);
      await expect(loadReviewedIds(KEY)).resolves.toEqual(new Set(['a']));
    });
  });
});
