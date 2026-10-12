import { Platform } from 'react-native';
import type { RawTrack } from '../../src/utils/musicKit';

// A stateful fake of the thin native module: a library, a catalog and the
// module's caches, so the provider's call sequences run against something
// that behaves like MusicKit (lookups fill caches, adds read them).
type AddResult = 'added' | 'failed' | 'unresolved';

const rawSong = (id: string, over: Partial<RawTrack> = {}): RawTrack => ({
  id,
  name: `Song ${id}`,
  artist: 'Artist',
  album: 'Album',
  duration: 200,
  playCount: 10,
  dateAdded: '2020-01-01T00:00:00Z',
  artworkURL: `https://example.com/${id}.jpg`,
  kind: 'song',
  ...over,
});

const rawEntry = (id: string, over: Partial<RawTrack> = {}): RawTrack => ({
  ...rawSong(id),
  playCount: null,
  dateAdded: null,
  kind: 'track',
  ...over,
});

const fake = {
  library: new Map<string, RawTrack>(),
  catalog: new Map<string, RawTrack>(),
  /** Catalog ids answered under another id (canonicalization). */
  catalogAliases: new Map<string, string>(),
  songCache: new Map<string, RawTrack>(),
  trackCache: new Map<string, RawTrack>(),
  playlists: new Map<string, { name: string; items: string[] }>(),
  failLibraryLookups: new Set<string>(),
  refuseAdds: new Set<string>(),
  catalogDown: false,
  nextPlaylist: 1,
  reset() {
    this.library.clear();
    this.catalog.clear();
    this.catalogAliases.clear();
    this.songCache.clear();
    this.trackCache.clear();
    this.playlists.clear();
    this.failLibraryLookups.clear();
    this.refuseAdds.clear();
    this.catalogDown = false;
    this.nextPlaylist = 1;
  },
};

const mockNative = {
  requestAuthorization: jest.fn().mockResolvedValue(true),
  getAuthorizationStatus: jest.fn().mockReturnValue('authorized'),
  loadLibraryPage: jest.fn(async (offset: number, limit: number) => {
    const page = [...fake.library.values()].slice(offset, offset + limit);
    page.forEach((s) => fake.songCache.set(s.id, s));
    return page;
  }),
  loadPlaylistsPage: jest.fn(async (offset: number, limit: number) =>
    [...fake.playlists.entries()].slice(offset, offset + limit).map(([id, p]) => ({
      id, name: p.name, trackCount: p.items.length, artworkURL: id === 'pl-1' ? 'https://example.com/pl.jpg' : null,
    }))),
  loadPlaylistItems: jest.fn(async (playlistID: string) => {
    const playlist = fake.playlists.get(playlistID);
    if (!playlist) throw new Error('No tracks found for the given IDs.');
    return playlist.items.map((id) => {
      const entry = rawEntry(id);
      fake.trackCache.set(id, entry);
      return entry;
    });
  }),
  lookupLibrarySongs: jest.fn(async (ids: string[]) => ids.map((id) => {
    if (fake.failLibraryLookups.has(id)) return { id, song: null, failed: true };
    const s = fake.library.get(id) ?? null;
    if (s) fake.songCache.set(id, s);
    return { id, song: s, failed: false };
  })),
  lookupCatalogSongs: jest.fn(async (ids: string[]) => {
    if (fake.catalogDown) throw new Error('offline');
    return ids.flatMap((id) => {
      const answerID = fake.catalogAliases.get(id) ?? id;
      const s = fake.catalog.get(answerID);
      if (!s) return [];
      if (!fake.songCache.has(s.id)) fake.songCache.set(s.id, s);
      return [s];
    });
  }),
  aliasCachedItem: jest.fn((fromID: string, toID: string) => {
    const s = fake.songCache.get(fromID);
    if (!s) return false;
    if (!fake.songCache.has(toID)) fake.songCache.set(toID, s);
    return true;
  }),
  cachedKinds: jest.fn((ids: string[]) =>
    ids.map((id) => (fake.songCache.has(id) ? 'song' : fake.trackCache.has(id) ? 'track' : null))),
  play: jest.fn().mockResolvedValue(undefined),
  pause: jest.fn().mockResolvedValue(undefined),
  resume: jest.fn().mockResolvedValue(undefined),
  seek: jest.fn(),
  getPlaybackState: jest.fn().mockReturnValue({ position: 42, isPlaying: true }),
  createEmptyPlaylist: jest.fn(async (name: string) => {
    const id = `new-${fake.nextPlaylist++}`;
    fake.playlists.set(id, { name, items: [] });
    return id;
  }),
  findPlaylistByName: jest.fn(async (name: string) =>
    [...fake.playlists.entries()].find(([, p]) => p.name === name)?.[0] ?? null),
  addEachToPlaylist: jest.fn(async (playlistID: string, ids: string[]): Promise<AddResult[]> => {
    const playlist = fake.playlists.get(playlistID);
    if (!playlist) throw new Error('No tracks found for the given IDs.');
    return ids.map((id) => {
      if (!fake.songCache.has(id) && !fake.trackCache.has(id)) return 'unresolved';
      if (fake.refuseAdds.has(id)) return 'failed';
      playlist.items.push(id);
      return 'added';
    });
  }),
  removeFromPlaylist: jest.fn().mockResolvedValue(undefined),
  addEachToLibrary: jest.fn(async (ids: string[]): Promise<AddResult[]> => ids.map((id) => {
    if (!fake.songCache.has(id)) return 'unresolved';
    return fake.refuseAdds.has(id) ? 'failed' : 'added';
  })),
  previewInfo: jest.fn(),
  catalogPreviewForISRC: jest.fn(),
  searchCatalogSongs: jest.fn(),
  shazamOffset: jest.fn(),
};

