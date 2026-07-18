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

  test('seeds an already-sifted companion playlist for the re-sift E2E flow', async () => {
    const playlists = await flushAsync(provider.loadPlaylists());
    const roadTrip = playlists.find((p) => p.name === 'Road Trip');
    const sifted = playlists.find((p) => p.name === 'Road Trip - Sifted');
    if (!roadTrip || !sifted) {
      throw new Error('Road Trip and Road Trip - Sifted must both be seeded');
    }

    // The companion's tracks must be a subset of the source playlist so the
    // sifted-filtering path stays coherent.
    const sourceTracks = await flushAsync(provider.loadPlaylistTracks(roadTrip.id));
    const siftedTracks = await flushAsync(provider.loadPlaylistTracks(sifted.id));
    expect(siftedTracks.length).toBeGreaterThan(0);
    const sourceIds = new Set(sourceTracks.map((t) => t.id));
    for (const track of siftedTracks) {
      expect(sourceIds.has(track.id)).toBe(true);
    }
  });

  test('pause when not playing is a no-op', async () => {
    const stateBefore = provider.getPlaybackState();
    await provider.pause();
    expect(provider.getPlaybackState()).toEqual(stateBefore);
  });

  test('resume when already playing is a no-op', async () => {
    const tracks = await flushAsync(provider.loadLibrary());
    await provider.play(tracks[0].id);
    const stateBeforeResume = provider.getPlaybackState();
    await provider.resume();
    expect(provider.getPlaybackState().isPlaying).toBe(true);
    expect(provider.getPlaybackState().position).toBeCloseTo(stateBeforeResume.position, 0);
  });

  test('seek clamps to 0 when given negative position', async () => {
    const tracks = await flushAsync(provider.loadLibrary());
    await provider.play(tracks[0].id);
    provider.seek(-10);
    expect(provider.getPlaybackState().position).toBe(0);
  });

  test('seek clamps to track duration', async () => {
    const tracks = await flushAsync(provider.loadLibrary());
    await provider.play(tracks[0].id);
    provider.seek(99999);
    expect(provider.getPlaybackState().position).toBe(tracks[0].duration);
  });

  test('play with unknown track uses default duration', async () => {
    await provider.play('nonexistent-id');
    expect(provider.getPlaybackState().isPlaying).toBe(true);
    expect(provider.getPlaybackState().position).toBe(0);
  });

  test('position does not exceed track duration', async () => {
    const tracks = await flushAsync(provider.loadLibrary());
    await provider.play(tracks[4].id); // Stay (141s)
    jest.advanceTimersByTime(200000);
    expect(provider.getPlaybackState().position).toBe(141);
  });
});

describe('MockMusicProvider failure injection (EXPO_PUBLIC_MOCK_FAIL_ADDS / _REMOVES)', () => {
  const ENV_KEY = 'EXPO_PUBLIC_MOCK_FAIL_ADDS';
  const REMOVES_ENV_KEY = 'EXPO_PUBLIC_MOCK_FAIL_REMOVES';
  let originalValue: string | undefined;
  let originalRemovesValue: string | undefined;

  beforeEach(() => {
    originalValue = process.env[ENV_KEY];
    originalRemovesValue = process.env[REMOVES_ENV_KEY];
  });

  afterEach(() => {
    if (originalValue === undefined) {
      delete process.env.EXPO_PUBLIC_MOCK_FAIL_ADDS;
    } else {
      process.env[ENV_KEY] = originalValue;
    }
    if (originalRemovesValue === undefined) {
      delete process.env.EXPO_PUBLIC_MOCK_FAIL_REMOVES;
    } else {
      process.env[REMOVES_ENV_KEY] = originalRemovesValue;
    }
  });

  /**
   * Fresh copy of the module so its launch-wide failure counter starts at
   * zero — mirroring a fresh app launch, which is the knob's unit of scope.
   */
  function freshMockClass(): typeof MockMusicProvider {
    let fresh: typeof MockMusicProvider | undefined;
    jest.isolateModules(() => {
      ({ MockMusicProvider: fresh } = require('../../src/services/MockMusicProvider'));
    });
    if (!fresh) throw new Error('failed to isolate MockMusicProvider module');
    return fresh;
  }

  test('default: with the env unset, addToPlaylist and removeFromLibrary never reject', async () => {
    delete process.env.EXPO_PUBLIC_MOCK_FAIL_ADDS;
    delete process.env.EXPO_PUBLIC_MOCK_FAIL_REMOVES;
    const Fresh = freshMockClass();
    const provider = new Fresh();
    await expect(provider.addToPlaylist('p1', ['t1'])).resolves.toBeUndefined();
    await expect(provider.addToPlaylist('p1', ['t2'])).resolves.toBeUndefined();
    await expect(provider.removeFromLibrary(['t1'])).resolves.toBeUndefined();
    await expect(provider.removeFromLibrary(['t2'])).resolves.toBeUndefined();
  });

  test('"2" rejects the first two adds launch-wide (across instances), then succeeds', async () => {
    process.env[ENV_KEY] = '2';
    const Fresh = freshMockClass();
    // Two instances on purpose: in the app every useMusicProvider hook
    // constructs its own provider (keeps add through the sifting screen's,
    // the Done fallback saves through its own), and the injection must
    // count them as one series or the E2E flow could never reach the
    // failed-save state.
    const first = new Fresh();
    const second = new Fresh();
    await expect(first.addToPlaylist('p1', ['t1'])).rejects.toThrow(
      'Simulated add failure (EXPO_PUBLIC_MOCK_FAIL_ADDS)',
    );
    await expect(second.addToPlaylist('p1', ['t2'])).rejects.toThrow(
      'Simulated add failure (EXPO_PUBLIC_MOCK_FAIL_ADDS)',
    );
    await expect(first.addToPlaylist('p1', ['t3'])).resolves.toBeUndefined();
    await expect(second.addToPlaylist('p1', ['t4'])).resolves.toBeUndefined();
  });

  test('FAIL_REMOVES=1 rejects the first removeFromLibrary launch-wide, then succeeds; playlist removes and adds are untouched', async () => {
    process.env[REMOVES_ENV_KEY] = '1';
    const Fresh = freshMockClass();
    const provider = new Fresh();
    await expect(provider.removeFromLibrary(['t1'])).rejects.toThrow(
      'Simulated remove failure (EXPO_PUBLIC_MOCK_FAIL_REMOVES)',
    );
    await expect(provider.removeFromLibrary(['t2'])).resolves.toBeUndefined();
    // removeFromPlaylist is deliberately never injected (Start Over /
    // Re-sift clears depend on it), and adds have their own knob.
    await expect(provider.removeFromPlaylist('p1', ['t1'])).resolves.toBeUndefined();
    await expect(provider.addToPlaylist('p1', ['t1'])).resolves.toBeUndefined();
  });

  test('invalid or negative knob values inject nothing', async () => {
    process.env[ENV_KEY] = 'nonsense';
    let Fresh = freshMockClass();
    await expect(new Fresh().addToPlaylist('p1', ['t1'])).resolves.toBeUndefined();

    process.env[ENV_KEY] = '-3';
    Fresh = freshMockClass();
    await expect(new Fresh().addToPlaylist('p1', ['t1'])).resolves.toBeUndefined();
  });
});
