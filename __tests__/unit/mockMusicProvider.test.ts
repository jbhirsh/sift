import { MockMusicProvider } from '../../src/services/MockMusicProvider';

describe('MockMusicProvider', () => {
  let provider: MockMusicProvider;

  beforeEach(() => {
    jest.useFakeTimers();
    provider = new MockMusicProvider();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  /** Await a promise while advancing fake timers so setTimeout-based delays resolve. */
  async function flushAsync<T>(promise: Promise<T>): Promise<T> {
    jest.advanceTimersByTime(1000);
    return promise;
  }

  test('requestAuthorization returns true', async () => {
    const result = await provider.requestAuthorization();
    expect(result).toBe(true);
  });

  test('isAuthorized returns true', async () => {
    const result = await provider.isAuthorized();
    expect(result).toBe(true);
  });

  test('loadLibrary returns 10 tracks', async () => {
    const tracks = await flushAsync(provider.loadLibrary());
    expect(tracks).toHaveLength(10);
    for (const track of tracks) {
      expect(typeof track.id).toBe('string');
      expect(typeof track.name).toBe('string');
      expect(typeof track.artist).toBe('string');
      expect(typeof track.album).toBe('string');
      expect(typeof track.duration).toBe('number');
      expect(typeof track.playCount).toBe('number');
      expect(typeof track.dateAdded).toBe('string');
    }
  });

  test('loadLibrary tracks have valid durations', async () => {
    const tracks = await flushAsync(provider.loadLibrary());
    for (const track of tracks) {
      expect(track.duration).toBeGreaterThan(0);
    }
  });

  test('play sets isPlaying to true', async () => {
    const tracks = await flushAsync(provider.loadLibrary());
    await provider.play(tracks[0].id);
    expect(provider.getPlaybackState().isPlaying).toBe(true);
  });

  test('pause sets isPlaying to false', async () => {
    const tracks = await flushAsync(provider.loadLibrary());
    await provider.play(tracks[0].id);
    await provider.pause();
    expect(provider.getPlaybackState().isPlaying).toBe(false);
  });

  test('resume sets isPlaying back to true', async () => {
    const tracks = await flushAsync(provider.loadLibrary());
    await provider.play(tracks[0].id);
    await provider.pause();
    await provider.resume();
    expect(provider.getPlaybackState().isPlaying).toBe(true);
  });

  test('seek updates position', async () => {
    const tracks = await flushAsync(provider.loadLibrary());
    await provider.play(tracks[0].id);
    provider.seek(30);
    expect(provider.getPlaybackState().position).toBe(30);
  });

  test('getPlaybackState returns position and isPlaying', () => {
    const state = provider.getPlaybackState();
    expect(typeof state.position).toBe('number');
    expect(typeof state.isPlaying).toBe('boolean');
  });

  test('initial state is not playing at position 0', () => {
    const state = provider.getPlaybackState();
    expect(state.isPlaying).toBe(false);
    expect(state.position).toBe(0);
  });

  test('createPlaylist resolves without error', async () => {
    await expect(
      flushAsync(provider.createPlaylist('Test Playlist', ['track-1', 'track-2']))
    ).resolves.toBeUndefined();
  });

  test('pause preserves playback position', async () => {
    const tracks = await flushAsync(provider.loadLibrary());
    await provider.play(tracks[0].id);
    jest.advanceTimersByTime(5000);
    await provider.pause();
    const state = provider.getPlaybackState();
    expect(state.position).toBeGreaterThan(0);
    expect(state.isPlaying).toBe(false);
  });

  test('play with position starts at that position', async () => {
    const tracks = await flushAsync(provider.loadLibrary());
    await provider.play(tracks[0].id, 15);
    expect(provider.getPlaybackState().position).toBe(15);
    expect(provider.getPlaybackState().isPlaying).toBe(true);
  });

  test('position advances over time during playback', async () => {
    const tracks = await flushAsync(provider.loadLibrary());
    await provider.play(tracks[0].id);
    const before = provider.getPlaybackState().position;
    jest.advanceTimersByTime(3000);
    const after = provider.getPlaybackState().position;
    expect(after).toBeGreaterThan(before);
  });

  test('position does not advance while paused', async () => {
    const tracks = await flushAsync(provider.loadLibrary());
    await provider.play(tracks[0].id);
    jest.advanceTimersByTime(2000);
    await provider.pause();
    const posAtPause = provider.getPlaybackState().position;
    jest.advanceTimersByTime(5000);
    expect(provider.getPlaybackState().position).toBe(posAtPause);
  });

  test('resume continues from paused position', async () => {
    const tracks = await flushAsync(provider.loadLibrary());
    await provider.play(tracks[0].id);
    jest.advanceTimersByTime(2000);
    await provider.pause();
    const posAtPause = provider.getPlaybackState().position;
    await provider.resume();
    jest.advanceTimersByTime(1000);
    expect(provider.getPlaybackState().position).toBeGreaterThan(posAtPause);
  });

  test('loadPlaylists returns array of playlists with correct shape', async () => {
    expect(provider.loadPlaylists).toBeDefined();
    const playlists = await flushAsync(provider.loadPlaylists());
    expect(playlists.length).toBeGreaterThan(0);
    for (const playlist of playlists) {
      expect(typeof playlist.id).toBe('string');
      expect(typeof playlist.name).toBe('string');
      expect(typeof playlist.trackCount).toBe('number');
    }
  });

  test('loadPlaylistTracks returns tracks for a valid playlist ID', async () => {
    const playlists = await flushAsync(provider.loadPlaylists());
    const tracks = await flushAsync(provider.loadPlaylistTracks(playlists[0].id));
    expect(tracks.length).toBeGreaterThan(0);
    for (const track of tracks) {
      expect(typeof track.id).toBe('string');
      expect(typeof track.name).toBe('string');
      expect(typeof track.artist).toBe('string');
      expect(typeof track.duration).toBe('number');
    }
  });

  test('loadPlaylistTracks returns empty array for unknown playlist ID', async () => {
    const tracks = await flushAsync(provider.loadPlaylistTracks('nonexistent'));
    expect(tracks).toEqual([]);
  });
});
