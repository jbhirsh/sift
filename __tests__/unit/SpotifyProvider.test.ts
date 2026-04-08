const mockPlayer = {
  play: jest.fn(),
  pause: jest.fn(),
  seekTo: jest.fn(),
  remove: jest.fn(),
  addListener: jest.fn(),
  currentTime: 15,
};

jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn(() => mockPlayer),
}));

jest.mock('../../src/services/spotify/SpotifyAuth', () => ({
  authorize: jest.fn().mockResolvedValue(true),
  getAccessToken: jest.fn().mockResolvedValue('test-token'),
  isAuthenticated: jest.fn().mockResolvedValue(true),
  refreshTokenIfNeeded: jest.fn().mockResolvedValue(undefined),
  logout: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/services/spotify/SpotifyAPI', () => ({
  loadLibrary: jest.fn().mockResolvedValue([
    {
      id: '1', name: 'Song', artist: 'Artist', album: 'Album',
      duration: 30, playCount: 5, dateAdded: '2020-01-01',
      previewURL: 'https://example.com/preview.mp3',
    },
    {
      id: '2', name: 'Song2', artist: 'Artist2', album: 'Album2',
      duration: 30, playCount: 3, dateAdded: '2021-01-01',
    },
  ]),
  createPlaylist: jest.fn().mockResolvedValue(undefined),
  loadPlaylists: jest.fn().mockResolvedValue([
    { id: 'pl1', name: 'Chill', trackCount: 20, artworkURL: 'https://img.spotify.com/pl1.jpg' },
    { id: 'pl2', name: 'Workout', trackCount: 10 },
  ]),
  loadPlaylistTracks: jest.fn().mockResolvedValue([
    {
      id: 'pt1', name: 'Playlist Track', artist: 'Artist', album: 'Album',
      duration: 30, playCount: 0, dateAdded: '2024-01-01',
      previewURL: 'https://example.com/pt-preview.mp3',
    },
  ]),
}));

import { SpotifyProvider } from '../../src/services/SpotifyProvider';
import * as SpotifyAuth from '../../src/services/spotify/SpotifyAuth';
import * as SpotifyAPI from '../../src/services/spotify/SpotifyAPI';
import { createAudioPlayer } from 'expo-audio';

