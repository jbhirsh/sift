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
};

jest.mock('../../modules/expo-musickit/src/index', () => mockNativeModule);

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
    const tracks = await provider.loadPlaylistTracks('pl-1');
    expect(tracks).toHaveLength(1);
    expect(tracks[0]).toEqual({
      id: '1', name: 'Song', artist: 'Artist', album: 'Album',
      duration: 200, playCount: 10, dateAdded: '2020-01-01',
      artworkURL: 'https://example.com/art.jpg',
    });
    expect(mockNativeModule.loadPlaylistTracks).toHaveBeenCalledWith('pl-1');
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

