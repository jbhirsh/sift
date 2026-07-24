import { Platform } from 'react-native';

const mockNativeModule = {
  requestAuthorization: jest.fn().mockResolvedValue(true),
  getAuthorizationStatus: jest.fn().mockReturnValue('authorized'),
  loadPlaylists: jest.fn().mockResolvedValue([
    {
      id: 'pl-1', name: 'Chill Vibes', trackCount: 12,
      artworkURL: 'https://example.com/playlist-art.jpg',
    },
    {
      id: 'pl-2', name: 'Workout Mix', trackCount: 30,
      artworkURL: null,
    },
  ]),
  loadPlaylistTracks: jest.fn().mockResolvedValue([
    {
      id: '1', name: 'Song', artist: 'Artist', album: 'Album',
      duration: 200, playCount: 10, dateAdded: '2020-01-01',
      artworkURL: 'https://example.com/art.jpg',
    },
  ]),
  loadFullLibrary: jest.fn().mockResolvedValue([
    {
      id: '1', name: 'Song', artist: 'Artist', album: 'Album',
      duration: 200, playCount: 10, dateAdded: '2020-01-01',
      artworkURL: 'https://example.com/art.jpg',
    },
    {
      id: '2', name: 'Song2', artist: 'Artist2', album: 'Album2',
      duration: 180, playCount: 5, dateAdded: '2021-01-01',
      artworkURL: null,
    },
  ]),
  play: jest.fn().mockResolvedValue(undefined),
  pause: jest.fn().mockResolvedValue(undefined),
  resume: jest.fn().mockResolvedValue(undefined),
  seek: jest.fn(),
  getPlaybackState: jest.fn().mockReturnValue({ position: 42, isPlaying: true }),
  // The native module reports how many tracks it actually included/added.
  createPlaylist: jest.fn().mockImplementation(
    async (_name: string, trackIDs: string[]) => trackIDs.length,
  ),
  addToPlaylist: jest.fn().mockImplementation(
    async (_playlistID: string, trackIDs: string[]) => trackIDs.length,
  ),
  // Reports how many songs were newly cached.
  warmSongCache: jest.fn().mockImplementation(
    async (trackIDs: string[]) => trackIDs.length,
  ),
  removeFromLibrary: jest.fn().mockResolvedValue(undefined),
  removeFromPlaylist: jest.fn().mockResolvedValue(undefined),
  addToLibrary: jest.fn().mockResolvedValue(undefined),
};

jest.mock('../../modules/expo-musickit/src/index', () => mockNativeModule);

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

import { AppleMusicProvider } from '../../src/services/AppleMusicProvider';