jest.mock('../../modules/expo-musickit/src/index', () => mockNative);

jest.mock('@sentry/react-native', () => ({
  addBreadcrumb: jest.fn(),
}));

// Override Platform.OS to ios at object level
const originalOS = Platform.OS;
beforeAll(() => {
  Object.defineProperty(Platform, 'OS', { value: 'ios', writable: true });
});
afterAll(() => {
  Object.defineProperty(Platform, 'OS', { value: originalOS, writable: true });
  jest.resetModules();
});

import * as Sentry from '@sentry/react-native';
import { AppleMusicProvider } from '../../src/services/AppleMusicProvider';

describe('AppleMusicProvider', () => {
  let provider: AppleMusicProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    fake.reset();
    provider = new AppleMusicProvider();
  });

  describe('pass-throughs', () => {
    test('authorization', async () => {
      await expect(provider.requestAuthorization()).resolves.toBe(true);
      await expect(provider.isAuthorized()).resolves.toBe(true);
      mockNative.getAuthorizationStatus.mockReturnValueOnce('denied');
      await expect(provider.isAuthorized()).resolves.toBe(false);
    });

    test('playback', async () => {
      await provider.play('1', 30);
      expect(mockNative.play).toHaveBeenCalledWith('1', 30);
      await provider.play('2');
      expect(mockNative.play).toHaveBeenCalledWith('2', undefined);
      await provider.pause();
      expect(mockNative.pause).toHaveBeenCalled();
      await provider.resume();
      expect(mockNative.resume).toHaveBeenCalled();
      provider.seek(12);
      expect(mockNative.seek).toHaveBeenCalledWith(12);
      expect(provider.getPlaybackState()).toEqual({ position: 42, isPlaying: true });
    });

    test('removeFromPlaylist', async () => {
      await provider.removeFromPlaylist('pl', ['a', 'b']);
      expect(mockNative.removeFromPlaylist).toHaveBeenCalledWith('pl', ['a', 'b']);
    });
  });

  describe('loading', () => {
    test('loadLibrary pages through 500 at a time and maps to Tracks', async () => {
      for (let i = 0; i < 501; i++) fake.library.set(`s${i}`, rawSong(`s${i}`));
      fake.library.set('s1', rawSong('s1', { artworkURL: 'musicKit://x', album: null }));
      const tracks = await provider.loadLibrary();
      expect(tracks).toHaveLength(501);
      expect(mockNative.loadLibraryPage.mock.calls).toEqual([[0, 500], [500, 500]]);
      expect(tracks[0]).toEqual({
        id: 's0', name: 'Song s0', artist: 'Artist', album: 'Album', duration: 200,
        playCount: 10, dateAdded: '2020-01-01T00:00:00Z', artworkURL: 'https://example.com/s0.jpg',
      });
      expect(tracks[1]).toMatchObject({ album: '', artworkURL: undefined });
    });

    test('loadPlaylists pages through 100 at a time and maps to Playlists', async () => {
      fake.playlists.set('pl-1', { name: 'Chill', items: ['a', 'b'] });
      fake.playlists.set('pl-2', { name: 'Gym', items: [] });
      await expect(provider.loadPlaylists()).resolves.toEqual([
        { id: 'pl-1', name: 'Chill', trackCount: 2, artworkURL: 'https://example.com/pl.jpg' },
        { id: 'pl-2', name: 'Gym', trackCount: 0, artworkURL: undefined },
      ]);
      expect(mockNative.loadPlaylistsPage).toHaveBeenCalledWith(0, 100);
    });

    test('loadPlaylistTracks uses the library song where there is one, in playlist order', async () => {
      fake.playlists.set('pl', { name: 'Mix', items: ['lib', 'entry'] });
      fake.library.set('lib', rawSong('lib', { playCount: 7 }));
      const tracks = await provider.loadPlaylistTracks('pl');
      expect(tracks.map((t) => [t.id, t.playCount, t.dateAdded])).toEqual([
        ['lib', 7, '2020-01-01T00:00:00Z'],
        ['entry', 0, ''],
      ]);
      expect(mockNative.lookupLibrarySongs).toHaveBeenCalledWith(['lib', 'entry']);
      // One entry had no library song: breadcrumbed for the sorts.
      expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(expect.objectContaining({
        category: 'music-provider',
        level: 'warning',
        message: expect.stringContaining('1 of 2 tracks have no library song'),
      }));
    });

    test('loadPlaylistTracks looks songs up 100 at a time, and a failed lookup keeps the entry', async () => {
      const ids = Array.from({ length: 150 }, (_, i) => `t${i}`);
      fake.playlists.set('pl', { name: 'Big', items: ids });
      ids.forEach((id) => fake.library.set(id, rawSong(id)));
      fake.failLibraryLookups.add('t3');
      const tracks = await provider.loadPlaylistTracks('pl');
      expect(mockNative.lookupLibrarySongs.mock.calls.map(([batch]) => batch.length)).toEqual([100, 50]);
      expect(tracks[3].playCount).toBe(0);
      expect(tracks[4].playCount).toBe(10);
    });

    test('loadPlaylistTracks breadcrumbs nothing when every track is a library song', async () => {
      fake.playlists.set('pl', { name: 'Mix', items: ['a'] });
      fake.library.set('a', rawSong('a'));
      await provider.loadPlaylistTracks('pl');
      expect(Sentry.addBreadcrumb).not.toHaveBeenCalled();
    });

    test('loadPlaylistTracks fails when the playlist is gone', async () => {
      await expect(provider.loadPlaylistTracks('nope')).rejects.toThrow('No tracks found');
    });
  });

  describe('resolving ids (warmSongCache)', () => {
    test('library first, then the catalog; counts what is now cached', async () => {
      fake.library.set('lib', rawSong('lib'));
      fake.catalog.set('cat', rawSong('cat'));
      await expect(provider.warmSongCache(['lib', 'cat', 'gone'])).resolves.toBe(2);
      expect(mockNative.lookupLibrarySongs).toHaveBeenCalledWith(['lib', 'cat', 'gone']);
      expect(mockNative.lookupCatalogSongs).toHaveBeenCalledWith(['cat', 'gone']);
    });

    test('cached and repeated ids aren\'t looked up again', async () => {
      fake.songCache.set('cached', rawSong('cached'));
      fake.library.set('a', rawSong('a'));
      await provider.warmSongCache(['cached', 'a', 'a']);
      expect(mockNative.lookupLibrarySongs).toHaveBeenCalledWith(['a']);
      expect(mockNative.lookupCatalogSongs).not.toHaveBeenCalled();
    });

    test('nothing missing, no lookups', async () => {
      fake.trackCache.set('e', rawEntry('e'));
      await expect(provider.warmSongCache(['e'])).resolves.toBe(1);
      expect(mockNative.lookupLibrarySongs).not.toHaveBeenCalled();
    });

    test('lookups go out 100 ids at a time', async () => {
      const ids = Array.from({ length: 250 }, (_, i) => `x${i}`);
      await provider.warmSongCache(ids);
      expect(mockNative.lookupLibrarySongs.mock.calls.map(([b]) => b.length)).toEqual([100, 100, 50]);
      expect(mockNative.lookupCatalogSongs.mock.calls.map(([b]) => b.length)).toEqual([100, 100, 50]);
    });

    test('a playlist sift reloads its playlist, bringing back entries no lookup finds (#54)', async () => {
      // A music video: in the playlist, neither a library nor a catalog song.
      fake.playlists.set('pl', { name: 'Mix', items: ['video', 'lib'] });
      fake.library.set('lib', rawSong('lib'));
      await expect(provider.warmSongCache(['video', 'lib'])).resolves.toBe(1);
      await expect(provider.warmSongCache(['video', 'lib'], 'pl')).resolves.toBe(2);
      expect(mockNative.loadPlaylistItems).toHaveBeenCalledWith('pl');
      expect(mockNative.cachedKinds(['video', 'lib'])).toEqual(['track', 'song']);
    });

    test('a playlist that is gone is breadcrumbed, and the lookups still run', async () => {
      fake.library.set('lib', rawSong('lib'));
      await expect(provider.warmSongCache(['lib'], 'gone')).resolves.toBe(1);
      expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(expect.objectContaining({
        category: 'music-provider',
        level: 'warning',
        message: 'warmSongCache: reloading the playlist failed (No tracks found for the given IDs.)',
      }));
    });

    test('a failed library lookup falls through to the catalog', async () => {
      fake.failLibraryLookups.add('x');
      fake.catalog.set('x', rawSong('x'));
      await expect(provider.warmSongCache(['x'])).resolves.toBe(1);
      expect(mockNative.lookupCatalogSongs).toHaveBeenCalledWith(['x']);
    });

    test('a rejected library lookup (not authorized) reaches the caller', async () => {
      mockNative.lookupLibrarySongs.mockRejectedValueOnce(new Error('Music library access not authorized.'));
      await expect(provider.warmSongCache(['x'])).rejects.toThrow('not authorized');
    });

    test('a catalog outage leaves those ids unresolved without failing', async () => {
      fake.catalogDown = true;
      await expect(provider.warmSongCache(['x'])).resolves.toBe(0);
    });

    test('a catalog answer under another id stays unpaired without metadata to confirm it', async () => {
      fake.catalogAliases.set('req', 'canon');
      fake.catalog.set('canon', rawSong('canon'));
      await expect(provider.warmSongCache(['req'])).resolves.toBe(0);
      expect(mockNative.aliasCachedItem).not.toHaveBeenCalled();
    });

    // No caller passes metadata yet; the pairing is ready for one that does
    // (an EAS Update away), so exercise it directly.
    type Resolver = { resolveIntoCaches(ids: string[], known?: Map<string, unknown>): Promise<void> };
    const resolve = (ids: string[], known: Map<string, unknown>) =>
      (provider as unknown as Resolver).resolveIntoCaches(ids, known);

    test('with matching metadata, a catalog answer under another id is filed under the requested one', async () => {
      fake.catalogAliases.set('req', 'canon');
      fake.catalog.set('canon', rawSong('canon', { name: 'Peaches', artist: 'Justin Bieber', duration: 198 }));
      await resolve(['req'], new Map([['req', { id: 'req', title: 'Peaches', artist: 'Justin Bieber', duration: 198.5 }]]));
      expect(mockNative.aliasCachedItem).toHaveBeenCalledWith('canon', 'req');
      expect(mockNative.cachedKinds(['req'])).toEqual(['song']);
    });

    test('metadata that doesn\'t match, or belongs to another id, pairs nothing', async () => {
      fake.catalogAliases.set('req', 'canon');
      fake.catalog.set('canon', rawSong('canon', { name: 'Peaches', artist: 'Justin Bieber', duration: 198 }));
      await resolve(['req'], new Map([['req', { id: 'req', title: 'Other', artist: 'Justin Bieber', duration: 198 }]]));
      await resolve(['req'], new Map([['zzz', { id: 'zzz', title: 'Peaches', artist: 'Justin Bieber', duration: 198 }]]));
      expect(mockNative.aliasCachedItem).not.toHaveBeenCalled();
    });

    test('two unanswered ids in one batch pair nothing, even with metadata', async () => {
      fake.catalogAliases.set('r1', 'canon');
      fake.catalog.set('canon', rawSong('canon', { name: 'Peaches', artist: 'Justin Bieber', duration: 198 }));
      const meta = { title: 'Peaches', artist: 'Justin Bieber', duration: 198 };
      await resolve(['r1', 'r2'], new Map([['r1', { id: 'r1', ...meta }], ['r2', { id: 'r2', ...meta }]]));
      expect(mockNative.aliasCachedItem).not.toHaveBeenCalled();
    });
  });

  describe('createPlaylist', () => {
    test('creates it empty and adds every track in order', async () => {
      fake.library.set('a', rawSong('a'));
      fake.catalog.set('b', rawSong('b'));
      await provider.createPlaylist('Keepers', ['a', 'b']);
      expect(mockNative.createEmptyPlaylist).toHaveBeenCalledWith('Keepers');
      expect(fake.playlists.get('new-1')).toEqual({ name: 'Keepers', items: ['a', 'b'] });
    });

    test('nothing resolvable: no playlist is created', async () => {
      await expect(provider.createPlaylist('Keepers', ['gone'])).rejects.toThrow('No tracks found for the given IDs.');
      expect(mockNative.createEmptyPlaylist).not.toHaveBeenCalled();
    });

    test('a shortfall is an error naming the count and the playlist', async () => {
      fake.library.set('a', rawSong('a'));
      fake.library.set('b', rawSong('b'));
      fake.refuseAdds.add('b');
      await expect(provider.createPlaylist('Keepers', ['a', 'b', 'gone'])).rejects.toThrow(
        '2 of 3 tracks could not be resolved and were left out of "Keepers"',
      );
      expect(fake.playlists.get('new-1')?.items).toEqual(['a']);
    });
  });

  describe('addToPlaylist', () => {
    beforeEach(() => fake.playlists.set('pl', { name: 'Mix - Sifted', items: [] }));

    test('resolves and adds every track', async () => {
      fake.library.set('a', rawSong('a'));
      await provider.addToPlaylist('pl', ['a']);
      expect(fake.playlists.get('pl')?.items).toEqual(['a']);
    });

    test('a shortfall is an error naming the count', async () => {
      fake.library.set('a', rawSong('a'));
      await expect(provider.addToPlaylist('pl', ['a', 'gone'])).rejects.toThrow(
        '1 of 2 tracks could not be added to the playlist',
      );
    });

    test('a missing playlist fails', async () => {
      fake.library.set('a', rawSong('a'));
      await expect(provider.addToPlaylist('nope', ['a'])).rejects.toThrow('No tracks found');
    });
  });

  describe('removeFromLibrary (moves to "Sift — Removed")', () => {
    test('creates the playlist the first time and moves the songs into it', async () => {
      fake.library.set('a', rawSong('a'));
      await provider.removeFromLibrary(['a']);
      expect(mockNative.findPlaylistByName).toHaveBeenCalledWith('Sift — Removed');
      expect(mockNative.createEmptyPlaylist).toHaveBeenCalledWith('Sift — Removed');
      expect(fake.playlists.get('new-1')).toEqual({ name: 'Sift — Removed', items: ['a'] });
    });

    test('uses the existing playlist after that', async () => {
      fake.playlists.set('removed', { name: 'Sift — Removed', items: ['old'] });
      fake.songCache.set('a', rawSong('a'));
      await provider.removeFromLibrary(['a']);
      expect(mockNative.createEmptyPlaylist).not.toHaveBeenCalled();
      // Already a cached song: no lookup needed.
      expect(mockNative.lookupLibrarySongs).not.toHaveBeenCalled();
      expect(fake.playlists.get('removed')?.items).toEqual(['old', 'a']);
    });

    test('only library songs move; a playlist entry is looked up as one', async () => {
      fake.trackCache.set('entry', rawEntry('entry'));
      fake.library.set('a', rawSong('a'));
      await provider.removeFromLibrary(['entry', 'a']);
      expect(mockNative.lookupLibrarySongs).toHaveBeenCalledWith(['entry', 'a']);
      expect(fake.playlists.get('new-1')?.items).toEqual(['a']);
    });

    test('no library songs at all is an error, and nothing is created', async () => {
      await expect(provider.removeFromLibrary(['gone'])).rejects.toThrow('No tracks found for the given IDs.');
      expect(mockNative.findPlaylistByName).not.toHaveBeenCalled();
    });

    test('looks each missing id up once, 100 at a time', async () => {
      const ids = Array.from({ length: 150 }, (_, i) => `r${i}`);
      ids.forEach((id) => fake.library.set(id, rawSong(id)));
      await provider.removeFromLibrary([...ids, 'r0', 'r1']);
      expect(mockNative.lookupLibrarySongs.mock.calls.map(([b]) => b.length)).toEqual([100, 50]);
    });

    test('a failed lookup fails the Remove before anything moves', async () => {
      fake.library.set('a', rawSong('a'));
      fake.failLibraryLookups.add('b');
      await expect(provider.removeFromLibrary(['a', 'b'])).rejects.toThrow('Library lookup failed for 1 of 2 songs');
      expect(mockNative.addEachToPlaylist).not.toHaveBeenCalled();
    });

    test('a song MusicKit refuses fails the Remove, naming the count', async () => {
      fake.library.set('a', rawSong('a'));
      fake.library.set('b', rawSong('b'));
      fake.refuseAdds.add('b');
      await expect(provider.removeFromLibrary(['a', 'b'])).rejects.toThrow(
        '1 of 2 songs could not be moved to "Sift — Removed"',
      );
    });
  });

  describe('addToLibrary', () => {
    test('adds each library song; ids with none are skipped', async () => {
      fake.library.set('a', rawSong('a'));
      await provider.addToLibrary(['a', 'gone']);
      expect(mockNative.addEachToLibrary).toHaveBeenCalledWith(['a', 'gone']);
    });

    test('a song MusicKit refuses fails the call', async () => {
      fake.library.set('a', rawSong('a'));
      fake.refuseAdds.add('a');
      await expect(provider.addToLibrary(['a'])).rejects.toThrow('1 of 1 tracks could not be added to the library');
    });

    test('a failed lookup fails the call', async () => {
      fake.failLibraryLookups.add('a');
      await expect(provider.addToLibrary(['a'])).rejects.toThrow('Library lookup failed for 1 of 1 songs');
      expect(mockNative.addEachToLibrary).not.toHaveBeenCalled();
    });
  });

  describe('previewOffset ("Start at chorus")', () => {
    const info = { previewURL: null, isrc: null, title: 'Peaches', artist: 'Justin Bieber', duration: 198 };

    test('the song\'s own preview', async () => {
      mockNative.previewInfo.mockResolvedValueOnce({ ...info, previewURL: 'own.m4a' });
      mockNative.shazamOffset.mockResolvedValueOnce(42);
      await expect(provider.previewOffset('t')).resolves.toBe(42);
      expect(mockNative.shazamOffset).toHaveBeenCalledWith('own.m4a');
      expect(mockNative.catalogPreviewForISRC).not.toHaveBeenCalled();
    });

    test('else the catalog\'s by ISRC', async () => {
      mockNative.previewInfo.mockResolvedValueOnce({ ...info, isrc: 'US123' });
      mockNative.catalogPreviewForISRC.mockResolvedValueOnce('isrc.m4a');
      mockNative.shazamOffset.mockResolvedValueOnce(30);
      await expect(provider.previewOffset('t')).resolves.toBe(30);
      expect(mockNative.catalogPreviewForISRC).toHaveBeenCalledWith('US123');
      expect(mockNative.searchCatalogSongs).not.toHaveBeenCalled();
    });

    test('no ISRC: straight to the search', async () => {
      mockNative.previewInfo.mockResolvedValueOnce(info);
      mockNative.searchCatalogSongs.mockResolvedValueOnce([]);
      await expect(provider.previewOffset('t')).resolves.toBeNull();
      expect(mockNative.catalogPreviewForISRC).not.toHaveBeenCalled();
      expect(mockNative.searchCatalogSongs).toHaveBeenCalled();
    });

    test('else the closest search hit', async () => {
      mockNative.previewInfo.mockResolvedValueOnce({ ...info, isrc: 'US123' });
      mockNative.catalogPreviewForISRC.mockResolvedValueOnce(null);
      mockNative.searchCatalogSongs.mockResolvedValueOnce([
        { id: 'h1', title: 'Peaches', artist: 'Justin Bieber', duration: 205, previewURL: 'far.m4a' },
        { id: 'h2', title: 'Peaches', artist: 'Justin Bieber', duration: 199, previewURL: 'near.m4a' },
      ]);
      mockNative.shazamOffset.mockResolvedValueOnce(12);
      await expect(provider.previewOffset('t')).resolves.toBe(12);
      expect(mockNative.searchCatalogSongs).toHaveBeenCalledWith('Peaches Justin Bieber', 10);
      expect(mockNative.shazamOffset).toHaveBeenCalledWith('near.m4a');
    });

    test('no close hit, or a hit without a preview: no hint', async () => {
      mockNative.previewInfo.mockResolvedValue(info);
      mockNative.searchCatalogSongs.mockResolvedValueOnce([
        { id: 'h', title: 'Peaches', artist: 'Justin Bieber', duration: 260, previewURL: 'live.m4a' },
      ]);
      await expect(provider.previewOffset('t')).resolves.toBeNull();
      mockNative.searchCatalogSongs.mockResolvedValueOnce([
        { id: 'h', title: 'Peaches', artist: 'Justin Bieber', duration: 198, previewURL: null },
      ]);
      await expect(provider.previewOffset('t')).resolves.toBeNull();
      expect(mockNative.shazamOffset).not.toHaveBeenCalled();
      mockNative.previewInfo.mockReset();
    });

    test('not a song (a music video): no hint', async () => {
      mockNative.previewInfo.mockResolvedValueOnce(null);
      await expect(provider.previewOffset('t')).resolves.toBeNull();
    });

    test('not loaded yet: the error reaches the caller, which retries', async () => {
      mockNative.previewInfo.mockRejectedValueOnce(new Error('Track t not found in cache.'));
      await expect(provider.previewOffset('t')).rejects.toThrow('not found in cache');
    });
  });
});
