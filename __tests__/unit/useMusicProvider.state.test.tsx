import React, { useEffect } from 'react';
import { render, act } from '@testing-library/react-native';
import { Alert, Linking } from 'react-native';
import * as Sentry from '@sentry/react-native';
import { SiftProvider, useSift } from '../../src/context/SiftContext';
import { useMusicProvider } from '../../src/hooks/useMusicProvider';
import { loadHistory, logRemoval, removeFromHistory } from '../../src/services/RemovalHistoryStore';
import type { MusicProviderService } from '../../src/services/MusicProviderInterface';
import { Playlist, Track } from '../../src/types';

// Companion to useMusicProvider.test.tsx. That file wires provider calls;
// this one asserts the hook's observable outcomes: the state it leaves in
// SiftContext, its return values, the alerts it raises, and the error
// messages users actually see.

jest.mock('@sentry/react-native', () => ({
  setTag: jest.fn(),
  setContext: jest.fn(),
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
}));

jest.mock('../../src/services/SessionStore', () => ({
  hasSession: jest.fn().mockResolvedValue(false),
  saveSession: jest.fn().mockResolvedValue(undefined),
  loadSession: jest.fn().mockResolvedValue(null),
  clearSession: jest.fn().mockResolvedValue(undefined),
}));

const mockProvider = {
  requestAuthorization: jest.fn().mockResolvedValue(true),
  isAuthorized: jest.fn().mockResolvedValue(true),
  loadLibrary: jest.fn().mockResolvedValue([]),
  loadPlaylists: jest.fn().mockResolvedValue([]),
  loadPlaylistTracks: jest.fn().mockResolvedValue([]),
  play: jest.fn().mockResolvedValue(undefined),
  pause: jest.fn().mockResolvedValue(undefined),
  resume: jest.fn().mockResolvedValue(undefined),
  seek: jest.fn(),
  getPlaybackState: jest.fn().mockReturnValue({ position: 30, isPlaying: true }),
  createPlaylist: jest.fn().mockResolvedValue(undefined),
  removeFromPlaylist: jest.fn().mockResolvedValue(undefined),
  removeFromLibrary: jest.fn().mockResolvedValue(undefined),
  addToPlaylist: jest.fn().mockResolvedValue(undefined),
  addToLibrary: jest.fn().mockResolvedValue(undefined),
  warmSongCache: jest.fn().mockResolvedValue(undefined),
};

// The active provider is swappable per test so we can exercise providers
// that implement only the required subset of MusicProviderService (every
// optional method missing) — the hook must degrade gracefully, not crash.
let mockActiveProvider: unknown;

jest.mock('../../src/services', () => ({
  createMusicProvider: jest.fn(() => mockActiveProvider),
  MusicProviderService: {},
}));

/**
 * A provider implementing only the REQUIRED interface methods. `extras`
 * grafts on individual optional methods so a test can probe one capability
 * at a time.
 */
function makeMinimalProvider(extras?: Partial<MusicProviderService>): MusicProviderService {
  return {
    requestAuthorization: jest.fn().mockResolvedValue(true),
    isAuthorized: jest.fn().mockResolvedValue(true),
    loadLibrary: jest.fn().mockResolvedValue([]),
    play: jest.fn().mockResolvedValue(undefined),
    pause: jest.fn().mockResolvedValue(undefined),
    resume: jest.fn().mockResolvedValue(undefined),
    seek: jest.fn(),
    getPlaybackState: jest.fn().mockReturnValue({ position: 0, isPlaying: false }),
    createPlaylist: jest.fn().mockResolvedValue(undefined),
    ...extras,
  };
}

jest.mock('../../src/services/RemovalHistoryStore', () => ({
  logRemoval: jest.fn(() => Promise.resolve()),
  loadHistory: jest.fn(() => Promise.resolve([])),
  removeFromHistory: jest.fn(() => Promise.resolve()),
  clearHistoryForSource: jest.fn(() => Promise.resolve()),
}));

// React Native's index re-exports these modules via `.default`, so the mock
// must provide that key — a bare object would make the import resolve to
// undefined and every Alert.alert call would throw instead of alerting.
jest.mock('react-native/Libraries/Alert/Alert', () => ({
  __esModule: true,
  default: { alert: jest.fn() },
}));

jest.mock('react-native/Libraries/Linking/Linking', () => ({
  __esModule: true,
  default: { openSettings: jest.fn(), openURL: jest.fn() },
}));

const mockTrack: Track = {
  id: '1', name: 'Track A', artist: 'Artist A', album: 'Album A',
  duration: 200, playCount: 10, dateAdded: '2020-01-01T00:00:00.000Z',
};

const mockTrackB: Track = {
  id: '2', name: 'Track B', artist: 'Artist B', album: 'Album B',
  duration: 180, playCount: 3, dateAdded: '2020-02-01T00:00:00.000Z',
};

// Deliberately unsorted by playCount so a real sort is observable.
const unsortedTracks: Track[] = [
  { id: 'high', name: 'High', artist: 'A', album: 'A', duration: 200, playCount: 10, dateAdded: '2020-01-01T00:00:00.000Z' },
  { id: 'low', name: 'Low', artist: 'B', album: 'B', duration: 200, playCount: 3, dateAdded: '2020-01-01T00:00:00.000Z' },
  { id: 'mid', name: 'Mid', artist: 'C', album: 'C', duration: 200, playCount: 5, dateAdded: '2020-01-01T00:00:00.000Z' },
];

// ── Harness ────────────────────────────────────────────
// Captures the hook API and the context value after every committed render
// (in an effect, per the rules of React) so tests can call methods directly
// and read the resulting state without testID plumbing. Effects flush inside
// act(), so both bindings are current after every `await act(...)`.

let api!: ReturnType<typeof useMusicProvider>;
let sift!: ReturnType<typeof useSift>;

function Harness() {
  const currentApi = useMusicProvider();
  const currentSift = useSift();
  useEffect(() => {
    api = currentApi;
    sift = currentSift;
  });
  return null;
}

function renderHarness(initialTracks?: Track[]) {
  return render(
    <SiftProvider initialTracks={initialTracks}>
      <Harness />
    </SiftProvider>,
  );
}

async function setPlaylistSource() {
  await act(async () => {
    sift.dispatch({
      type: 'SET_SOURCE',
      source: { type: 'playlist', playlist: { id: 'p1', name: 'My Playlist', trackCount: 5 } },
    });
  });
}

interface AlertButtonLike {
  text?: string;
  style?: string;
  onPress?: () => void;
}

function lastAlertButtons(): AlertButtonLike[] {
  const calls = (Alert.alert as jest.Mock).mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  return calls[calls.length - 1][2] as AlertButtonLike[];
}

