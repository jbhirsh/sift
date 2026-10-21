import React, { useEffect } from 'react';
import { render, act } from '@testing-library/react-native';
import { Alert, Linking } from 'react-native';
import * as Sentry from '@sentry/react-native';
import { SiftProvider, useSift } from '../../src/context/SiftContext';
import { useMusicProvider } from '../../src/hooks/useMusicProvider';
import { forgetRemovals, loadHistory, logRemoval, removeFromHistory } from '../../src/services/RemovalHistoryStore';
import { loadReviewedIds, markReviewed, unmarkReviewed } from '../../src/services/ReviewedLedgerStore';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
  createPlaylist: jest.fn().mockResolvedValue('new-playlist'),
  removeFromPlaylist: jest.fn().mockResolvedValue(undefined),
  restoreRemoved: jest.fn().mockResolvedValue(1),
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
    createPlaylist: jest.fn().mockResolvedValue('new-playlist'),
    ...extras,
  };
}

jest.mock('../../src/services/RemovalHistoryStore', () => ({
  logRemoval: jest.fn(() => Promise.resolve()),
  loadHistory: jest.fn(() => Promise.resolve([])),
  removeFromHistory: jest.fn(() => Promise.resolve()),
  forgetRemovals: jest.fn(() => Promise.resolve()),
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
    mockProvider.createPlaylist.mockResolvedValue('new-playlist');
    mockProvider.removeFromPlaylist.mockResolvedValue(undefined);
    mockProvider.removeFromLibrary.mockResolvedValue(undefined);
    mockProvider.addToPlaylist.mockResolvedValue(undefined);
    mockProvider.addToLibrary.mockResolvedValue(undefined);
    mockProvider.warmSongCache.mockResolvedValue(undefined);
    // Tests that seed a persistent history must not leak it into later ones.
    (loadHistory as jest.Mock).mockReset().mockResolvedValue([]);
    mockProvider.getPlaybackState.mockReturnValue({ position: 30, isPlaying: true });
  });

  // Each test starts with an empty reviewed ledger: let a write an earlier
  // test started land, then clear what it stored.
  beforeEach(async () => {
    await unmarkReviewed('settle', 'nothing');
    await AsyncStorage.clear();
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
    await renderHarness([mockTrack]);

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
    await renderHarness([mockTrack]);

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
    await renderHarness([mockTrack]);

    let granted = true;
    await act(async () => {
      granted = await api.authorize();
    });
    expect(granted).toBe(false);
    expect(sift.state.connectionStatus).toBe('disconnected');
    expect(Sentry.captureException).toHaveBeenCalledWith(boom, { tags: { flow: 'authorize' } });
  });

  test('isAuthorized passes the provider answer through', async () => {
    await renderHarness([mockTrack]);

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
    await renderHarness([mockTrack]);

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
    await renderHarness([mockTrack]);

    await act(async () => {
      await api.play('1');
    });
    expect(sift.state.isPlaying).toBe(false);
    expect(sift.state.playbackPosition).toBe(0);
    // It says which track failed, for the player to say so.
    expect(sift.state.playbackFailedId).toBe('1');
    await act(async () => {
      await api.play('1');
    });
    expect(sift.state.playbackFailedId).toBeNull();
  });

  test('pause and resume flip isPlaying only when the provider call succeeds', async () => {
    await renderHarness([mockTrack]);
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

  test('skipForward jumps 15s ahead and clamps at the track duration', async () => {
    await renderHarness([mockTrack]); // duration 200

    mockProvider.getPlaybackState.mockReturnValue({ position: 30, isPlaying: true });
    await act(() => {
      api.skipForward();
    });
    expect(mockProvider.seek).toHaveBeenCalledWith(45);
    expect(sift.state.playbackPosition).toBe(45);

    mockProvider.getPlaybackState.mockReturnValue({ position: 195, isPlaying: true });
    await act(() => {
      api.skipForward();
    });
    expect(mockProvider.seek).toHaveBeenLastCalledWith(200);
    expect(sift.state.playbackPosition).toBe(200);
  });

  test('skipForward without a current track is a no-op', async () => {
    await renderHarness(); // no tracks loaded
    await act(() => {
      api.skipForward();
    });
    expect(mockProvider.seek).not.toHaveBeenCalled();
    expect(sift.state.playbackPosition).toBe(0);
  });

  test('skipBackward rewinds 15s and clamps at zero', async () => {
    await renderHarness([mockTrack]);

    mockProvider.getPlaybackState.mockReturnValue({ position: 30, isPlaying: true });
    await act(() => {
      api.skipBackward();
    });
    expect(mockProvider.seek).toHaveBeenCalledWith(15);
    expect(sift.state.playbackPosition).toBe(15);

    mockProvider.getPlaybackState.mockReturnValue({ position: 5, isPlaying: true });
    await act(() => {
      api.skipBackward();
    });
    expect(mockProvider.seek).toHaveBeenLastCalledWith(0);
    expect(sift.state.playbackPosition).toBe(0);
  });

  test('polling mirrors the provider position every 500ms and stops on pause', async () => {
    await renderHarness([mockTrack]);
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

  test('loadTracks denial raises the same settings alert for a playlist source', async () => {
    mockProvider.isAuthorized.mockResolvedValue(false);
    mockProvider.requestAuthorization.mockResolvedValue(false);
    await renderHarness([]);
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
    await renderHarness([]);
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
    await renderHarness();

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
    await renderHarness([]);
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

  describe('Plays and Added (filters)', () => {
    const now = new Date();
    const yearsAgo = (years: number) => {
      const at = new Date(now);
      at.setFullYear(at.getFullYear() - years);
      return at.toISOString();
    };
    const old = { ...mockTrack, id: 'old', name: 'Old', playCount: 2, dateAdded: yearsAgo(4) };
    const loved = { ...mockTrack, id: 'loved', name: 'Loved', playCount: 90, dateAdded: yearsAgo(4) };
    const fresh = { ...mockTrack, id: 'fresh', name: 'Fresh', playCount: 0, dateAdded: yearsAgo(0) };

    test('a library sift takes only the songs that match', async () => {
      mockProvider.loadLibrary.mockResolvedValueOnce([old, loved, fresh]);
      await renderHarness([]);
      await act(async () => {
        sift.dispatch({ type: 'SET_FILTER', filter: { maxPlays: 5, addedYearsAgo: 3 } });
      });
      await act(async () => {
        await api.loadTracks();
      });
      expect(sift.state.tracks.map((t) => t.id)).toEqual(['old']);
      expect(sift.state.phase).toBe('sifting');
    });

    test('so does a playlist sift', async () => {
      mockProvider.loadPlaylistTracks.mockResolvedValueOnce([old, loved, fresh]);
      await renderHarness([]);
      await setPlaylistSource();
      await act(async () => {
        sift.dispatch({ type: 'SET_FILTER', filter: { maxPlays: 0, addedYearsAgo: null } });
      });
      await act(async () => {
        await api.loadTracks();
      });
      expect(sift.state.tracks.map((t) => t.id)).toEqual(['fresh']);
    });

    test('nothing matching says so, rather than blaming earlier sifts', async () => {
      mockProvider.loadLibrary.mockResolvedValueOnce([loved, fresh]);
      await renderHarness([]);
      await act(async () => {
        sift.dispatch({ type: 'SET_FILTER', filter: { maxPlays: 5, addedYearsAgo: 3 } });
      });
      await act(async () => {
        await api.loadTracks();
      });
      expect(sift.state.phase).toBe('setup');
      expect(sift.state.loadError).toBe('No songs match your Plays and Added choices.');
      mockProvider.loadPlaylistTracks.mockResolvedValueOnce([loved]);
      await setPlaylistSource();
      await act(async () => {
        await api.loadTracks();
      });
      expect(sift.state.loadError).toBe('No songs in this playlist match your Plays and Added choices.');
    });

    test('a source already empty before the filters keeps its own message', async () => {
      mockProvider.loadLibrary.mockResolvedValueOnce([]);
      await renderHarness([]);
      await act(async () => {
        sift.dispatch({ type: 'SET_FILTER', filter: { maxPlays: 5, addedYearsAgo: null } });
      });
      await act(async () => {
        await api.loadTracks();
      });
      expect(sift.state.loadError).toBe('Your library has no tracks to sift.');
    });
  });

  test('loadTracks surfaces a clear error when the provider cannot load playlists', async () => {
    mockProvider.loadPlaylistTracks.mockResolvedValueOnce(undefined);
    await renderHarness([]);
    await setPlaylistSource();

    await act(async () => {
      await api.loadTracks();
    });
    expect(sift.state.loadError).toBe('Couldn\u2019t load "My Playlist". Try again in a moment.');
    expect(sift.state.phase).toBe('setup');
  });

  test('loadTracks failure says what didn\'t load in plain words; the raw error goes to Sentry (#174)', async () => {
    const raw = new Error('No tracks found for the given IDs.');
    mockProvider.loadLibrary.mockRejectedValueOnce(raw);
    await renderHarness();

    await act(async () => {
      await api.loadTracks();
    });
    expect(sift.state.loadError).toBe('Couldn\u2019t load your library. Try again in a moment.');
    expect(sift.state.phase).toBe('setup');
    expect(Sentry.captureException).toHaveBeenCalledWith(raw, { tags: { flow: 'load-tracks' } });

    mockProvider.loadLibrary.mockRejectedValueOnce(new Error('The Internet connection appears to be offline.'));
    await act(async () => {
      await api.loadTracks();
    });
    expect(sift.state.loadError).toBe(
      'Couldn\u2019t load your library: Music can\u2019t be reached. Check your connection, then try again.',
    );
  });

  test('loadPlaylists returns [] on denial without querying, and the list once granted', async () => {
    await renderHarness();

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
    await renderHarness([mockTrack]);

    await act(async () => {
      await api.removeTrack(mockTrack);
    });
    expect(logRemoval).toHaveBeenCalledWith({
      track: mockTrack,
      source: { type: 'library' },
      provider: 'apple-music',
      removedAt: expect.any(String),
      collected: true,
    });
    expect(mockProvider.removeFromLibrary).toHaveBeenCalledWith(['1']);
    expect(mockProvider.removeFromPlaylist).not.toHaveBeenCalled();
    expect(sift.state.removalErrors).toEqual([]);
  });

  test('removeTrack failure records the track name but still logs the intent', async () => {
    mockProvider.removeFromLibrary.mockRejectedValueOnce(new Error('network'));
    await renderHarness([mockTrack]);

    await act(async () => {
      await api.removeTrack(mockTrack);
    });
    expect(sift.state.removalErrors).toEqual(['Track A']);
    // By id too: the counts key on it, since names can repeat.
    expect(sift.state.failedRemovalIds).toEqual(['1']);
    // The user's intent is what matters — it is logged before the attempt.
    expect(logRemoval).toHaveBeenCalledTimes(1);
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      { tags: { flow: 'remove-track' } },
    );
  });

  test('restoreTrack moves the track from removed back to kept', async () => {
    await renderHarness([mockTrack]);

    await act(async () => {
      sift.dispatch({ type: 'DECIDE', decision: 'remove' });
    });
    expect(sift.state.removed.map((t) => t.id)).toEqual(['1']);

    await act(async () => {
      await api.restoreTrack(mockTrack);
    });
    expect(sift.state.removed).toEqual([]);
    expect(sift.state.kept.map((t) => t.id)).toEqual(['1']);
    expect(forgetRemovals).toHaveBeenCalledWith('1', 'apple-music');
  });

  test('restoreTrack failure surfaces "name: reason" and keeps the history record', async () => {
    mockProvider.restoreRemoved.mockRejectedValueOnce(new Error('network down'));
    await renderHarness([mockTrack]);

    await act(async () => {
      await api.restoreTrack(mockTrack);
    });
    expect(sift.state.removalErrors).toEqual(['Track A: network down']);
    expect(forgetRemovals).not.toHaveBeenCalled();
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      { tags: { flow: 'restore-track' } },
    );

    // Non-Error rejections get the generic reason.
    mockProvider.restoreRemoved.mockRejectedValueOnce('boom');
    await act(async () => {
      await api.restoreTrack(mockTrack);
    });
    expect(sift.state.removalErrors).toEqual([
      'Track A: network down',
      'Track A: Failed to restore track',
    ]);
  });

  // ── Library removals (#139) ──────────────────────────
  // An Apple Music library Remove only moves the song into "Sift — Removed";
  // it stays in the library. These pin the library-sift filter, the
  // no-duplicate guard and the restore that takes it back out of there.

  const peaches: Track = {
    id: 'peaches', name: 'Peaches', artist: 'Justin Bieber', album: 'Justice',
    duration: 198, playCount: 4, dateAdded: '2021-03-19T00:00:00.000Z',
  };
  const libraryRemoval = (track: Track) => ({
    track, source: { type: 'library' as const }, provider: 'apple-music' as const, removedAt: '2026-10-01T12:00:00.000Z',
  });

  test('a library sift skips songs removed in an earlier Apple library sift', async () => {
    mockProvider.loadLibrary.mockResolvedValue([mockTrack, peaches, mockTrackB]);
    (loadHistory as jest.Mock).mockResolvedValueOnce([
      libraryRemoval(peaches),
      // A playlist removal leaves the song in the library: not filtered.
      {
        track: mockTrackB,
        source: { type: 'playlist', playlist: { id: 'p1', name: 'My Playlist', trackCount: 5 } },
        provider: 'apple-music',
        removedAt: '2026-10-01T12:00:00.000Z',
      },
    ]);
    await renderHarness([]);

    await act(async () => {
      await api.loadTracks();
    });
    expect(sift.state.phase).toBe('sifting');
    expect(sift.state.tracks.map((t) => t.id).sort()).toEqual(['1', '2']);
  });

  test('the library filter matches by id: a second copy of a removed song is still offered', async () => {
    // A duplicate (same name, artist and length, its own library id) wasn't
    // removed; only the copy the user removed is skipped.
    const secondCopy: Track = { ...peaches, id: 'peaches-copy' };
    mockProvider.loadLibrary.mockResolvedValue([mockTrack, peaches, secondCopy]);
    (loadHistory as jest.Mock).mockResolvedValueOnce([libraryRemoval(peaches)]);
    await renderHarness([]);

    await act(async () => {
      await api.loadTracks();
    });
    expect(sift.state.tracks.map((t) => t.id).sort()).toEqual(['1', 'peaches-copy']);
  });

  test('a library Start Over (skipFiltering) still skips removed Apple songs', async () => {
    // Starting the decisions over un-removes nothing: the songs are still
    // in "Sift — Removed".
    mockProvider.loadLibrary.mockResolvedValue([mockTrack, peaches]);
    (loadHistory as jest.Mock).mockResolvedValueOnce([libraryRemoval(peaches)]);
    await renderHarness([]);

    await act(async () => {
      await api.loadTracks({ skipFiltering: true });
    });
    expect(sift.state.tracks.map((t) => t.id)).toEqual(['1']);
  });

  test('a library emptied by the removal filter says so instead of "no tracks"', async () => {
    mockProvider.loadLibrary.mockResolvedValue([peaches]);
    (loadHistory as jest.Mock).mockResolvedValueOnce([libraryRemoval(peaches)]);
    await renderHarness([]);

    await act(async () => {
      await api.loadTracks();
    });
    expect(sift.state.phase).toBe('setup');
    expect(sift.state.loadError).toBe('Every song in your library was removed in a previous sift.');
  });

  test('removing an already-removed Apple library song neither logs it nor adds a duplicate', async () => {
    (loadHistory as jest.Mock).mockResolvedValue([libraryRemoval(peaches)]);
    await renderHarness([peaches]);

    await act(async () => {
      await api.removeTrack(peaches);
    });
    expect(mockProvider.removeFromLibrary).not.toHaveBeenCalled();
    expect(logRemoval).not.toHaveBeenCalled();

    // A song not removed before goes through as usual.
    await act(async () => {
      await api.removeTrack(mockTrack);
    });
    expect(mockProvider.removeFromLibrary).toHaveBeenCalledWith(['1']);
    expect(logRemoval).toHaveBeenCalledWith(expect.objectContaining({ track: mockTrack }));
  });

  test('a playlist remove of a song already in "Sift \u2014 Removed" isn\'t collected twice', async () => {
    (loadHistory as jest.Mock).mockResolvedValue([libraryRemoval(peaches)]);
    await renderHarness([peaches]);
    await setPlaylistSource();

    await act(async () => {
      await api.removeTrack(peaches);
    });
    expect(mockProvider.removeFromLibrary).not.toHaveBeenCalled();
    expect(mockProvider.removeFromPlaylist).not.toHaveBeenCalled();
  });

  test('a failed Apple library removal drops its record so the next sift offers the song again', async () => {
    mockProvider.removeFromLibrary.mockRejectedValueOnce(new Error('offline'));
    await renderHarness([peaches]);

    await act(async () => {
      await api.removeTrack(peaches);
    });
    expect(logRemoval).toHaveBeenCalledWith(expect.objectContaining({ track: peaches }));
    expect(removeFromHistory).toHaveBeenCalledWith('peaches', { type: 'library' });
    expect(sift.state.removalErrors).toEqual(['Peaches']);
  });

  test('a failed playlist removal drops its record too, so the next sift offers the song again', async () => {
    mockProvider.removeFromLibrary.mockRejectedValueOnce(new Error('offline'));
    await renderHarness([peaches]);
    await setPlaylistSource();

    await act(async () => {
      await api.removeTrack(peaches);
    });
    expect(logRemoval).toHaveBeenCalledWith(expect.objectContaining({ track: peaches, collected: true }));
    expect(removeFromHistory).toHaveBeenCalledWith('peaches', {
      type: 'playlist',
      playlist: { id: 'p1', name: 'My Playlist', trackCount: 5 },
    });
  });

  test('Apple library restore takes the song out of "Sift \u2014 Removed" instead of re-adding it', async () => {
    await renderHarness([mockTrack]);

    await act(async () => {
      await api.restoreTrack(mockTrack);
    });
    expect(mockProvider.restoreRemoved).toHaveBeenCalledWith(['1']);
    expect(mockProvider.addToLibrary).not.toHaveBeenCalled();
    expect(forgetRemovals).toHaveBeenCalledWith('1', 'apple-music');
    expect(sift.state.removalErrors).toEqual([]);
    // The provider finds "Sift \u2014 Removed" itself: no reading every playlist.
    expect(mockProvider.loadPlaylists).not.toHaveBeenCalled();
  });

  test('Apple library restore with nothing in "Sift \u2014 Removed" still purges the record', async () => {
    // The user may have deleted the playlist: nothing to take the song out of.
    mockProvider.restoreRemoved.mockResolvedValueOnce(0);
    await renderHarness([mockTrack]);

    await act(async () => {
      await api.restoreTrack(mockTrack);
    });
    expect(forgetRemovals).toHaveBeenCalledWith('1', 'apple-music');
    expect(sift.state.removalErrors).toEqual([]);
  });

  test('a failed Apple library restore surfaces the error and keeps the record', async () => {
    mockProvider.restoreRemoved.mockRejectedValueOnce(new Error('not editable'));
    await renderHarness([mockTrack]);

    await act(async () => {
      await api.restoreTrack(mockTrack);
    });
    expect(sift.state.removalErrors).toEqual(['Track A: not editable']);
    expect(forgetRemovals).not.toHaveBeenCalled();

    // The next restore tries again.
    await act(async () => {
      await api.restoreTrack(mockTrack);
    });
    expect(mockProvider.restoreRemoved).toHaveBeenCalledTimes(2);
    expect(forgetRemovals).toHaveBeenCalledWith('1', 'apple-music');
  });

  test("the load breadcrumb never names the playlist (#147)", async () => {
    await renderHarness([]);
    await setPlaylistSource();
    await act(async () => {
      await api.loadTracks();
    });
    const messages = (Sentry.addBreadcrumb as jest.Mock).mock.calls.map(([crumb]) => String(crumb.message));
    expect(messages).toContain('Loaded 1 tracks from a playlist');
    expect(messages.join('\n')).not.toContain('My Playlist');
  });

  test('keepTrack on the library source writes nothing to the service; the ledger remembers it', async () => {
    await renderHarness([mockTrack]);

    await act(async () => {
      await api.keepTrack(mockTrack);
    });
    expect(mockProvider.loadPlaylists).not.toHaveBeenCalled();
    expect(mockProvider.createPlaylist).not.toHaveBeenCalled();
    expect(mockProvider.addToPlaylist).not.toHaveBeenCalled();
    await expect(loadReviewedIds('apple-music:library')).resolves.toEqual(new Set(['1']));
  });

  // ── warmCache ────────────────────────────────────────

  test('warmCache reports exactly how many ids failed to resolve', async () => {
    mockProvider.warmSongCache.mockResolvedValueOnce(1);
    await renderHarness([mockTrack]);

    await act(async () => {
      await api.warmCache(['1', '2']);
    });
    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith({
      category: 'music-provider',
      message: 'warmCache: 1 of 2 ids unresolved',
      level: 'warning',
    });
  });

  test('warmCache passes the session\'s playlist through (#54)', async () => {
    mockProvider.warmSongCache.mockResolvedValueOnce(2);
    await renderHarness([mockTrack]);
    await act(async () => {
      await api.warmCache(['1', '2'], 'pl-1');
    });
    expect(mockProvider.warmSongCache).toHaveBeenCalledWith(['1', '2'], 'pl-1');
  });

  test('warmCache stays silent on full resolution or an unsupported provider', async () => {
    await renderHarness([mockTrack]);

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

  // ── Authorization is checked, not re-prompted ────────

  test('already-authorized flows never re-open the consent prompt', async () => {
    await renderHarness([]);

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
    // the user into a needless consent flow.
    expect(mockProvider.requestAuthorization).not.toHaveBeenCalled();
  });

  // ── Provider lifecycle ───────────────────────────────

  // ── loadTracks filtering behaviors ───────────────────

  test('skipFiltering re-offers already-sifted tracks without any filter lookups', async () => {
    // The ledger remembers the only source track as kept — normal filtering
    // would empty the sift, but "Include songs I've already sifted" must
    // offer it again.
    mockProvider.loadPlaylistTracks.mockResolvedValue([mockTrack]);
    await markReviewed('apple-music:playlist:p1', '1');
    // Its "- Sifted" was looked for once already (services/SiftedImport).
    await AsyncStorage.setItem('sift_sifted_imported', JSON.stringify(['apple-music:playlist:p1']));
    await renderHarness([]);
    await setPlaylistSource();

    await act(async () => {
      await api.loadTracks({ skipFiltering: true });
    });
    expect(sift.state.phase).toBe('sifting');
    expect(sift.state.tracks.map((t) => t.id)).toEqual(['1']);
    // Skipping the filters means not even reading the ledger, and a
    // playlist sift never lists playlists. The history is still read:
    // songs waiting in "Sift \u2014 Removed" stay out, as for the library
    // (starting over un-removes nothing).
    expect(mockProvider.loadPlaylists).not.toHaveBeenCalled();
    expect(loadHistory).toHaveBeenCalledTimes(1);
  });

  test('skipFiltering on a playlist whose songs are all removed says so, not "no tracks"', async () => {
    mockProvider.loadPlaylistTracks.mockResolvedValue([mockTrack]);
    (loadHistory as jest.Mock).mockResolvedValueOnce([libraryRemoval(mockTrack)]);
    await renderHarness([]);
    await setPlaylistSource();

    await act(async () => {
      await api.loadTracks({ skipFiltering: true });
    });
    expect(sift.state.loadError).toBe('All tracks in this playlist were removed in a previous sift.');
  });

  test('skipFiltering still leaves out a song waiting in "Sift \u2014 Removed"', async () => {
    mockProvider.loadPlaylistTracks.mockResolvedValue([mockTrack, mockTrackB]);
    (loadHistory as jest.Mock).mockResolvedValueOnce([libraryRemoval(mockTrack)]);
    await renderHarness([]);
    await setPlaylistSource();

    await act(async () => {
      await api.loadTracks({ skipFiltering: true });
    });
    expect(sift.state.tracks.map((t) => t.id)).toEqual(['2']);
  });

  test('a removal in another sift hides the song: it waits in "Sift \u2014 Removed" for them all', async () => {
    mockProvider.loadPlaylistTracks.mockResolvedValueOnce([mockTrack]);
    mockProvider.loadPlaylists.mockResolvedValue([]);
    (loadHistory as jest.Mock).mockResolvedValueOnce([
      {
        track: mockTrack,
        source: { type: 'playlist', playlist: { id: 'p2', name: 'Other Playlist', trackCount: 3 } },
        provider: 'apple-music',
        removedAt: '2026-01-02T00:00:00.000Z',
        collected: true,
      },
    ]);
    await renderHarness([]);
    await setPlaylistSource();

    await act(async () => {
      await api.loadTracks();
    });
    expect(sift.state.loadError).toBe('All tracks in this playlist were removed in a previous sift.');
  });

  test('older removals from another playlist, which never took effect, hide nothing', async () => {
    // Before removals were collected, a playlist Remove edited the playlist,
    // which MusicKit refuses for the user's own: those songs never left.
    mockProvider.loadPlaylistTracks.mockResolvedValueOnce([mockTrack]);
    mockProvider.loadPlaylists.mockResolvedValue([]);
    (loadHistory as jest.Mock).mockResolvedValueOnce([
      {
        track: mockTrack,
        source: { type: 'playlist', playlist: { id: 'p2', name: 'Other Playlist', trackCount: 3 } },
        provider: 'apple-music',
        removedAt: '2026-01-02T00:00:00.000Z',
      },
    ]);
    await renderHarness([]);
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
    await renderHarness([]);
    await setPlaylistSource();

    await act(async () => {
      await api.loadTracks();
    });
    // Nothing was filtered out — claiming "already sifted" would be false.
    expect(sift.state.loadError).toBe('This playlist has no tracks to sift.');
    expect(sift.state.phase).toBe('setup');
  });

  test('remembered keeps that filtered nothing do not steal the removed-tracks blame', async () => {
    mockProvider.loadPlaylistTracks.mockResolvedValueOnce([mockTrack]);
    // A keep of another song of this playlist: it leaves nothing out here.
    await markReviewed('apple-music:playlist:p1', 'c');
    (loadHistory as jest.Mock).mockResolvedValueOnce([
      {
        track: mockTrack,
        source: { type: 'playlist', playlist: { id: 'p1', name: 'My Playlist', trackCount: 5 } },
        provider: 'apple-music',
        removedAt: '2026-01-01T00:00:00.000Z',
        collected: true,
      },
    ]);
    await renderHarness([]);
    await setPlaylistSource();

    await act(async () => {
      await api.loadTracks();
    });
    // Only the removal filter emptied the sift — the message must say so.
    expect(sift.state.loadError).toBe(
      'All tracks in this playlist were removed in a previous sift.',
    );
  });

  test('a playlist sift leaves out songs kept in earlier sifts of that playlist, by id', async () => {
    mockProvider.loadPlaylistTracks.mockResolvedValueOnce([{ ...mockTrack, name: 'Track A (Remastered)' }, mockTrackB]);
    await markReviewed('apple-music:playlist:p1', '1');
    // Keeps of the library or another playlist don't count here.
    await markReviewed('apple-music:library', '2');
    await markReviewed('apple-music:playlist:p2', '2');
    // Its "- Sifted" was looked for once already (services/SiftedImport).
    await AsyncStorage.setItem('sift_sifted_imported', JSON.stringify(['apple-music:playlist:p1']));
    await renderHarness([]);
    await setPlaylistSource();

    await act(async () => {
      await api.loadTracks();
    });
    expect(sift.state.phase).toBe('sifting');
    expect(sift.state.tracks.map((t) => t.id)).toEqual(['2']);
    // The ledger replaced the "- Sifted" lookup: once that was done for the
    // playlist, no playlist is listed or read.
    expect(mockProvider.loadPlaylists).not.toHaveBeenCalled();
    expect(mockProvider.loadPlaylistTracks).toHaveBeenCalledTimes(1);
  });

  test('the first sift of a playlist leaves out the songs an older build saved to its "- Sifted", and looks once', async () => {
    // An older build copied each Keep into "My Playlist - Sifted", where
    // Apple Music files the song under a new id: matched by song.
    mockProvider.loadPlaylists.mockResolvedValue([
      { id: 'p1', name: 'My Playlist', trackCount: 2 },
      { id: 's1', name: 'My Playlist - Sifted', trackCount: 1 },
    ]);
    mockProvider.loadPlaylistTracks.mockImplementation(async (id: string) =>
      (id === 's1' ? [{ ...mockTrack, id: 'i.77' }] : [mockTrack, mockTrackB]));
    await renderHarness([]);
    await setPlaylistSource();

    await act(async () => {
      await api.loadTracks();
    });
    expect(sift.state.tracks.map((t) => t.id)).toEqual(['2']);
    // Remembered under the id the playlist's own load gives it.
    await expect(loadReviewedIds('apple-music:playlist:p1')).resolves.toEqual(new Set(['1']));
    // The playlist was loaded once for the sift, not again for the import.
    expect(mockProvider.loadPlaylistTracks.mock.calls).toEqual([['p1'], ['s1']]);

    await act(async () => {
      await api.loadTracks();
    });
    expect(mockProvider.loadPlaylists).toHaveBeenCalledTimes(1);
  });

  test('a playlist whose every song was kept before says so, and how to bring them back', async () => {
    mockProvider.loadPlaylistTracks.mockResolvedValueOnce([mockTrack]);
    await markReviewed('apple-music:playlist:p1', '1');
    await renderHarness([]);
    await setPlaylistSource();

    await act(async () => {
      await api.loadTracks();
    });
    expect(sift.state.loadError).toBe(
      'You\u2019ve sifted every song in this playlist. Turn on \u201cInclude songs I\u2019ve already sifted\u201d to go through them again.',
    );
    expect(sift.state.phase).toBe('setup');
  });

  test('a playlist emptied by both kept and removed songs blames both', async () => {
    mockProvider.loadPlaylistTracks.mockResolvedValueOnce([mockTrack, mockTrackB]);
    await markReviewed('apple-music:playlist:p1', '1');
    (loadHistory as jest.Mock).mockResolvedValueOnce([
      {
        track: mockTrackB,
        source: { type: 'playlist', playlist: { id: 'p1', name: 'My Playlist', trackCount: 5 } },
        provider: 'apple-music',
        removedAt: '2026-01-01T00:00:00.000Z',
        collected: true,
      },
    ]);
    await renderHarness([]);
    await setPlaylistSource();

    await act(async () => {
      await api.loadTracks();
    });
    expect(sift.state.loadError).toBe('All tracks in this playlist have already been sifted or removed.');
  });

  test('warmCache failures are captured, never thrown', async () => {
    mockProvider.warmSongCache.mockRejectedValueOnce(new Error('cache fail'));
    await renderHarness([mockTrack]);

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
  // When a flow has no real work for the missing API, it must degrade
  // gracefully on a provider that lacks it — never crash, never claim false
  // failure.

  test('saveKeptPlaylist with no playlist lookup creates the playlist empty, then adds', async () => {
    const minimal = makeMinimalProvider({
      createPlaylist: jest.fn().mockResolvedValue('new-1'),
      loadPlaylistTracks: jest.fn().mockResolvedValue([mockTrack]),
      addToPlaylist: jest.fn().mockResolvedValue(undefined),
    });
    mockActiveProvider = minimal;
    await markReviewed('apple-music:playlist:p1', '1');
    await renderHarness([mockTrack]);
    await setPlaylistSource();
    let result: unknown;
    await act(async () => {
      result = await api.saveKeptPlaylist();
    });
    // No playlists to list: none by that name, so it's made.
    expect(minimal.createPlaylist).toHaveBeenCalledWith('My Playlist - Sifted');
    expect(minimal.addToPlaylist).toHaveBeenCalledWith('new-1', ['1']);
    expect(result).toEqual({ playlistName: 'My Playlist - Sifted', sourceName: 'My Playlist', kept: 1, added: 1, notAdded: 0, leftOut: 0 });
  });

  test('saveKeptPlaylist without addToPlaylist fails before making anything', async () => {
    const minimal = makeMinimalProvider({ loadPlaylistTracks: jest.fn().mockResolvedValue([mockTrack]) });
    mockActiveProvider = minimal;
    await markReviewed('apple-music:playlist:p1', '1');
    await renderHarness([mockTrack]);
    await setPlaylistSource();
    await act(async () => {
      await expect(api.saveKeptPlaylist()).rejects.toThrow('This provider does not support adding to playlists');
    });
    expect(minimal.createPlaylist).not.toHaveBeenCalled();
  });

  test('saveKeptPlaylist without playlist reads can\'t tell what is still in the playlist, and says so', async () => {
    const minimal = makeMinimalProvider();
    mockActiveProvider = minimal;
    await markReviewed('apple-music:playlist:p1', '1');
    await renderHarness([mockTrack]);
    await setPlaylistSource();
    await act(async () => {
      await expect(api.saveKeptPlaylist()).rejects.toThrow('This provider does not support playlist loading');
    });
    expect(minimal.createPlaylist).not.toHaveBeenCalled();
  });

  test('loadTracks reports missing playlist support on a minimal provider', async () => {
    mockActiveProvider = makeMinimalProvider();
    await renderHarness([]);
    await setPlaylistSource();

    await act(async () => {
      await api.loadTracks();
    });
    expect(sift.state.loadError).toBe('Couldn\u2019t load "My Playlist". Try again in a moment.');
    expect(sift.state.phase).toBe('setup');
  });

  test('loadTracks filtering never needs to list playlists', async () => {
    const minimal = makeMinimalProvider({
      loadPlaylistTracks: jest.fn().mockResolvedValue([mockTrack]),
    });
    mockActiveProvider = minimal;
    await renderHarness([]);
    await setPlaylistSource();

    await act(async () => {
      await api.loadTracks();
    });
    // The ledger is local: nothing is filtered, the sift proceeds.
    expect(sift.state.phase).toBe('sifting');
    expect(sift.state.tracks.map((t) => t.id)).toEqual(['1']);
  });

  test('remove and restore degrade gracefully without provider removal APIs', async () => {
    const minimal = makeMinimalProvider();
    mockActiveProvider = minimal;
    await renderHarness([mockTrack]);

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
    expect(forgetRemovals).toHaveBeenCalledWith('1', 'apple-music');
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
    expect(forgetRemovals).toHaveBeenCalledTimes(2);
  });

  test('warmCache no-ops silently on a provider without cache warming', async () => {
    mockActiveProvider = makeMinimalProvider();
    await renderHarness([mockTrack]);

    await act(async () => {
      await api.warmCache(['1', '2']);
    });
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(Sentry.addBreadcrumb).not.toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('unresolved') }),
    );
  });

});