describe('SpotifyProvider', () => {
  let provider: SpotifyProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new SpotifyProvider();
  });

  test('requestAuthorization calls authorize', async () => {
    const result = await provider.requestAuthorization();
    expect(result).toBe(true);
    expect(SpotifyAuth.authorize).toHaveBeenCalled();
  });

  test('requestAuthorization returns false on error', async () => {
    (SpotifyAuth.authorize as jest.Mock).mockRejectedValueOnce(new Error('fail'));
    const result = await provider.requestAuthorization();
    expect(result).toBe(false);
  });

  test('isAuthorized calls isAuthenticated', async () => {
    const result = await provider.isAuthorized();
    expect(result).toBe(true);
  });

  test('loadLibrary refreshes token and fetches library', async () => {
    const tracks = await provider.loadLibrary();
    expect(SpotifyAuth.refreshTokenIfNeeded).toHaveBeenCalled();
    expect(SpotifyAuth.getAccessToken).toHaveBeenCalled();
    expect(SpotifyAPI.loadLibrary).toHaveBeenCalledWith('test-token');
    expect(tracks).toHaveLength(2);
  });

  test('loadLibrary throws when not authenticated', async () => {
    (SpotifyAuth.getAccessToken as jest.Mock).mockResolvedValueOnce(null);
    await expect(provider.loadLibrary()).rejects.toThrow('not authenticated');
  });

  test('play creates audio player for track with preview URL', async () => {
    // Load library first to populate preview URLs
    await provider.loadLibrary();
    await provider.play('1');
    expect(createAudioPlayer).toHaveBeenCalledWith(
      { uri: 'https://example.com/preview.mp3' },
      { updateInterval: 0.5 }
    );
    expect(mockPlayer.play).toHaveBeenCalled();
  });

  test('play with position seeks before playing', async () => {
    await provider.loadLibrary();
    await provider.play('1', 10);
    expect(mockPlayer.seekTo).toHaveBeenCalledWith(10);
    expect(mockPlayer.play).toHaveBeenCalled();
  });

  test('play with no preview URL does not create player', async () => {
    await provider.loadLibrary();
    jest.clearAllMocks();
    await provider.play('2'); // Track without preview URL
    expect(createAudioPlayer).not.toHaveBeenCalled();
  });

  test('pause calls player.pause', async () => {
    await provider.loadLibrary();
    await provider.play('1');
    await provider.pause();
    expect(mockPlayer.pause).toHaveBeenCalled();
  });

  test('pause does nothing when no player', async () => {
    await provider.pause(); // Should not throw
  });

  test('resume calls player.play', async () => {
    await provider.loadLibrary();
    await provider.play('1');
    await provider.resume();
    expect(mockPlayer.play).toHaveBeenCalled();
  });

  test('resume does nothing when no player', async () => {
    await provider.resume(); // Should not throw
  });

  test('seek updates position and calls seekTo', async () => {
    await provider.loadLibrary();
    await provider.play('1');
    provider.seek(20);
    expect(mockPlayer.seekTo).toHaveBeenCalledWith(20);
    expect(provider.getPlaybackState().position).toBe(20);
  });

  test('seek without player just updates position', () => {
    provider.seek(20);
    expect(provider.getPlaybackState().position).toBe(20);
  });

  test('getPlaybackState returns current state', () => {
    const state = provider.getPlaybackState();
    expect(state).toHaveProperty('position');
    expect(state).toHaveProperty('isPlaying');
  });

  test('createPlaylist refreshes token and calls API', async () => {
    await provider.createPlaylist('My Playlist', ['1', '2']);
    expect(SpotifyAuth.refreshTokenIfNeeded).toHaveBeenCalled();
    expect(SpotifyAPI.createPlaylist).toHaveBeenCalledWith('test-token', 'My Playlist', ['1', '2']);
  });

  test('createPlaylist throws when not authenticated', async () => {
    (SpotifyAuth.getAccessToken as jest.Mock).mockResolvedValueOnce(null);
    await expect(provider.createPlaylist('Test', ['1'])).rejects.toThrow('not authenticated');
  });

  test('loadPlaylists refreshes token and fetches playlists', async () => {
    const playlists = await provider.loadPlaylists();
    expect(SpotifyAuth.refreshTokenIfNeeded).toHaveBeenCalled();
    expect(SpotifyAuth.getAccessToken).toHaveBeenCalled();
    expect(SpotifyAPI.loadPlaylists).toHaveBeenCalledWith('test-token');
    expect(playlists).toHaveLength(2);
    expect(playlists[0].name).toBe('Chill');
  });

  test('loadPlaylists throws when not authenticated', async () => {
    (SpotifyAuth.getAccessToken as jest.Mock).mockResolvedValueOnce(null);
    await expect(provider.loadPlaylists()).rejects.toThrow('not authenticated');
  });

  test('loadPlaylistTracks refreshes token and fetches tracks', async () => {
    const tracks = await provider.loadPlaylistTracks('pl1');
    expect(SpotifyAuth.refreshTokenIfNeeded).toHaveBeenCalled();
    expect(SpotifyAuth.getAccessToken).toHaveBeenCalled();
    expect(SpotifyAPI.loadPlaylistTracks).toHaveBeenCalledWith('test-token', 'pl1');
    expect(tracks).toHaveLength(1);
    expect(tracks[0].id).toBe('pt1');
  });

  test('loadPlaylistTracks caches preview URLs', async () => {
    await provider.loadPlaylistTracks('pl1');
    // Play the track loaded from playlist — should use cached preview URL
    await provider.play('pt1');
    expect(createAudioPlayer).toHaveBeenCalledWith(
      { uri: 'https://example.com/pt-preview.mp3' },
      { updateInterval: 0.5 },
    );
  });

  test('loadPlaylistTracks throws when not authenticated', async () => {
    (SpotifyAuth.getAccessToken as jest.Mock).mockResolvedValueOnce(null);
    await expect(provider.loadPlaylistTracks('pl1')).rejects.toThrow('not authenticated');
  });
});