describe('useMusicProvider — observable state', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockActiveProvider = mockProvider;
    mockProvider.requestAuthorization.mockResolvedValue(true);
    mockProvider.isAuthorized.mockResolvedValue(true);
    mockProvider.loadLibrary.mockResolvedValue([mockTrack]);
    mockProvider.loadPlaylists.mockResolvedValue([]);
    mockProvider.loadPlaylistTracks.mockResolvedValue([mockTrack]);
    mockProvider.play.mockResolvedValue(undefined);
    mockProvider.pause.mockResolvedValue(undefined);
    mockProvider.resume.mockResolvedValue(undefined);
    mockProvider.createPlaylist.mockResolvedValue(undefined);
    mockProvider.removeFromPlaylist.mockResolvedValue(undefined);
    mockProvider.removeFromLibrary.mockResolvedValue(undefined);
    mockProvider.addToPlaylist.mockResolvedValue(undefined);
    mockProvider.addToLibrary.mockResolvedValue(undefined);
    mockProvider.warmSongCache.mockResolvedValue(undefined);
    mockProvider.getPlaybackState.mockReturnValue({ position: 30, isPlaying: true });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ── Authorization & connection status ────────────────

  test('authorize surfaces checking → connected and returns the grant', async () => {
    let resolveAuth!: (granted: boolean) => void;
    mockProvider.requestAuthorization.mockImplementationOnce(
      () => new Promise<boolean>((res) => { resolveAuth = res; }),
    );
    renderHarness([mockTrack]);

    let pending!: Promise<boolean>;
    await act(async () => {
      pending = api.authorize();
    });
    // While the consent prompt is open the UI shows the in-progress state.
    expect(sift.state.connectionStatus).toBe('checking');

    let granted = false;
    await act(async () => {
      resolveAuth(true);
      granted = await pending;
    });
    expect(granted).toBe(true);
    expect(sift.state.connectionStatus).toBe('connected');
  });

  test('authorize denial reports disconnected and returns false', async () => {
    mockProvider.requestAuthorization.mockResolvedValueOnce(false);
    renderHarness([mockTrack]);

    let granted = true;
    await act(async () => {
      granted = await api.authorize();
    });
    expect(granted).toBe(false);
    expect(sift.state.connectionStatus).toBe('disconnected');
  });

  test('authorize failure reports disconnected, returns false, and captures the error', async () => {
    const boom = new Error('auth boom');
    mockProvider.requestAuthorization.mockRejectedValueOnce(boom);
    renderHarness([mockTrack]);

    let granted = true;
    await act(async () => {
      granted = await api.authorize();
    });
    expect(granted).toBe(false);
    expect(sift.state.connectionStatus).toBe('disconnected');
    expect(Sentry.captureException).toHaveBeenCalledWith(boom, { tags: { flow: 'authorize' } });
  });

  test('isAuthorized passes the provider answer through', async () => {
    renderHarness([mockTrack]);

    mockProvider.isAuthorized.mockResolvedValueOnce(false);
    let authorized = true;
    await act(async () => {
      authorized = await api.isAuthorized();
    });
    expect(authorized).toBe(false);

    mockProvider.isAuthorized.mockResolvedValueOnce(true);
    await act(async () => {
      authorized = await api.isAuthorized();
    });
    expect(authorized).toBe(true);
  });

  // ── Playback state ───────────────────────────────────

  test('play marks playing and restarts the position (or starts at the given one)', async () => {
    renderHarness([mockTrack]);

    // Move the position first so the reset to 0 is observable.
    await act(async () => {
      api.seek(42);
    });
    expect(sift.state.playbackPosition).toBe(42);
    expect(mockProvider.seek).toHaveBeenCalledWith(42);

    await act(async () => {
      await api.play('1');
    });
    expect(sift.state.isPlaying).toBe(true);
    expect(sift.state.playbackPosition).toBe(0);

    await act(async () => {
      await api.play('1', 30);
    });
    expect(sift.state.playbackPosition).toBe(30);
  });

  test('a failed play never claims to be playing', async () => {
    mockProvider.play.mockRejectedValueOnce(new Error('no session'));
    renderHarness([mockTrack]);

    await act(async () => {
      await api.play('1');
    });
    expect(sift.state.isPlaying).toBe(false);
    expect(sift.state.playbackPosition).toBe(0);
  });

  test('pause and resume flip isPlaying only when the provider call succeeds', async () => {
    renderHarness([mockTrack]);
    await act(async () => {
      await api.play('1');
    });
    expect(sift.state.isPlaying).toBe(true);

    await act(async () => {
      await api.pause();
    });
    expect(sift.state.isPlaying).toBe(false);

    await act(async () => {
      await api.resume();
    });
    expect(sift.state.isPlaying).toBe(true);

    // Failed pause: still playing — claiming "paused" would desync the UI.
    mockProvider.pause.mockRejectedValueOnce(new Error('fail'));
    await act(async () => {
      await api.pause();
    });
    expect(sift.state.isPlaying).toBe(true);
  });

  test('skipForward jumps 15s ahead and clamps at the track duration', () => {
    renderHarness([mockTrack]); // duration 200

    mockProvider.getPlaybackState.mockReturnValue({ position: 30, isPlaying: true });
    act(() => {
      api.skipForward();
    });
    expect(mockProvider.seek).toHaveBeenCalledWith(45);
    expect(sift.state.playbackPosition).toBe(45);

    mockProvider.getPlaybackState.mockReturnValue({ position: 195, isPlaying: true });
    act(() => {
      api.skipForward();
    });
    expect(mockProvider.seek).toHaveBeenLastCalledWith(200);
    expect(sift.state.playbackPosition).toBe(200);
  });

  test('skipForward without a current track is a no-op', () => {
    renderHarness(); // no tracks loaded
    act(() => {
      api.skipForward();
    });
    expect(mockProvider.seek).not.toHaveBeenCalled();
    expect(sift.state.playbackPosition).toBe(0);
  });

  test('skipBackward rewinds 15s and clamps at zero', () => {
    renderHarness([mockTrack]);

    mockProvider.getPlaybackState.mockReturnValue({ position: 30, isPlaying: true });
    act(() => {
      api.skipBackward();
    });
    expect(mockProvider.seek).toHaveBeenCalledWith(15);
    expect(sift.state.playbackPosition).toBe(15);

    mockProvider.getPlaybackState.mockReturnValue({ position: 5, isPlaying: true });
    act(() => {
      api.skipBackward();
    });
    expect(mockProvider.seek).toHaveBeenLastCalledWith(0);
    expect(sift.state.playbackPosition).toBe(0);
  });

  test('polling mirrors the provider position every 500ms and stops on pause', async () => {
    renderHarness([mockTrack]);
    await act(async () => {
      await api.play('1');
    });
    expect(sift.state.playbackPosition).toBe(0);

    mockProvider.getPlaybackState.mockReturnValue({ position: 7.5, isPlaying: true });
    await act(async () => {
      jest.advanceTimersByTime(500);
    });
    expect(sift.state.playbackPosition).toBe(7.5);

    await act(async () => {
      await api.pause();
    });
    const callsAfterPause = mockProvider.getPlaybackState.mock.calls.length;
    mockProvider.getPlaybackState.mockReturnValue({ position: 99, isPlaying: false });
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    // No further polls once paused — the position must not drift.
    expect(mockProvider.getPlaybackState.mock.calls.length).toBe(callsAfterPause);
    expect(sift.state.playbackPosition).toBe(7.5);
  });

  // ── Load flows ───────────────────────────────────────

  test('loadLibrary walks the progress journey and lands sorted in sifting', async () => {
    let resolveAuthCheck!: (authorized: boolean) => void;
    let resolveLibrary!: (tracks: Track[]) => void;
    mockProvider.isAuthorized.mockImplementationOnce(
      () => new Promise<boolean>((res) => { resolveAuthCheck = res; }),
    );
    mockProvider.loadLibrary.mockImplementationOnce(
      () => new Promise<Track[]>((res) => { resolveLibrary = res; }),
    );
    renderHarness();

    let pending!: Promise<void>;
    await act(async () => {
      pending = api.loadLibrary();
    });
    expect(sift.state.phase).toBe('loading');
    expect(sift.state.loadProgress).toBe(0);
    expect(sift.state.loadMessage).toBe('Loading library…');

    await act(async () => {
      resolveAuthCheck(true);
    });
    expect(sift.state.loadProgress).toBe(0.3);
    expect(sift.state.loadMessage).toBe('Fetching tracks…');

    await act(async () => {
      resolveLibrary(unsortedTracks);
      await pending;
    });
    expect(sift.state.phase).toBe('sifting');
    expect(sift.state.loadProgress).toBe(1);
    expect(sift.state.loadMessage).toBe('Sorting tracks…');
    // Default sort is least-played: ascending playCount.
    expect(sift.state.tracks.map((t) => t.playCount)).toEqual([3, 5, 10]);
  });

  test('loadLibrary failure surfaces the reason and returns to setup', async () => {
    mockProvider.loadLibrary.mockRejectedValueOnce(new Error('load fail'));
    renderHarness();

    await act(async () => {
      await api.loadLibrary();
    });
    expect(sift.state.loadError).toBe('load fail');
    expect(sift.state.phase).toBe('setup');
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      { tags: { flow: 'load-library' } },
    );

    // Non-Error rejections get the generic message.
    mockProvider.loadLibrary.mockRejectedValueOnce('string error');
    await act(async () => {
      await api.loadLibrary();
    });
    expect(sift.state.loadError).toBe('Failed to load library');
  });

  test('loadLibrary denial explains the requirement and offers Open Settings', async () => {
    mockProvider.isAuthorized.mockResolvedValue(false);
    mockProvider.requestAuthorization.mockResolvedValue(false);
    renderHarness();

    await act(async () => {
      await api.loadLibrary();
    });

    expect(sift.state.loadError).toBe('Music library access is required to use Sift.');
    expect(sift.state.phase).toBe('setup');
    expect(mockProvider.loadLibrary).not.toHaveBeenCalled();

    expect(Alert.alert).toHaveBeenCalledWith(
      'Music Access Required',
      'Sift needs access to your music library. Please enable it in Settings.',
      [
        expect.objectContaining({ text: 'Cancel', style: 'cancel' }),
        expect.objectContaining({ text: 'Open Settings' }),
      ],
    );
    const buttons = lastAlertButtons();
    // Cancel must stay a plain dismiss…
    expect(buttons[0]?.onPress).toBeUndefined();
    // …while Open Settings deep-links into the system settings pane.
    expect(typeof buttons[1]?.onPress).toBe('function');
    buttons[1]?.onPress?.();
    expect(Linking.openSettings).toHaveBeenCalledTimes(1);
  });

  test('loadTracks denial raises the same settings alert for a playlist source', async () => {
    mockProvider.isAuthorized.mockResolvedValue(false);
    mockProvider.requestAuthorization.mockResolvedValue(false);
    renderHarness([]);
    await setPlaylistSource();

    await act(async () => {
      await api.loadTracks();
    });

    expect(sift.state.loadError).toBe('Music library access is required to use Sift.');
    expect(sift.state.phase).toBe('setup');
    expect(mockProvider.loadPlaylistTracks).not.toHaveBeenCalled();

    expect(Alert.alert).toHaveBeenCalledWith(
      'Music Access Required',
      'Sift needs access to your music library. Please enable it in Settings.',
      [
        expect.objectContaining({ text: 'Cancel', style: 'cancel' }),
        expect.objectContaining({ text: 'Open Settings' }),
      ],
    );
    const buttons = lastAlertButtons();
    buttons[1]?.onPress?.();
    expect(Linking.openSettings).toHaveBeenCalledTimes(1);
  });

  test('loadTracks names the playlist and walks the progress journey', async () => {
    let resolveAuthCheck!: (authorized: boolean) => void;
    let resolveTracks!: (tracks: Track[]) => void;
    mockProvider.isAuthorized.mockImplementationOnce(
      () => new Promise<boolean>((res) => { resolveAuthCheck = res; }),
    );
    mockProvider.loadPlaylistTracks.mockImplementationOnce(
      () => new Promise<Track[]>((res) => { resolveTracks = res; }),
    );
    renderHarness([]);
    await setPlaylistSource();

    let pending!: Promise<void>;
    await act(async () => {
      pending = api.loadTracks();
    });
    expect(sift.state.phase).toBe('loading');
    expect(sift.state.loadProgress).toBe(0);
    expect(sift.state.loadMessage).toBe('Loading "My Playlist"…');

    await act(async () => {
      resolveAuthCheck(true);
    });
    expect(sift.state.loadProgress).toBe(0.3);
    expect(sift.state.loadMessage).toBe('Fetching tracks…');

    await act(async () => {
      resolveTracks([mockTrack]);
      await pending;
    });
    expect(mockProvider.loadPlaylistTracks).toHaveBeenCalledWith('p1');
    expect(sift.state.phase).toBe('sifting');
    expect(sift.state.loadProgress).toBe(1);
    expect(sift.state.loadMessage).toBe('Sorting tracks…');
  });

  test('loadTracks ignores a second call while one is in flight, then accepts new ones', async () => {
    let resolveAuthCheck!: (authorized: boolean) => void;
    mockProvider.isAuthorized.mockImplementationOnce(
      () => new Promise<boolean>((res) => { resolveAuthCheck = res; }),
    );
    renderHarness();

    let first!: Promise<void>;
    await act(async () => {
      first = api.loadTracks();
    });
    expect(sift.state.loadMessage).toBe('Loading library…');

    // Re-entry while loading: skipped outright, no second provider hit.
    await act(async () => {
      await api.loadTracks();
    });
    expect(mockProvider.isAuthorized).toHaveBeenCalledTimes(1);
    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('already in progress') }),
    );

    await act(async () => {
      resolveAuthCheck(true);
      await first;
    });
    expect(mockProvider.loadLibrary).toHaveBeenCalledTimes(1);
    expect(sift.state.phase).toBe('sifting');

    // The guard must release once the load settles.
    await act(async () => {
      await api.loadTracks();
    });
    expect(mockProvider.loadLibrary).toHaveBeenCalledTimes(2);
  });

  test('loadTracks proceeds when authorization is granted at the prompt', async () => {
    mockProvider.isAuthorized.mockResolvedValueOnce(false);
    mockProvider.requestAuthorization.mockResolvedValueOnce(true);
    renderHarness([]);
    await setPlaylistSource();

    await act(async () => {
      await api.loadTracks();
    });
    // Granted on prompt: the load continues instead of erroring out.
    expect(mockProvider.loadPlaylistTracks).toHaveBeenCalledWith('p1');
    expect(sift.state.phase).toBe('sifting');
    expect(sift.state.loadError).toBeNull();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  test('loadTracks surfaces a clear error when the provider cannot load playlists', async () => {
    mockProvider.loadPlaylistTracks.mockResolvedValueOnce(undefined);
    renderHarness([]);
    await setPlaylistSource();

    await act(async () => {
      await api.loadTracks();
    });
    expect(sift.state.loadError).toBe('This provider does not support playlist loading');
    expect(sift.state.phase).toBe('setup');
  });

  test('loadTracks failure surfaces the reason, generic for non-Errors', async () => {
    mockProvider.loadLibrary.mockRejectedValueOnce(new Error('load fail'));
    renderHarness();

    await act(async () => {
      await api.loadTracks();
    });
    expect(sift.state.loadError).toBe('load fail');
    expect(sift.state.phase).toBe('setup');
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      { tags: { flow: 'load-tracks' } },
    );

    mockProvider.loadLibrary.mockRejectedValueOnce('string error');
    await act(async () => {
      await api.loadTracks();
    });
    expect(sift.state.loadError).toBe('Failed to load tracks');
  });

  test('loadPlaylists returns [] on denial without querying, and the list once granted', async () => {
    renderHarness();

    mockProvider.isAuthorized.mockResolvedValueOnce(false);
    mockProvider.requestAuthorization.mockResolvedValueOnce(false);
    let result!: Playlist[];
    await act(async () => {
      result = await api.loadPlaylists();
    });
    expect(result).toEqual([]);
    expect(mockProvider.loadPlaylists).not.toHaveBeenCalled();

    // A late grant proceeds to the real listing.
    const playlists: Playlist[] = [{ id: 'p1', name: 'My Playlist', trackCount: 5 }];
    mockProvider.isAuthorized.mockResolvedValueOnce(false);
    mockProvider.requestAuthorization.mockResolvedValueOnce(true);
    mockProvider.loadPlaylists.mockResolvedValueOnce(playlists);
    await act(async () => {
      result = await api.loadPlaylists();
    });
    expect(result).toEqual(playlists);

    // Errors degrade to an empty list, never a throw — but are reported.
    mockProvider.loadPlaylists.mockRejectedValueOnce(new Error('fail'));
    await act(async () => {
      result = await api.loadPlaylists();
    });
    expect(result).toEqual([]);
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      { tags: { flow: 'load-playlists' } },
    );
  });

  // ── Remove / restore ─────────────────────────────────

  test('removeTrack logs full removal context and deletes from the library', async () => {
    renderHarness([mockTrack]);

    await act(async () => {
      await api.removeTrack(mockTrack);
    });
    expect(logRemoval).toHaveBeenCalledWith({
      track: mockTrack,
      source: { type: 'library' },
      provider: 'apple-music',
      removedAt: expect.any(String),
    });
    expect(mockProvider.removeFromLibrary).toHaveBeenCalledWith(['1']);
    expect(mockProvider.removeFromPlaylist).not.toHaveBeenCalled();
    expect(sift.state.removalErrors).toEqual([]);
  });

  test('removeTrack failure records the track name but still logs the intent', async () => {
    mockProvider.removeFromLibrary.mockRejectedValueOnce(new Error('network'));
    renderHarness([mockTrack]);

    await act(async () => {
      await api.removeTrack(mockTrack);
    });
    expect(sift.state.removalErrors).toEqual(['Track A']);
    // The user's intent is what matters — it is logged before the attempt.
    expect(logRemoval).toHaveBeenCalledTimes(1);
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      { tags: { flow: 'remove-track' } },
    );
  });

  test('restoreTrack moves the track from removed back to kept', async () => {
    renderHarness([mockTrack]);

    await act(async () => {
      sift.dispatch({ type: 'DECIDE', decision: 'remove' });
    });
    expect(sift.state.removed.map((t) => t.id)).toEqual(['1']);

    await act(async () => {
      await api.restoreTrack(mockTrack);
    });
    expect(sift.state.removed).toEqual([]);
    expect(sift.state.kept.map((t) => t.id)).toEqual(['1']);
    expect(removeFromHistory).toHaveBeenCalledWith('1', { type: 'library' });
  });

  test('restoreTrack failure surfaces "name: reason" and keeps the history record', async () => {
    mockProvider.addToLibrary.mockRejectedValueOnce(new Error('network down'));
    renderHarness([mockTrack]);

    await act(async () => {
      await api.restoreTrack(mockTrack);
    });
    expect(sift.state.removalErrors).toEqual(['Track A: network down']);
    expect(removeFromHistory).not.toHaveBeenCalled();
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      { tags: { flow: 'restore-track' } },
    );

    // Non-Error rejections get the generic reason.
    mockProvider.addToLibrary.mockRejectedValueOnce('boom');
    await act(async () => {
      await api.restoreTrack(mockTrack);
    });
    expect(sift.state.removalErrors).toEqual([
      'Track A: network down',
      'Track A: Failed to restore track',
    ]);
  });

  // ── createPlaylist lifecycle ─────────────────────────

  test('createPlaylist shows busy while running, then created, and clears stale errors', async () => {
    let resolveCreate!: () => void;
    mockProvider.createPlaylist.mockImplementationOnce(
      () => new Promise<void>((res) => { resolveCreate = () => res(); }),
    );
    renderHarness([mockTrack]);

    // Seed a stale error from a previous attempt to prove a retry clears it.
    await act(async () => {
      sift.dispatch({ type: 'SET_PLAYLIST_ERROR', error: 'stale' });
    });

    let pending!: Promise<void>;
    await act(async () => {
      pending = api.createPlaylist('Removed by Sift', ['1']);
    });
    expect(sift.state.isCreatingPlaylist).toBe(true);
    expect(sift.state.removalPlaylistError).toBeNull();
    expect(sift.state.removalPlaylistCreated).toBe(false);

    await act(async () => {
      resolveCreate();
      await pending;
    });
    expect(sift.state.isCreatingPlaylist).toBe(false);
    expect(sift.state.removalPlaylistCreated).toBe(true);
    expect(mockProvider.createPlaylist).toHaveBeenCalledWith('Removed by Sift', ['1']);
  });

  test('createPlaylist failure surfaces the message and always clears busy', async () => {
    mockProvider.createPlaylist.mockRejectedValueOnce(new Error('quota exceeded'));
    renderHarness([mockTrack]);

    await act(async () => {
      await api.createPlaylist('Removed by Sift', ['1']);
    });
    expect(sift.state.removalPlaylistError).toBe('quota exceeded');
    expect(sift.state.removalPlaylistCreated).toBe(false);
    expect(sift.state.isCreatingPlaylist).toBe(false);
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      { tags: { flow: 'create-playlist' } },
    );

    mockProvider.createPlaylist.mockRejectedValueOnce('boom');
    await act(async () => {
      await api.createPlaylist('Removed by Sift', ['1']);
    });
    expect(sift.state.removalPlaylistError).toBe('Failed to create playlist');
  });

  // ── saveSiftedPlaylist ───────────────────────────────

  test('saveSiftedPlaylist recognizes an already-present track under a different id', async () => {
    mockProvider.loadPlaylists.mockResolvedValue([
      { id: 'sifted-1', name: 'My Playlist - Sifted', trackCount: 1 },
    ]);
    // Readback: same song, but under the library-instance id Apple Music
    // assigned when it landed.
    mockProvider.loadPlaylistTracks.mockResolvedValue([{ ...mockTrack, id: 'lib-99' }]);
    renderHarness([mockTrack]);

    await act(async () => {
      sift.dispatch({ type: 'ADD_PENDING_KEEP', track: mockTrack });
    });
    // A stale error from an earlier failed attempt must not outlive a retry.
    await act(async () => {
      sift.dispatch({ type: 'SET_PLAYLIST_ERROR', error: 'stale' });
    });
    await act(async () => {
      await api.saveSiftedPlaylist('My Playlist', [mockTrack]);
    });

    // Identity match: never re-added under a second id…
    expect(mockProvider.addToPlaylist).not.toHaveBeenCalled();
    expect(mockProvider.createPlaylist).not.toHaveBeenCalled();
    // …yet the save still counts as success and covers the snapshot.
    expect(sift.state.removalPlaylistCreated).toBe(true);
    expect(sift.state.pendingKeeps).toEqual([]);
    expect(sift.state.removalPlaylistError).toBeNull();
  });

  test('a failed save repairs pendingKeeps via an id-resolved, identity-matched readback', async () => {
    // The companion was renamed, so only the persisted id can find it — in
    // the repair path too, or every landed track would stay buffered.
    mockProvider.loadPlaylists.mockResolvedValue([
      { id: 'sifted-renamed', name: 'Custom Name', trackCount: 0 },
    ]);
    mockProvider.loadPlaylistTracks
      .mockResolvedValueOnce([]) // pre-add diff: nothing present yet
      .mockResolvedValueOnce([{ ...mockTrack, id: 'lib-77' }]); // post-failure: track 1 landed under a fresh id
    mockProvider.addToPlaylist.mockRejectedValueOnce(
      new Error('1 of 2 tracks could not be added'),
    );
    renderHarness([mockTrack, mockTrackB]);

    await act(async () => {
      sift.dispatch({ type: 'SET_SIFTED_PLAYLIST_ID', id: 'sifted-renamed' });
    });
    await act(async () => {
      sift.dispatch({ type: 'ADD_PENDING_KEEP', track: mockTrack });
    });
    await act(async () => {
      sift.dispatch({ type: 'ADD_PENDING_KEEP', track: mockTrackB });
    });

    await act(async () => {
      await api.saveSiftedPlaylist('My Playlist', [mockTrack, mockTrackB]);
    });

    expect(mockProvider.addToPlaylist).toHaveBeenCalledWith('sifted-renamed', ['1', '2']);
    // The repair read the playlist back by id…
    expect(mockProvider.loadPlaylistTracks).toHaveBeenLastCalledWith('sifted-renamed');
    // …and dropped exactly the track that landed (matched by identity).
    expect(sift.state.pendingKeeps.map((t) => t.id)).toEqual(['2']);
    expect(sift.state.removalPlaylistError).toBe('1 of 2 tracks could not be added');
    expect(sift.state.isCreatingPlaylist).toBe(false);
    expect(sift.state.removalPlaylistCreated).toBe(false);
  });

  test('a failed save whose readback also fails keeps the whole snapshot buffered', async () => {
    mockProvider.loadPlaylists
      .mockResolvedValueOnce([{ id: 'sifted-1', name: 'My Playlist - Sifted', trackCount: 0 }])
      .mockRejectedValueOnce(new Error('offline'));
    mockProvider.loadPlaylistTracks.mockResolvedValueOnce([]); // pre-add diff
    mockProvider.addToPlaylist.mockRejectedValueOnce(new Error('add failed'));
    renderHarness([mockTrack, mockTrackB]);

    await act(async () => {
      sift.dispatch({ type: 'ADD_PENDING_KEEP', track: mockTrack });
    });
    await act(async () => {
      sift.dispatch({ type: 'ADD_PENDING_KEEP', track: mockTrackB });
    });
    await act(async () => {
      await api.saveSiftedPlaylist('My Playlist', [mockTrack, mockTrackB]);
    });

    // Best-effort repair failed — everything stays buffered for the retry…
    expect(sift.state.pendingKeeps.map((t) => t.id)).toEqual(['1', '2']);
    // …the surfaced error is the SAVE's, not the readback's…
    expect(sift.state.removalPlaylistError).toBe('add failed');
    expect(sift.state.isCreatingPlaylist).toBe(false);
    // …and the readback failure is at least observable.
    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('readback failed'),
        level: 'warning',
      }),
    );
  });

  test('a failed save whose companion vanished neither repairs nor logs a readback failure', async () => {
    mockProvider.loadPlaylists
      .mockResolvedValueOnce([{ id: 'sifted-1', name: 'My Playlist - Sifted', trackCount: 0 }])
      .mockResolvedValueOnce([]); // repair lookup: the companion is gone
    mockProvider.loadPlaylistTracks.mockResolvedValueOnce([]); // pre-add diff
    mockProvider.addToPlaylist.mockRejectedValueOnce(new Error('add failed'));
    renderHarness([mockTrack]);

    await act(async () => {
      sift.dispatch({ type: 'ADD_PENDING_KEEP', track: mockTrack });
    });
    await act(async () => {
      await api.saveSiftedPlaylist('My Playlist', [mockTrack]);
    });

    expect(sift.state.pendingKeeps.map((t) => t.id)).toEqual(['1']);
    expect(sift.state.removalPlaylistError).toBe('add failed');
    // Only the pre-add diff read the playlist — no repair readback happened,
    // and a missing companion is not a readback failure.
    expect(mockProvider.loadPlaylistTracks).toHaveBeenCalledTimes(1);
    expect(Sentry.addBreadcrumb).not.toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('readback failed') }),
    );
  });

  // ── keepTrack id resolution ──────────────────────────

  test('keepTrack on the library source does nothing', async () => {
    renderHarness([mockTrack]);

    await act(async () => {
      await api.keepTrack(mockTrack);
    });
    expect(mockProvider.loadPlaylists).not.toHaveBeenCalled();
    expect(mockProvider.createPlaylist).not.toHaveBeenCalled();
    expect(mockProvider.addToPlaylist).not.toHaveBeenCalled();
    expect(sift.state.pendingKeeps).toEqual([]);
  });

  test('keepTrack reuses the session-known sifted playlist id without a name lookup', async () => {
    renderHarness([mockTrack]);
    await setPlaylistSource();
    await act(async () => {
      sift.dispatch({ type: 'SET_SIFTED_PLAYLIST_ID', id: 'known-id' });
    });
    mockProvider.loadPlaylistTracks.mockResolvedValueOnce([]); // duplicate-guard readback

    await act(async () => {
      await api.keepTrack(mockTrack);
    });

    // Rename-proof: the persisted id is trusted outright.
    expect(mockProvider.loadPlaylists).not.toHaveBeenCalled();
    expect(mockProvider.createPlaylist).not.toHaveBeenCalled();
    expect(mockProvider.loadPlaylistTracks).toHaveBeenCalledWith('known-id');
    expect(mockProvider.addToPlaylist).toHaveBeenCalledWith('known-id', ['1']);
    expect(sift.state.pendingKeeps).toEqual([]);
  });

  test('keepTrack records the playlist id once a later keep resolves it', async () => {
    renderHarness([mockTrack, mockTrackB]);
    await setPlaylistSource();

    // First keep: creates the playlist, but it never becomes queryable
    // within the retry window — the id stays unknown.
    mockProvider.loadPlaylists.mockResolvedValue([]);
    await act(async () => {
      const first = api.keepTrack(mockTrack);
      await jest.advanceTimersByTimeAsync(1100);
      await first;
    });
    expect(mockProvider.createPlaylist).toHaveBeenCalledWith('My Playlist - Sifted', ['1']);
    expect(sift.state.siftedPlaylistId).toBeNull();
    // The track landed via creation — nothing to buffer.
    expect(sift.state.pendingKeeps).toEqual([]);

    // The playlist becomes visible later; the next keep must resolve the id,
    // persist it for the session, and use it for the add.
    mockProvider.loadPlaylists.mockResolvedValue([
      { id: 'late-id', name: 'My Playlist - Sifted', trackCount: 1 },
    ]);
    await act(async () => {
      await api.keepTrack(mockTrackB);
    });
    expect(sift.state.siftedPlaylistId).toBe('late-id');
    expect(mockProvider.addToPlaylist).toHaveBeenCalledWith('late-id', ['2']);
    // The creation-seeded contents cache stood in for a readback.
    expect(mockProvider.loadPlaylistTracks).not.toHaveBeenCalled();
    expect(sift.state.pendingKeeps).toEqual([]);
  });

  test('the sifted-playlist lookup retries on the 0/250/750ms schedule', async () => {
    renderHarness([mockTrack]);
    await setPlaylistSource();
    mockProvider.loadPlaylists.mockResolvedValue([]);

    let keep!: Promise<void>;
    await act(async () => {
      keep = api.keepTrack(mockTrack);
    });
    // Initial name lookup + the immediate (0ms) retry attempt.
    expect(mockProvider.loadPlaylists).toHaveBeenCalledTimes(2);

    await act(async () => {
      await jest.advanceTimersByTimeAsync(250);
    });
    expect(mockProvider.loadPlaylists).toHaveBeenCalledTimes(3);

    await act(async () => {
      await jest.advanceTimersByTimeAsync(750);
      await keep;
    });
    expect(mockProvider.loadPlaylists).toHaveBeenCalledTimes(4);
    // The keep itself landed via creation — nothing was buffered.
    expect(mockProvider.createPlaylist).toHaveBeenCalledTimes(1);
    expect(sift.state.pendingKeeps).toEqual([]);
  });

  // ── warmCache ────────────────────────────────────────

  test('warmCache reports exactly how many ids failed to resolve', async () => {
    mockProvider.warmSongCache.mockResolvedValueOnce(1);
    renderHarness([mockTrack]);

    await act(async () => {
      await api.warmCache(['1', '2']);
    });
    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith({
      category: 'music-provider',
      message: 'warmCache: 1 of 2 ids unresolved',
      level: 'warning',
    });
  });

  test('warmCache stays silent on full resolution or an unsupported provider', async () => {
    renderHarness([mockTrack]);

    mockProvider.warmSongCache.mockResolvedValueOnce(2);
    await act(async () => {
      await api.warmCache(['1', '2']);
    });
    expect(Sentry.addBreadcrumb).not.toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('unresolved') }),
    );

    // Providers without warmSongCache report undefined — not a shortfall.
    mockProvider.warmSongCache.mockResolvedValueOnce(undefined);
    await act(async () => {
      await api.warmCache(['1', '2']);
    });
    expect(Sentry.addBreadcrumb).not.toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('unresolved') }),
    );
  });

  // ── clearSiftedPlaylist result ───────────────────────

  test('clearSiftedPlaylist empties the companion and reports success', async () => {
    mockProvider.loadPlaylists.mockResolvedValue([
      { id: 'sifted-1', name: 'My Playlist - Sifted', trackCount: 2 },
    ]);
    mockProvider.loadPlaylistTracks.mockResolvedValue([mockTrack, mockTrackB]);
    renderHarness([mockTrack]);

    let cleared = false;
    await act(async () => {
      cleared = await api.clearSiftedPlaylist('My Playlist');
    });
    expect(cleared).toBe(true);
    expect(mockProvider.removeFromPlaylist).toHaveBeenCalledWith('sifted-1', ['1', '2']);
  });

  test('clearSiftedPlaylist succeeds without touching an already-empty companion', async () => {
    mockProvider.loadPlaylists.mockResolvedValue([
      { id: 'sifted-1', name: 'My Playlist - Sifted', trackCount: 0 },
    ]);
    mockProvider.loadPlaylistTracks.mockResolvedValue([]);
    renderHarness([mockTrack]);

    let cleared = false;
    await act(async () => {
      cleared = await api.clearSiftedPlaylist('My Playlist');
    });
    expect(cleared).toBe(true);
    expect(mockProvider.removeFromPlaylist).not.toHaveBeenCalled();
  });

  test('clearSiftedPlaylist reports success when no companion exists to clear', async () => {
    // Callers wipe local session state only on success — "nothing to clear"
    // must read as success, or Start Over would refuse to proceed forever.
    mockProvider.loadPlaylists.mockResolvedValue([]);
    renderHarness([mockTrack]);

    let cleared = false;
    await act(async () => {
      cleared = await api.clearSiftedPlaylist('My Playlist');
    });
    expect(cleared).toBe(true);
    expect(mockProvider.loadPlaylistTracks).not.toHaveBeenCalled();
    expect(mockProvider.removeFromPlaylist).not.toHaveBeenCalled();
  });

  test('clearSiftedPlaylist reports failure so callers keep their local state', async () => {
    renderHarness([mockTrack]);

    mockProvider.loadPlaylists.mockRejectedValueOnce(new Error('offline'));
    let cleared = true;
    await act(async () => {
      cleared = await api.clearSiftedPlaylist('My Playlist');
    });
    expect(cleared).toBe(false);
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      { tags: { flow: 'clear-sifted-playlist' } },
    );

    // A failing removal is a failed clear too — not a silent success.
    mockProvider.loadPlaylists.mockResolvedValue([
      { id: 'sifted-1', name: 'My Playlist - Sifted', trackCount: 1 },
    ]);
    mockProvider.loadPlaylistTracks.mockResolvedValue([mockTrack]);
    mockProvider.removeFromPlaylist.mockRejectedValueOnce(new Error('nope'));
    await act(async () => {
      cleared = await api.clearSiftedPlaylist('My Playlist');
    });
    expect(cleared).toBe(false);
  });

  // ── Authorization is checked, not re-prompted ────────

  test('already-authorized flows never re-open the consent prompt', async () => {
    renderHarness([]);

    await act(async () => {
      await api.loadLibrary();
    });
    await act(async () => {
      await api.loadTracks();
    });
    await act(async () => {
      await api.loadPlaylists();
    });
    await act(async () => {
      await api.warmCache(['1']);
    });
    // isAuthorized answered true every time — prompting again would throw
    // the user into a needless consent flow (e.g. the Spotify browser).
    expect(mockProvider.requestAuthorization).not.toHaveBeenCalled();
  });

  // ── Provider lifecycle ───────────────────────────────

  test('switching the provider routes subsequent calls to the new provider', async () => {
    const spotifyProvider = makeMinimalProvider();
    renderHarness([mockTrack]);

    await act(async () => {
      mockActiveProvider = spotifyProvider;
      sift.dispatch({ type: 'SET_PROVIDER', provider: 'spotify' });
    });
    await act(async () => {
      await api.pause();
    });
    expect(spotifyProvider.pause).toHaveBeenCalledTimes(1);
    expect(mockProvider.pause).not.toHaveBeenCalled();
  });

  // ── loadTracks filtering behaviors ───────────────────

  test('skipFiltering re-offers already-sifted tracks without any filter lookups', async () => {
    // The companion contains the only source track — normal filtering would
    // empty the sift, but "Re-sift everything" must offer it again.
    mockProvider.loadPlaylistTracks.mockResolvedValue([mockTrack]);
    mockProvider.loadPlaylists.mockResolvedValue([
      { id: 'sifted-1', name: 'My Playlist - Sifted', trackCount: 1 },
    ]);
    renderHarness([]);
    await setPlaylistSource();

    await act(async () => {
      await api.loadTracks({ skipFiltering: true });
    });
    expect(sift.state.phase).toBe('sifting');
    expect(sift.state.tracks.map((t) => t.id)).toEqual(['1']);
    // Skipping the filters means not even reading the companion or history.
    expect(mockProvider.loadPlaylists).not.toHaveBeenCalled();
    expect(loadHistory).not.toHaveBeenCalled();
  });

  test('removal history from other sources does not hide playlist tracks', async () => {
    // The same song was removed from the LIBRARY and from ANOTHER playlist —
    // neither record concerns this playlist, so the track must be offered.
    mockProvider.loadPlaylistTracks.mockResolvedValueOnce([mockTrack]);
    mockProvider.loadPlaylists.mockResolvedValue([]);
    (loadHistory as jest.Mock).mockResolvedValueOnce([
      {
        track: mockTrack,
        source: { type: 'library' },
        provider: 'apple-music',
        removedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        track: mockTrack,
        source: { type: 'playlist', playlist: { id: 'p2', name: 'Other Playlist', trackCount: 3 } },
        provider: 'apple-music',
        removedAt: '2026-01-02T00:00:00.000Z',
      },
    ]);
    renderHarness([]);
    await setPlaylistSource();

    await act(async () => {
      await api.loadTracks();
    });
    expect(sift.state.phase).toBe('sifting');
    expect(sift.state.tracks.map((t) => t.id)).toEqual(['1']);
    expect(sift.state.loadError).toBeNull();
  });

  test('a genuinely empty playlist reports "no tracks" even with filtering on', async () => {
    mockProvider.loadPlaylistTracks.mockResolvedValueOnce([]);
    mockProvider.loadPlaylists.mockResolvedValue([]);
    renderHarness([]);
    await setPlaylistSource();

    await act(async () => {
      await api.loadTracks();
    });
    // Nothing was filtered out — claiming "already sifted" would be false.
    expect(sift.state.loadError).toBe('This playlist has no tracks to sift.');
    expect(sift.state.phase).toBe('setup');
  });

  test('an existing companion that filtered nothing does not steal the removed-tracks blame', async () => {
    const unrelated: Track = {
      id: 'c', name: 'Unrelated', artist: 'Someone Else', album: 'X',
      duration: 90, playCount: 0, dateAdded: '2020-03-01T00:00:00.000Z',
    };
    mockProvider.loadPlaylistTracks
      .mockResolvedValueOnce([mockTrack]) // source playlist
      .mockResolvedValueOnce([unrelated]); // companion holds only an unrelated track
    mockProvider.loadPlaylists.mockResolvedValue([
      { id: 'sifted-1', name: 'My Playlist - Sifted', trackCount: 1 },
    ]);
    (loadHistory as jest.Mock).mockResolvedValueOnce([
      {
        track: mockTrack,
        source: { type: 'playlist', playlist: { id: 'p1', name: 'My Playlist', trackCount: 5 } },
        provider: 'apple-music',
        removedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
    renderHarness([]);
    await setPlaylistSource();

    await act(async () => {
      await api.loadTracks();
    });
    // Only the removal filter emptied the sift — the message must say so.
    expect(sift.state.loadError).toBe(
      'All tracks in this playlist were removed in a previous sift.',
    );
  });

  test('the sifted filter excludes by id even when the track metadata was edited', async () => {
    mockProvider.loadPlaylistTracks
      .mockResolvedValueOnce([mockTrack]) // source: id '1'
      .mockResolvedValueOnce([{ ...mockTrack, name: 'Track A (Remastered)' }]); // companion: same id, new name
    mockProvider.loadPlaylists.mockResolvedValue([
      { id: 'sifted-1', name: 'My Playlist - Sifted', trackCount: 1 },
    ]);
    renderHarness([]);
    await setPlaylistSource();

    await act(async () => {
      await api.loadTracks();
    });
    expect(sift.state.loadError).toBe('All tracks in this playlist have already been sifted.');
    expect(sift.state.phase).toBe('setup');
  });

  // ── Companion resolution among many playlists ────────

  test('save and clear resolve the companion by exact name among many playlists', async () => {
    const decoyFirst = [
      { id: 'decoy', name: 'Another Playlist', trackCount: 9 },
      { id: 'sifted-1', name: 'My Playlist - Sifted', trackCount: 0 },
    ];
    mockProvider.loadPlaylists.mockResolvedValue(decoyFirst);
    mockProvider.loadPlaylistTracks.mockResolvedValue([]);
    renderHarness([mockTrack]);

    await act(async () => {
      await api.saveSiftedPlaylist('My Playlist', [mockTrack]);
    });
    expect(mockProvider.addToPlaylist).toHaveBeenCalledWith('sifted-1', ['1']);
    expect(mockProvider.createPlaylist).not.toHaveBeenCalled();

    mockProvider.loadPlaylistTracks.mockResolvedValue([mockTrack]);
    await act(async () => {
      await api.clearSiftedPlaylist('My Playlist');
    });
    expect(mockProvider.removeFromPlaylist).toHaveBeenCalledWith('sifted-1', ['1']);
  });

  test('the persisted id outranks list position when resolving the companion', async () => {
    // The renamed companion sits BEHIND a decoy — only the exact id may win.
    const decoyFirst = [
      { id: 'decoy', name: 'Another Playlist', trackCount: 9 },
      { id: 'sifted-renamed', name: 'Custom Name', trackCount: 0 },
    ];
    mockProvider.loadPlaylists.mockResolvedValue(decoyFirst);
    mockProvider.loadPlaylistTracks.mockResolvedValue([]);
    renderHarness([mockTrack]);
    await act(async () => {
      sift.dispatch({ type: 'SET_SIFTED_PLAYLIST_ID', id: 'sifted-renamed' });
    });

    await act(async () => {
      await api.saveSiftedPlaylist('My Playlist', [mockTrack]);
    });
    expect(mockProvider.addToPlaylist).toHaveBeenCalledWith('sifted-renamed', ['1']);

    mockProvider.loadPlaylistTracks.mockResolvedValue([mockTrack]);
    await act(async () => {
      await api.clearSiftedPlaylist('My Playlist');
    });
    expect(mockProvider.removeFromPlaylist).toHaveBeenCalledWith('sifted-renamed', ['1']);
  });

  test('loadTracks filtering resolves the companion among many playlists, by name and by id', async () => {
    // Name-based, companion behind a decoy.
    mockProvider.loadPlaylists.mockResolvedValue([
      { id: 'decoy', name: 'Another Playlist', trackCount: 9 },
      { id: 'sifted-1', name: 'My Playlist - Sifted', trackCount: 1 },
    ]);
    mockProvider.loadPlaylistTracks
      .mockResolvedValueOnce([mockTrack, mockTrackB])
      .mockResolvedValueOnce([mockTrack]);
    renderHarness([]);
    await setPlaylistSource();
    await act(async () => {
      await api.loadTracks();
    });
    expect(mockProvider.loadPlaylistTracks).toHaveBeenCalledWith('sifted-1');
    expect(sift.state.tracks.map((t) => t.id)).toEqual(['2']);

    // Id-based, renamed companion behind a decoy.
    mockProvider.loadPlaylists.mockResolvedValue([
      { id: 'decoy', name: 'Another Playlist', trackCount: 9 },
      { id: 'sifted-renamed', name: 'Custom Name', trackCount: 1 },
    ]);
    mockProvider.loadPlaylistTracks
      .mockResolvedValueOnce([mockTrack, mockTrackB])
      .mockResolvedValueOnce([mockTrack]);
    await act(async () => {
      sift.dispatch({ type: 'SET_SIFTED_PLAYLIST_ID', id: 'sifted-renamed' });
    });
    await act(async () => {
      await api.loadTracks();
    });
    expect(mockProvider.loadPlaylistTracks).toHaveBeenCalledWith('sifted-renamed');
    expect(sift.state.tracks.map((t) => t.id)).toEqual(['2']);
  });

  // ── keepTrack resolution caching ─────────────────────

  test('keeps after the first do not repeat the name lookup or the readback', async () => {
    mockProvider.loadPlaylists.mockResolvedValue([
      { id: 'decoy', name: 'Another Playlist', trackCount: 9 },
      { id: 'sifted-1', name: 'My Playlist - Sifted', trackCount: 0 },
    ]);
    mockProvider.loadPlaylistTracks.mockResolvedValueOnce([]);
    renderHarness([mockTrack, mockTrackB]);
    await setPlaylistSource();

    await act(async () => {
      const first = api.keepTrack(mockTrack);
      const second = api.keepTrack(mockTrackB);
      await Promise.all([first, second]);
    });

    // One lookup (finding the exact name behind the decoy), one readback —
    // the second keep reuses both and lands directly.
    expect(mockProvider.loadPlaylists).toHaveBeenCalledTimes(1);
    expect(mockProvider.loadPlaylistTracks).toHaveBeenCalledTimes(1);
    expect(mockProvider.addToPlaylist).toHaveBeenNthCalledWith(1, 'sifted-1', ['1']);
    expect(mockProvider.addToPlaylist).toHaveBeenNthCalledWith(2, 'sifted-1', ['2']);
    // The resolved id is recorded for the session (rename-proofing).
    expect(sift.state.siftedPlaylistId).toBe('sifted-1');
  });

  test('the id resolved right after creating the companion is recorded for the session', async () => {
    mockProvider.loadPlaylists
      .mockResolvedValueOnce([]) // initial lookup: nothing yet
      .mockResolvedValue([
        { id: 'decoy', name: 'Another Playlist', trackCount: 9 },
        { id: 'new-sifted', name: 'My Playlist - Sifted', trackCount: 1 },
      ]);
    renderHarness([mockTrack]);
    await setPlaylistSource();

    await act(async () => {
      await api.keepTrack(mockTrack);
    });
    expect(mockProvider.createPlaylist).toHaveBeenCalledWith('My Playlist - Sifted', ['1']);
    expect(sift.state.siftedPlaylistId).toBe('new-sifted');
    expect(sift.state.pendingKeeps).toEqual([]);
  });

  test('a failing keep is buffered for the Done fallback and reported', async () => {
    mockProvider.loadPlaylists.mockRejectedValueOnce(new Error('offline'));
    renderHarness([mockTrack]);
    await setPlaylistSource();

    await act(async () => {
      await api.keepTrack(mockTrack);
    });
    expect(sift.state.pendingKeeps.map((t) => t.id)).toEqual(['1']);
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      { tags: { flow: 'keep-track' } },
    );
  });

  // ── Save dedup and repair by id ──────────────────────

  test('save skips a track already present under the same id after metadata edits', async () => {
    mockProvider.loadPlaylists.mockResolvedValue([
      { id: 'sifted-1', name: 'My Playlist - Sifted', trackCount: 1 },
    ]);
    // Same id, edited metadata: identity differs, id must still match.
    mockProvider.loadPlaylistTracks.mockResolvedValue([
      { ...mockTrack, name: 'Track A (Remastered)' },
    ]);
    renderHarness([mockTrack]);

    await act(async () => {
      await api.saveSiftedPlaylist('My Playlist', [mockTrack]);
    });
    expect(mockProvider.addToPlaylist).not.toHaveBeenCalled();
    expect(sift.state.removalPlaylistCreated).toBe(true);
  });

  test('the failed-save repair recognizes landed tracks by id after metadata edits', async () => {
    mockProvider.loadPlaylists.mockResolvedValue([
      { id: 'sifted-1', name: 'My Playlist - Sifted', trackCount: 0 },
    ]);
    mockProvider.loadPlaylistTracks
      .mockResolvedValueOnce([]) // pre-add diff
      .mockResolvedValueOnce([{ ...mockTrack, name: 'Track A (Live)' }]); // landed: same id, new name
    mockProvider.addToPlaylist.mockRejectedValueOnce(new Error('partial failure'));
    renderHarness([mockTrack, mockTrackB]);

    await act(async () => {
      sift.dispatch({ type: 'ADD_PENDING_KEEP', track: mockTrack });
    });
    await act(async () => {
      sift.dispatch({ type: 'ADD_PENDING_KEEP', track: mockTrackB });
    });
    await act(async () => {
      await api.saveSiftedPlaylist('My Playlist', [mockTrack, mockTrackB]);
    });

    expect(sift.state.pendingKeeps.map((t) => t.id)).toEqual(['2']);
    expect(sift.state.removalPlaylistError).toBe('partial failure');
  });

  test('warmCache failures are captured, never thrown', async () => {
    mockProvider.warmSongCache.mockRejectedValueOnce(new Error('cache fail'));
    renderHarness([mockTrack]);

    await act(async () => {
      await api.warmCache(['1', '2']);
    });
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      { tags: { flow: 'warm-cache' } },
    );
  });

  // ── Providers without optional APIs ──────────────────
  // MusicProviderService marks the playlist/library-mutation APIs optional.
  // Every flow must degrade gracefully on a provider that lacks them —
  // never crash, never lose a kept track, never claim false failure.

  test('keepTrack on a minimal provider creates the companion and loses nothing', async () => {
    const minimal = makeMinimalProvider();
    mockActiveProvider = minimal;
    renderHarness([mockTrack]);
    await setPlaylistSource();

    await act(async () => {
      const keep = api.keepTrack(mockTrack);
      await jest.advanceTimersByTimeAsync(1100);
      await keep;
    });
    expect(minimal.createPlaylist).toHaveBeenCalledWith('My Playlist - Sifted', ['1']);
    // The track landed via creation — nothing buffered, nothing captured.
    expect(sift.state.pendingKeeps).toEqual([]);
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  test('saveSiftedPlaylist on a minimal provider creates the companion outright', async () => {
    const minimal = makeMinimalProvider();
    mockActiveProvider = minimal;
    renderHarness([mockTrack]);

    await act(async () => {
      await api.saveSiftedPlaylist('My Playlist', [mockTrack]);
    });
    expect(minimal.createPlaylist).toHaveBeenCalledWith('My Playlist - Sifted', ['1']);
    expect(sift.state.removalPlaylistCreated).toBe(true);
    expect(sift.state.removalPlaylistError).toBeNull();
  });

  test('a failed save on a minimal provider keeps the snapshot without attempting a readback', async () => {
    const minimal = makeMinimalProvider({
      createPlaylist: jest.fn().mockRejectedValue('boom'), // non-Error rejection
    });
    mockActiveProvider = minimal;
    renderHarness([mockTrack]);

    await act(async () => {
      sift.dispatch({ type: 'ADD_PENDING_KEEP', track: mockTrack });
    });
    await act(async () => {
      await api.saveSiftedPlaylist('My Playlist', [mockTrack]);
    });

    expect(sift.state.removalPlaylistError).toBe('Failed to save sifted playlist');
    expect(sift.state.pendingKeeps.map((t) => t.id)).toEqual(['1']);
    // No playlist listing available — the repair quietly does nothing.
    expect(Sentry.addBreadcrumb).not.toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('readback failed') }),
    );
  });

  test('the failed-save repair tolerates a provider that cannot read the companion back', async () => {
    const addToPlaylist = jest.fn().mockRejectedValue(new Error('add failed'));
    const minimal = makeMinimalProvider({
      loadPlaylists: jest.fn().mockResolvedValue([
        { id: 'sifted-1', name: 'My Playlist - Sifted', trackCount: 0 },
      ]),
      addToPlaylist,
    });
    mockActiveProvider = minimal;
    renderHarness([mockTrack]);

    await act(async () => {
      sift.dispatch({ type: 'ADD_PENDING_KEEP', track: mockTrack });
    });
    await act(async () => {
      await api.saveSiftedPlaylist('My Playlist', [mockTrack]);
    });

    // Without loadPlaylistTracks the diff treats the companion as empty…
    expect(addToPlaylist).toHaveBeenCalledWith('sifted-1', ['1']);
    // …and the repair readback finds nothing landed: everything stays buffered.
    expect(sift.state.pendingKeeps.map((t) => t.id)).toEqual(['1']);
    expect(sift.state.removalPlaylistError).toBe('add failed');
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      { tags: { flow: 'save-sifted-playlist' } },
    );
    expect(Sentry.addBreadcrumb).not.toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('readback failed') }),
    );
  });

  test('keepTrack with a known id adds directly when the provider cannot read the companion', async () => {
    const addToPlaylist = jest.fn().mockResolvedValue(undefined);
    const minimal = makeMinimalProvider({ addToPlaylist });
    mockActiveProvider = minimal;
    renderHarness([mockTrack]);
    await setPlaylistSource();
    await act(async () => {
      sift.dispatch({ type: 'SET_SIFTED_PLAYLIST_ID', id: 'known-id' });
    });

    await act(async () => {
      await api.keepTrack(mockTrack);
    });
    // No duplicate-guard readback possible — treat the companion as empty
    // and land the keep rather than buffering or crashing.
    expect(addToPlaylist).toHaveBeenCalledWith('known-id', ['1']);
    expect(sift.state.pendingKeeps).toEqual([]);
  });

  test('loadTracks reports missing playlist support on a minimal provider', async () => {
    mockActiveProvider = makeMinimalProvider();
    renderHarness([]);
    await setPlaylistSource();

    await act(async () => {
      await api.loadTracks();
    });
    expect(sift.state.loadError).toBe('This provider does not support playlist loading');
    expect(sift.state.phase).toBe('setup');
  });

  test('loadTracks filtering proceeds when the provider cannot list playlists', async () => {
    const minimal = makeMinimalProvider({
      loadPlaylistTracks: jest.fn().mockResolvedValue([mockTrack]),
    });
    mockActiveProvider = minimal;
    renderHarness([]);
    await setPlaylistSource();

    await act(async () => {
      await api.loadTracks();
    });
    // No companion can exist — nothing is filtered, the sift proceeds.
    expect(sift.state.phase).toBe('sifting');
    expect(sift.state.tracks.map((t) => t.id)).toEqual(['1']);
  });

  test('an unreadable companion filters nothing from the sift', async () => {
    mockProvider.loadPlaylistTracks
      .mockResolvedValueOnce([mockTrack]) // source playlist
      .mockResolvedValueOnce(undefined as unknown as Track[]); // companion readback unavailable
    mockProvider.loadPlaylists.mockResolvedValue([
      { id: 'sifted-1', name: 'My Playlist - Sifted', trackCount: 1 },
    ]);
    renderHarness([]);
    await setPlaylistSource();

    await act(async () => {
      await api.loadTracks();
    });
    expect(sift.state.phase).toBe('sifting');
    expect(sift.state.tracks.map((t) => t.id)).toEqual(['1']);
  });

  test('remove and restore degrade gracefully without provider removal APIs', async () => {
    const minimal = makeMinimalProvider();
    mockActiveProvider = minimal;
    renderHarness([mockTrack]);

    // Library source: removal is a logged no-op, not an error.
    await act(async () => {
      await api.removeTrack(mockTrack);
    });
    expect(sift.state.removalErrors).toEqual([]);
    expect(logRemoval).toHaveBeenCalledTimes(1);

    // Restore still purges the history record so the track resurfaces.
    await act(async () => {
      await api.restoreTrack(mockTrack);
    });
    expect(removeFromHistory).toHaveBeenCalledWith('1', { type: 'library' });
    expect(sift.state.removalErrors).toEqual([]);

    // Playlist source: same graceful degradation.
    await setPlaylistSource();
    await act(async () => {
      await api.removeTrack(mockTrack);
    });
    await act(async () => {
      await api.restoreTrack(mockTrack);
    });
    expect(sift.state.removalErrors).toEqual([]);
    expect(removeFromHistory).toHaveBeenLastCalledWith('1', {
      type: 'playlist',
      playlist: { id: 'p1', name: 'My Playlist', trackCount: 5 },
    });
  });

  test('warmCache no-ops silently on a provider without cache warming', async () => {
    mockActiveProvider = makeMinimalProvider();
    renderHarness([mockTrack]);

    await act(async () => {
      await api.warmCache(['1', '2']);
    });
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(Sentry.addBreadcrumb).not.toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('unresolved') }),
    );
  });

  test('clearSiftedPlaylist trivially succeeds on a provider without playlists', async () => {
    mockActiveProvider = makeMinimalProvider();
    renderHarness([mockTrack]);

    let cleared = false;
    await act(async () => {
      cleared = await api.clearSiftedPlaylist('My Playlist');
    });
    expect(cleared).toBe(true);
  });

  test('clearSiftedPlaylist succeeds without removing when the companion cannot be read', async () => {
    const removeFromPlaylist = jest.fn().mockResolvedValue(undefined);
    const minimal = makeMinimalProvider({
      loadPlaylists: jest.fn().mockResolvedValue([
        { id: 'sifted-1', name: 'My Playlist - Sifted', trackCount: 1 },
      ]),
      removeFromPlaylist,
    });
    mockActiveProvider = minimal;
    renderHarness([mockTrack]);

    let cleared = false;
    await act(async () => {
      cleared = await api.clearSiftedPlaylist('My Playlist');
    });
    // Unreadable contents read as empty — nothing to remove, still a success.
    expect(cleared).toBe(true);
    expect(removeFromPlaylist).not.toHaveBeenCalled();
  });
});
