import type * as DeletedInMusicModule from '../../src/services/DeletedInMusic';
import type { MusicProviderService } from '../../src/services/MusicProviderInterface';
import type { RemovalRecord, Track } from '../../src/types';

const track = (id: string, over: Partial<Track> = {}): Track => ({
  id,
  name: id,
  artist: 'Artist',
  album: 'Album',
  duration: 200,
  playCount: 3,
  dateAdded: '2020-01-01T00:00:00Z',
  ...over,
});
const removal = (t: Track, over: Partial<RemovalRecord> = {}): RemovalRecord => ({
  track: t,
  source: { type: 'library' },
  provider: 'apple-music',
  removedAt: '2026-10-01T12:00:00Z',
  ...over,
});

const REPORTED = 'sift_deleted_in_music_reported';
const asyncStorageModule = jest.requireMock('@react-native-async-storage/async-storage');
const AsyncStorage = asyncStorageModule.default as {
  getItem: jest.Mock;
  setItem: jest.Mock;
  clear: jest.Mock;
};
const mockLoadHistory = jest.fn<Promise<RemovalRecord[]>, []>();
const mockTrace = jest.fn();
const Sentry = { captureException: jest.fn() };

/** A service whose deleted songs are `deleted`. */
function service(deleted: string[], over: Partial<MusicProviderService> = {}) {
  return {
    isAuthorized: jest.fn(async () => true),
    requestAuthorization: jest.fn(async () => true),
    deletedFromLibrary: jest.fn(async (tracks: Track[]) =>
      tracks.map((t) => t.id).filter((id) => deleted.includes(id)),
    ),
    ...over,
  } as unknown as MusicProviderService & {
    isAuthorized: jest.Mock;
    requestAuthorization: jest.Mock;
    deletedFromLibrary: jest.Mock;
  };
}

let deletedInMusicCount: typeof DeletedInMusicModule.deletedInMusicCount;
let markDeletedInMusicShown: typeof DeletedInMusicModule.markDeletedInMusicShown;
/** The module afresh, as on a new launch, on the same storage. */
function relaunch() {
  jest.isolateModules(() => {
    jest.doMock('@react-native-async-storage/async-storage', () => asyncStorageModule);
    jest.doMock('@sentry/react-native', () => Sentry);
    jest.doMock('../../src/services/RemovalHistoryStore', () => ({
      loadHistory: () => mockLoadHistory(),
    }));
    jest.doMock('../../src/services/trace', () => ({
      trace: (...args: unknown[]) => mockTrace(...args),
    }));
    ({ deletedInMusicCount, markDeletedInMusicShown } =
      require('../../src/services/DeletedInMusic') as typeof DeletedInMusicModule);
  });
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  mockLoadHistory.mockResolvedValue([
    removal(track('a')),
    removal(track('b')),
    removal(track('c')),
  ]);
  relaunch();
});