describe('AppleMusicProvider', () => {
  let provider: AppleMusicProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new AppleMusicProvider();
  });

  test('requestAuthorization delegates to native module', async () => {
    const result = await provider.requestAuthorization();
    expect(result).toBe(true);
    expect(mockNativeModule.requestAuthorization).toHaveBeenCalled();
  });

  test('isAuthorized returns true when status is authorized', async () => {
    mockNativeModule.getAuthorizationStatus.mockReturnValue('authorized');
    expect(await provider.isAuthorized()).toBe(true);
  });

  test('isAuthorized returns false when status is not authorized', async () => {
    mockNativeModule.getAuthorizationStatus.mockReturnValue('denied');
    expect(await provider.isAuthorized()).toBe(false);
  });

  test('loadLibrary maps native tracks to app Track type', async () => {
    const tracks = await provider.loadLibrary();
    expect(tracks).toHaveLength(2);
    expect(tracks[0]).toEqual({
      id: '1', name: 'Song', artist: 'Artist', album: 'Album',
      duration: 200, playCount: 10, dateAdded: '2020-01-01',
      artworkURL: 'https://example.com/art.jpg',
    });
    expect(tracks[1].artworkURL).toBeUndefined();
  });

  test('play delegates to native module', async () => {
    await provider.play('trackId', 30);
    expect(mockNativeModule.play).toHaveBeenCalledWith('trackId', 30);
  });

  test('pause delegates to native module', async () => {
    await provider.pause();
    expect(mockNativeModule.pause).toHaveBeenCalled();
  });

  test('resume delegates to native module', async () => {
    await provider.resume();
    expect(mockNativeModule.resume).toHaveBeenCalled();
  });

  test('seek delegates to native module', () => {
    provider.seek(42);
    expect(mockNativeModule.seek).toHaveBeenCalledWith(42);
  });

  test('getPlaybackState returns native module state', () => {
    const state = provider.getPlaybackState();
    expect(state).toEqual({ position: 42, isPlaying: true });
  });

  test('createPlaylist delegates to native module', async () => {
    await provider.createPlaylist('My Playlist', ['1', '2']);
    expect(mockNativeModule.createPlaylist).toHaveBeenCalledWith('My Playlist', ['1', '2']);
  });

  test('createPlaylist throws when the native module could not include every track', async () => {
    mockNativeModule.createPlaylist.mockResolvedValueOnce(1);
    await expect(provider.createPlaylist('My Playlist', ['1', '2'])).rejects.toThrow(
      '1 of 2 tracks could not be resolved',
    );
  });

  test('createPlaylist error reports the exact shortfall and names the playlist', async () => {
    // included 1 of 3 -> "2 of 3": pins the subtraction (length - included) and
    // that the playlist name is interpolated into the message.
    mockNativeModule.createPlaylist.mockResolvedValueOnce(1);
    await expect(provider.createPlaylist('Road Trip', ['1', '2', '3'])).rejects.toThrow(
      '2 of 3 tracks could not be resolved and were left out of "Road Trip"',
    );
  });

  test('addToPlaylist delegates and resolves when every track was added', async () => {
    await expect(provider.addToPlaylist('pl-1', ['1', '2'])).resolves.toBeUndefined();
    expect(mockNativeModule.addToPlaylist).toHaveBeenCalledWith('pl-1', ['1', '2']);
  });

  test('addToPlaylist throws when the native module skipped unresolvable tracks', async () => {
    mockNativeModule.addToPlaylist.mockResolvedValueOnce(0);
    await expect(provider.addToPlaylist('pl-1', ['1'])).rejects.toThrow(
      '1 of 1 tracks could not be added',
    );
  });

  test('addToPlaylist error reports the exact shortfall and mentions the playlist', async () => {
    // added 1 of 3 -> "2 of 3": with a non-zero shortfall, subtraction (2) and
    // addition (4) diverge, pinning "length - added" against a mutated "+".
    // Also pins the full "to the playlist" suffix.
    mockNativeModule.addToPlaylist.mockResolvedValueOnce(1);
    await expect(provider.addToPlaylist('pl-1', ['1', '2', '3'])).rejects.toThrow(
      '2 of 3 tracks could not be added to the playlist',
    );
  });

  test('removeFromLibrary delegates to the native module with the track IDs', async () => {
    await expect(provider.removeFromLibrary(['1', '2'])).resolves.toBeUndefined();
    expect(mockNativeModule.removeFromLibrary).toHaveBeenCalledWith(['1', '2']);
  });

  test('removeFromPlaylist delegates with the playlist ID and track IDs', async () => {
    await expect(provider.removeFromPlaylist('pl-9', ['a', 'b'])).resolves.toBeUndefined();
    expect(mockNativeModule.removeFromPlaylist).toHaveBeenCalledWith('pl-9', ['a', 'b']);
  });

  test('addToLibrary delegates to the native module with the track IDs', async () => {
    await expect(provider.addToLibrary(['x', 'y', 'z'])).resolves.toBeUndefined();
    expect(mockNativeModule.addToLibrary).toHaveBeenCalledWith(['x', 'y', 'z']);
  });

  test('play with no position passes undefined', async () => {
    await provider.play('trackId');
    expect(mockNativeModule.play).toHaveBeenCalledWith('trackId', undefined);
  });

  test('loadPlaylists maps native playlists to app Playlist type', async () => {
    const playlists = await provider.loadPlaylists();
    expect(playlists).toHaveLength(2);
    expect(playlists[0]).toEqual({
      id: 'pl-1', name: 'Chill Vibes', trackCount: 12,
      artworkURL: 'https://example.com/playlist-art.jpg',
    });
    expect(playlists[1].artworkURL).toBeUndefined();
  });

  test('loadPlaylistTracks maps native tracks to app Track type', async () => {
    const Sentry = jest.requireMock('@sentry/react-native');
    const tracks = await provider.loadPlaylistTracks('pl-1');
    expect(tracks).toHaveLength(1);
    expect(tracks[0]).toEqual({
      id: '1', name: 'Song', artist: 'Artist', album: 'Album',
      duration: 200, playCount: 10, dateAdded: '2020-01-01',
      artworkURL: 'https://example.com/art.jpg',
    });
    expect(mockNativeModule.loadPlaylistTracks).toHaveBeenCalledWith('pl-1');
    // No track fell back (playCount 10 / dateAdded set), so no breadcrumb.
    // Pins the `fellBack > 0` guard against a `>= 0` mutant.
    expect(Sentry.addBreadcrumb).not.toHaveBeenCalled();
  });

  test('loadPlaylistTracks breadcrumbs only tracks that fell back on BOTH fields', async () => {
    const Sentry = jest.requireMock('@sentry/react-native');
    // Fallback signature is playCount 0 AND dateAdded "" together:
    //  - a, a2: both fields defaulted  -> fell back (counted)
    //  - b:     playCount 0 but has a date -> NOT a fallback (pins the &&)
    //  - d:     a normal, fully-populated track
    mockNativeModule.loadPlaylistTracks.mockResolvedValueOnce([
      { id: 'a', name: 'A', artist: 'Ar', album: 'Al', duration: 100, playCount: 0, dateAdded: '', artworkURL: null },
      { id: 'a2', name: 'A2', artist: 'Ar', album: 'Al', duration: 110, playCount: 0, dateAdded: '', artworkURL: null },
      { id: 'b', name: 'B', artist: 'Ar', album: 'Al', duration: 120, playCount: 0, dateAdded: '2020-01-01', artworkURL: null },
      { id: 'd', name: 'D', artist: 'Ar', album: 'Al', duration: 140, playCount: 5, dateAdded: '2021-01-01', artworkURL: 'https://example.com/d.jpg' },
    ]);

    const tracks = await provider.loadPlaylistTracks('pl-7');

    // Exactly 2 of 4 fell back — pins the filter (===0, ==='', &&) and the count.
    expect(Sentry.addBreadcrumb).toHaveBeenCalledTimes(1);
    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith({
      category: 'music-provider',
      message:
        'loadPlaylistTracks: 2 of 4 tracks fell back to Track metadata (playCount 0 / dateAdded "") — least-played/oldest sorts may misplace them',
      level: 'warning',
    });

    // Every track is still returned and mapped (null artwork -> undefined).
    expect(tracks).toHaveLength(4);
    expect(tracks[3]).toEqual({
      id: 'd', name: 'D', artist: 'Ar', album: 'Al',
      duration: 140, playCount: 5, dateAdded: '2021-01-01',
      artworkURL: 'https://example.com/d.jpg',
    });
    expect(tracks[0].artworkURL).toBeUndefined();
  });

  test('warmSongCache delegates to the native module and returns its count', async () => {
    mockNativeModule.warmSongCache.mockResolvedValueOnce(2);
    const warmed = await provider.warmSongCache(['1', '2', '3']);
    expect(mockNativeModule.warmSongCache).toHaveBeenCalledWith(['1', '2', '3']);
    expect(warmed).toBe(2);
  });

  test('warmSongCache tolerates a native module without the method', async () => {
    // Development builds made before warmSongCache shipped don't expose it:
    // resume must skip cache warming instead of throwing.
    const original = mockNativeModule.warmSongCache;
    mockNativeModule.warmSongCache = undefined as unknown as jest.Mock;
    try {
      await expect(provider.warmSongCache(['1'])).resolves.toBe(0);
    } finally {
      mockNativeModule.warmSongCache = original;
    }
  });
});