describe('songs deleted in Music (#183)', () => {
  test('counts the collected songs deleted in Music since', async () => {
    const music = service(['a', 'c']);
    await expect(deletedInMusicCount(music, 'apple-music')).resolves.toBe(2);
    expect(music.deletedFromLibrary).toHaveBeenCalledWith([track('a'), track('b'), track('c')]);
    expect(mockTrace).toHaveBeenCalledWith('deleted-in-music', { count: 2 });
  });

  test('looks once a launch, and gives the same count until a Setup shows it', async () => {
    const music = service(['a']);
    // A Setup that went away before the look finished never showed it.
    await expect(deletedInMusicCount(music, 'apple-music')).resolves.toBe(1);
    await expect(deletedInMusicCount(music, 'apple-music')).resolves.toBe(1);
    await markDeletedInMusicShown();
    await expect(deletedInMusicCount(music, 'apple-music')).resolves.toBe(0);
    expect(music.deletedFromLibrary).toHaveBeenCalledTimes(1);
  });

  test('once shown, no later launch counts those songs again; one deleted since still counts', async () => {
    await deletedInMusicCount(service(['a']), 'apple-music');
    await markDeletedInMusicShown();
    relaunch();
    const music = service(['a', 'b']);
    await expect(deletedInMusicCount(music, 'apple-music')).resolves.toBe(1);
    expect(music.deletedFromLibrary).toHaveBeenCalledWith([track('b'), track('c')]);
  });

  test('not shown (the app went before Setup showed it): the next launch says it', async () => {
    await deletedInMusicCount(service(['a']), 'apple-music');
    relaunch();
    await expect(deletedInMusicCount(service(['a']), 'apple-music')).resolves.toBe(1);
  });

  test('keeps every removal record: a song that comes back is still left out of sifts', async () => {
    // A lapsed subscription hides catalog songs from the library and "Sift —
    // Removed" until it's back. The history is only read, never rewritten.
    await deletedInMusicCount(service(['a', 'b', 'c']), 'apple-music');
    await markDeletedInMusicShown();
    // The history mock has only loadHistory: a rewrite would throw, and be reported.
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(JSON.parse((await AsyncStorage.getItem(REPORTED)) ?? 'null')).toEqual({
      'apple-music': ['a', 'b', 'c'],
    });
  });

  test("the reported list keeps only songs still collected (a restored one's records are gone)", async () => {
    await AsyncStorage.setItem(
      REPORTED,
      JSON.stringify({ 'apple-music': ['restored', 'a'], spotify: ['x'] }),
    );
    relaunch();
    await expect(deletedInMusicCount(service(['b']), 'apple-music')).resolves.toBe(1);
    await markDeletedInMusicShown();
    expect(JSON.parse((await AsyncStorage.getItem(REPORTED)) ?? 'null')).toEqual({
      'apple-music': ['a', 'b'],
      spotify: ['x'],
    });
  });

  test('nothing deleted: nothing traced', async () => {
    const music = service([]);
    await expect(deletedInMusicCount(music, 'apple-music')).resolves.toBe(0);
    expect(music.deletedFromLibrary).toHaveBeenCalled();
    expect(mockTrace).not.toHaveBeenCalled();
  });

  test("another provider's reported songs are kept as they were, ids only", async () => {
    await AsyncStorage.setItem(
      REPORTED,
      JSON.stringify({ 'apple-music': 'not a list', spotify: ['x', 7] }),
    );
    relaunch();
    await deletedInMusicCount(service(['a']), 'apple-music');
    await markDeletedInMusicShown();
    expect(JSON.parse((await AsyncStorage.getItem(REPORTED)) ?? 'null')).toEqual({
      'apple-music': ['a'],
      spotify: ['x'],
    });
  });

  test('marking shown before any look, or with nothing found, writes nothing', async () => {
    await markDeletedInMusicShown();
    relaunch();
    await deletedInMusicCount(service([]), 'apple-music');
    await markDeletedInMusicShown();
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  test('without library access it stays silent, and never asks for access', async () => {
    const music = service(['a']);
    music.isAuthorized.mockResolvedValueOnce(false);
    await expect(deletedInMusicCount(music, 'apple-music')).resolves.toBe(0);
    expect(music.requestAuthorization).not.toHaveBeenCalled();
    expect(music.deletedFromLibrary).not.toHaveBeenCalled();
  });

  test('nothing to look up: nothing asked', async () => {
    mockLoadHistory.mockResolvedValueOnce([
      // A playlist entry that isn't a library song can't be told deleted.
      removal(track('v', { dateAdded: '' }), {
        source: { type: 'playlist', playlist: { id: 'p1', name: 'Mix', trackCount: 1 } },
        collected: true,
      }),
    ]);
    const music = service(['v']);
    await expect(deletedInMusicCount(music, 'apple-music')).resolves.toBe(0);
    expect(music.deletedFromLibrary).not.toHaveBeenCalled();
  });

  test("a provider whose Remove doesn't collect, or that can't tell, has nothing to say", async () => {
    const music = service(['a']);
    await expect(deletedInMusicCount(music, 'spotify' as unknown as 'apple-music')).resolves.toBe(
      0,
    );
    expect(music.isAuthorized).not.toHaveBeenCalled();
    relaunch();
    await expect(
      deletedInMusicCount(service(['a'], { deletedFromLibrary: undefined }), 'apple-music'),
    ).resolves.toBe(0);
  });

  test('an unreadable reported list counts as empty, and is written fresh', async () => {
    for (const unreadable of ['{not json', 'null', '7']) {
      await AsyncStorage.setItem(REPORTED, unreadable);
      relaunch();
      await expect(deletedInMusicCount(service(['a']), 'apple-music')).resolves.toBe(1);
      await markDeletedInMusicShown();
      expect(JSON.parse((await AsyncStorage.getItem(REPORTED)) ?? 'null')).toEqual({
        'apple-music': ['a'],
      });
    }
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  test("a failed look or write is reported, says nothing it can't and never rejects", async () => {
    const music = service(['a']);
    music.deletedFromLibrary.mockRejectedValueOnce(new Error('offline'));
    await expect(deletedInMusicCount(music, 'apple-music')).resolves.toBe(0);
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error), {
      tags: { flow: 'deleted-in-music' },
    });
    relaunch();
    await deletedInMusicCount(service(['a']), 'apple-music');
    AsyncStorage.setItem.mockImplementationOnce(async () => {
      throw new Error('disk full');
    });
    await expect(markDeletedInMusicShown()).resolves.toBeUndefined();
    expect(Sentry.captureException).toHaveBeenCalledTimes(2);
    expect(Sentry.captureException).toHaveBeenLastCalledWith(
      expect.objectContaining({ message: 'disk full' }),
      { tags: { flow: 'deleted-in-music' } },
    );
  });
});
