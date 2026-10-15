import React, { useEffect } from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';
import * as Sentry from '@sentry/react-native';
import { SiftProvider, useSift } from '../../src/context/SiftContext';
import { KEPT_SAVE_BATCH, KEPT_SAVE_SETTLE_MS, resetKeptSaves, STILL_FINISHING, useMusicProvider } from '../../src/hooks/useMusicProvider';
import { AddShortfallError } from '../../src/utils/musicKit';
import { QueueStallError } from '../../src/utils/serialQueue';
import { forgetRemovals } from '../../src/services/RemovalHistoryStore';
import { loadReviewedIds, markReviewed, unmarkReviewed } from '../../src/services/ReviewedLedgerStore';
import { Track } from '../../src/types';

// Mock Sentry
jest.mock('@sentry/react-native', () => ({
  setTag: jest.fn(),
  setContext: jest.fn(),
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
}));

// Mock SessionStore
jest.mock('../../src/services/SessionStore', () => ({
  hasSession: jest.fn().mockResolvedValue(false),
  saveSession: jest.fn().mockResolvedValue(undefined),
  loadSession: jest.fn().mockResolvedValue(null),
  clearSession: jest.fn().mockResolvedValue(undefined),
}));

// Mock services
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
  findPlaylists: jest.fn().mockResolvedValue([]),
  writesSettled: jest.fn().mockResolvedValue(undefined),
};

jest.mock('../../src/services', () => ({
  createMusicProvider: jest.fn(() => mockProvider),
  MusicProviderService: {},
}));

// The reviewed ledger (#143): observable, and empty unless a test says so.
jest.mock('../../src/services/ReviewedLedgerStore', () => ({
  loadReviewedIds: jest.fn(() => Promise.resolve(new Set())),
  markReviewed: jest.fn(() => Promise.resolve()),
  unmarkReviewed: jest.fn(() => Promise.resolve()),
}));

// Mock the removal-history store so restore/remove wiring is observable and
// loadHistory is deterministic (no file IO).
jest.mock('../../src/services/RemovalHistoryStore', () => ({
  logRemoval: jest.fn(() => Promise.resolve()),
  loadHistory: jest.fn(() => Promise.resolve([])),
  removeFromHistory: jest.fn(() => Promise.resolve()),
  forgetRemovals: jest.fn(() => Promise.resolve()),
  clearHistoryForSource: jest.fn(() => Promise.resolve()),
}));

// Mock Alert. React Native's index re-exports this module via `.default`,
// so the mock must provide that key — a bare { alert } object makes the
// `import { Alert }` in the hook resolve to undefined, and every
// Alert.alert call would throw a TypeError instead of alerting (silently
// rerouting the auth-denial flows through their catch blocks).
jest.mock('react-native/Libraries/Alert/Alert', () => ({
  __esModule: true,
  default: { alert: jest.fn() },
}));

const mockTrack: Track = {
  id: '1', name: 'Track A', artist: 'Artist A', album: 'Album A',
  duration: 200, playCount: 10, dateAdded: '2020-01-01T00:00:00.000Z',
};

const mockTrackB: Track = {
  id: '2', name: 'Track B', artist: 'Artist B', album: 'Album B',
  duration: 180, playCount: 3, dateAdded: '2020-02-01T00:00:00.000Z',
};

let lastLoadPlaylistsResult: unknown[] = [];

// Deliberately unsorted by playCount so a real sort is observable.
const unsortedTracks: Track[] = [
  { id: 'high', name: 'High', artist: 'A', album: 'A', duration: 200, playCount: 10, dateAdded: '2020-01-01T00:00:00.000Z' },
  { id: 'low', name: 'Low', artist: 'B', album: 'B', duration: 200, playCount: 3, dateAdded: '2020-01-01T00:00:00.000Z' },
  { id: 'mid', name: 'Mid', artist: 'C', album: 'C', duration: 200, playCount: 5, dateAdded: '2020-01-01T00:00:00.000Z' },
];

function TestConsumer() {
  const provider = useMusicProvider();
  return (
    <>
      <TouchableOpacity testID="authorize" onPress={async () => {
        await provider.authorize();
      }} />
      <TouchableOpacity testID="play" onPress={() => provider.play('1')} />
      <TouchableOpacity testID="play-pos" onPress={() => provider.play('1', 30)} />
      <TouchableOpacity testID="pause" onPress={() => provider.pause()} />
      <TouchableOpacity testID="resume" onPress={() => provider.resume()} />
      <TouchableOpacity testID="seek" onPress={() => provider.seek(42)} />
      <TouchableOpacity testID="toggle" onPress={() => provider.togglePlayPause()} />
      <TouchableOpacity testID="skip-fwd" onPress={() => provider.skipForward()} />
      <TouchableOpacity testID="skip-bwd" onPress={() => provider.skipBackward()} />
      <TouchableOpacity testID="load-playlists" onPress={async () => {
        lastLoadPlaylistsResult = await provider.loadPlaylists();
      }} />
      <TouchableOpacity testID="load-tracks" onPress={() => provider.loadTracks()} />
      <TouchableOpacity testID="warm-cache" onPress={() => provider.warmCache(['1', '2'])} />
    </>
  );
}

function TestConsumerWithPlaylistActions() {
  const provider = useMusicProvider();
  const { state, dispatch } = useSift();
  return (
    <>
      <Text testID="load-error">{state.loadError ?? ''}</Text>
      <Text testID="phase">{state.phase}</Text>
      <TouchableOpacity testID="set-source-playlist" onPress={() => {
        dispatch({
          type: 'SET_SOURCE',
          source: { type: 'playlist', playlist: { id: 'p1', name: 'My Playlist', trackCount: 5 } },
        });
      }} />
      <TouchableOpacity testID="load-tracks" onPress={async () => {
        await provider.loadTracks();
      }} />
      <TouchableOpacity testID="load-tracks-skip" onPress={async () => {
        await provider.loadTracks({ skipFiltering: true });
      }} />
      <TouchableOpacity testID="restore-pl" onPress={() => provider.restoreTrack(mockTrack)} />
      <TouchableOpacity testID="remove-track" onPress={() => provider.removeTrack(mockTrack)} />
      <TouchableOpacity testID="restore-track" onPress={() => provider.restoreTrack(mockTrack)} />
      <TouchableOpacity testID="keep-track" onPress={() => provider.keepTrack(mockTrack)} />
      <TouchableOpacity testID="keep-track-b" onPress={() => provider.keepTrack(mockTrackB)} />
      <TouchableOpacity testID="warm-cache" onPress={() => provider.warmCache(['1', '2'])} />
    </>
  );
}

function renderWithProvider() {
  return render(
    <SiftProvider initialTracks={[mockTrack]}>
      <TestConsumer />
    </SiftProvider>
  );
}

// Renders the current state.tracks order as text and lets the test drive the
// sort order + load path, so we can assert the loaded order reflects it.
function SortConsumer() {
  const provider = useMusicProvider();
  const { state, dispatch } = useSift();
  return (
    <>
      <Text testID="track-order">{state.tracks.map((t) => t.playCount).join(',')}</Text>
      <TouchableOpacity testID="set-most-played" onPress={() => dispatch({ type: 'SET_SORT_ORDER', sortOrder: 'most-played' })} />
      <TouchableOpacity testID="sort-load-tracks" onPress={() => provider.loadTracks()} />
    </>
  );
}

describe('useMusicProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    lastLoadPlaylistsResult = [];
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
    mockProvider.findPlaylists.mockReset().mockResolvedValue([]);
    mockProvider.writesSettled.mockReset().mockResolvedValue(undefined);
    // Once-only answers a test left unused mustn't reach the next.
    mockProvider.addToPlaylist.mockReset().mockResolvedValue(undefined);
    mockProvider.createPlaylist.mockReset().mockResolvedValue('new-playlist');
    mockProvider.getPlaybackState.mockReturnValue({ position: 30, isPlaying: true });
    resetKeptSaves();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('authorize calls provider.requestAuthorization', async () => {
    const { getByTestId } = await renderWithProvider();
    await act(async () => {
      await fireEvent.press(getByTestId('authorize'));
    });
    expect(mockProvider.requestAuthorization).toHaveBeenCalled();
  });

  test('authorize returns false on error', async () => {
    mockProvider.requestAuthorization.mockRejectedValue(new Error('fail'));
    const { getByTestId } = await renderWithProvider();
    await act(async () => {
      await fireEvent.press(getByTestId('authorize'));
    });
    expect(mockProvider.requestAuthorization).toHaveBeenCalled();
  });

  test('play calls provider.play', async () => {
    const { getByTestId } = await renderWithProvider();
    await act(async () => {
      await fireEvent.press(getByTestId('play'));
    });
    expect(mockProvider.play).toHaveBeenCalledWith('1', undefined);
  });

  test('play with position', async () => {
    const { getByTestId } = await renderWithProvider();
    await act(async () => {
      await fireEvent.press(getByTestId('play-pos'));
    });
    expect(mockProvider.play).toHaveBeenCalledWith('1', 30);
  });

  test('play handles error gracefully', async () => {
    mockProvider.play.mockRejectedValue(new Error('play error'));
    const { getByTestId } = await renderWithProvider();
    await act(async () => {
      await fireEvent.press(getByTestId('play'));
    });
    // Should not throw
  });

  test('pause calls provider.pause', async () => {
    const { getByTestId } = await renderWithProvider();
    await act(async () => {
      await fireEvent.press(getByTestId('pause'));
    });
    expect(mockProvider.pause).toHaveBeenCalled();
  });

  test('pause handles error gracefully', async () => {
    mockProvider.pause.mockRejectedValue(new Error('pause error'));
    const { getByTestId } = await renderWithProvider();
    await act(async () => {
      await fireEvent.press(getByTestId('pause'));
    });
    // Should not throw
  });

  test('resume calls provider.resume', async () => {
    const { getByTestId } = await renderWithProvider();
    await act(async () => {
      await fireEvent.press(getByTestId('resume'));
    });
    expect(mockProvider.resume).toHaveBeenCalled();
  });

  test('resume handles error gracefully', async () => {
    mockProvider.resume.mockRejectedValue(new Error('resume error'));
    const { getByTestId } = await renderWithProvider();
    await act(async () => {
      await fireEvent.press(getByTestId('resume'));
    });
    // Should not throw
  });

  test('seek calls provider.seek', async () => {
    const { getByTestId } = await renderWithProvider();
    await fireEvent.press(getByTestId('seek'));
    expect(mockProvider.seek).toHaveBeenCalledWith(42);
  });

  test('skipForward calls provider.seek and getPlaybackState', async () => {
    const { getByTestId } = await renderWithProvider();
    await fireEvent.press(getByTestId('skip-fwd'));
    expect(mockProvider.getPlaybackState).toHaveBeenCalled();
    expect(mockProvider.seek).toHaveBeenCalled();
  });

  test('skipBackward calls provider.seek', async () => {
    const { getByTestId } = await renderWithProvider();
    await fireEvent.press(getByTestId('skip-bwd'));
    expect(mockProvider.getPlaybackState).toHaveBeenCalled();
    expect(mockProvider.seek).toHaveBeenCalled();
  });

  test('togglePlayPause pauses when playing, resumes when not', async () => {
    const { getByTestId } = await renderWithProvider();
    // First play to set isPlaying
    await act(async () => {
      await fireEvent.press(getByTestId('play'));
    });
    // Now toggle to pause
    await act(async () => {
      await fireEvent.press(getByTestId('toggle'));
    });
    expect(mockProvider.pause).toHaveBeenCalled();
  });

  test('togglePlayPause resumes when not playing', async () => {
    const { getByTestId } = await renderWithProvider();
    // Toggle without playing first — state.isPlaying is false, so it resumes
    await act(async () => {
      await fireEvent.press(getByTestId('toggle'));
    });
    expect(mockProvider.resume).toHaveBeenCalled();
  });

  test('polling dispatches playback position while playing', async () => {
    const { getByTestId } = await renderWithProvider();
    // Start playback to trigger polling
    await act(async () => {
      await fireEvent.press(getByTestId('play'));
    });
    // Advance timers to trigger polling interval
    await act(async () => {
      jest.advanceTimersByTime(600);
    });
    expect(mockProvider.getPlaybackState).toHaveBeenCalled();
  });

  test('loadPlaylists returns playlists from provider', async () => {
    const playlists = [{ id: 'p1', name: 'My Playlist', trackCount: 5 }];
    mockProvider.loadPlaylists.mockResolvedValue(playlists);
    const { getByTestId } = await renderWithProvider();
    await act(async () => {
      await fireEvent.press(getByTestId('load-playlists'));
    });
    expect(mockProvider.loadPlaylists).toHaveBeenCalled();
    expect(lastLoadPlaylistsResult).toEqual(playlists);
  });

  test('loadPlaylists returns empty array when provider does not support it', async () => {
    const originalLoadPlaylists = mockProvider.loadPlaylists;
    mockProvider.loadPlaylists = undefined as unknown as jest.Mock;
    const { getByTestId } = await renderWithProvider();
    await act(async () => {
      await fireEvent.press(getByTestId('load-playlists'));
    });
    expect(lastLoadPlaylistsResult).toEqual([]);
    mockProvider.loadPlaylists = originalLoadPlaylists;
  });

  test('loadPlaylists returns empty array when not authorized', async () => {
    mockProvider.isAuthorized.mockResolvedValue(false);
    mockProvider.requestAuthorization.mockResolvedValue(false);
    const { getByTestId } = await renderWithProvider();
    await act(async () => {
      await fireEvent.press(getByTestId('load-playlists'));
    });
    expect(mockProvider.requestAuthorization).toHaveBeenCalled();
  });

  test('loadPlaylists returns empty array on error', async () => {
    mockProvider.loadPlaylists.mockRejectedValue(new Error('fail'));
    const { getByTestId } = await renderWithProvider();
    await act(async () => {
      await fireEvent.press(getByTestId('load-playlists'));
    });
    // Should not throw
  });

  test('loadTracks loads library when source is library', async () => {
    const { getByTestId } = await renderWithProvider();
    await act(async () => {
      await fireEvent.press(getByTestId('load-tracks'));
    });
    expect(mockProvider.loadLibrary).toHaveBeenCalled();
  });

  test('loadTracks loads playlist tracks when source is playlist', async () => {
    mockProvider.loadPlaylistTracks.mockResolvedValue([mockTrack]);

    // We need to render with a provider that has a playlist source set.
    // The simplest approach is to use the SiftProvider and dispatch SET_SOURCE.
    const { getByTestId } = await render(
      <SiftProvider initialTracks={[mockTrack]}>
        <TestConsumerWithPlaylistActions />
      </SiftProvider>
    );

    // Set source to playlist
    await act(async () => {
      await fireEvent.press(getByTestId('set-source-playlist'));
    });

    // Now load tracks
    await act(async () => {
      await fireEvent.press(getByTestId('load-tracks'));
    });

    expect(mockProvider.loadPlaylistTracks).toHaveBeenCalledWith('p1');
  });

  test('loadTracks handles auth denial', async () => {
    mockProvider.isAuthorized.mockResolvedValue(false);
    mockProvider.requestAuthorization.mockResolvedValue(false);
    const { getByTestId } = await renderWithProvider();
    await act(async () => {
      await fireEvent.press(getByTestId('load-tracks'));
    });
    expect(mockProvider.requestAuthorization).toHaveBeenCalled();
  });

  test('loadTracks handles load error', async () => {
    mockProvider.loadLibrary.mockRejectedValue(new Error('load fail'));
    const { getByTestId } = await renderWithProvider();
    await act(async () => {
      await fireEvent.press(getByTestId('load-tracks'));
    });
    // Should not throw
  });

  test('loadTracks handles non-Error exception', async () => {
    mockProvider.loadLibrary.mockRejectedValue('string error');
    const { getByTestId } = await renderWithProvider();
    await act(async () => {
      await fireEvent.press(getByTestId('load-tracks'));
    });
    // Should dispatch generic error message
  });

  test('loadTracks sorts library tracks by state.sortOrder', async () => {
    mockProvider.loadLibrary.mockResolvedValue(unsortedTracks);
    const { getByTestId } = await render(
      <SiftProvider initialTracks={[mockTrack]}>
        <SortConsumer />
      </SiftProvider>
    );
    await act(async () => {
      await fireEvent.press(getByTestId('sort-load-tracks'));
    });
    // Default sortOrder is 'least-played' → ascending by playCount.
    expect(getByTestId('track-order').props.children).toBe('3,5,10');
  });

  test('restoreTrack on a playlist takes the song out of "Sift — Removed" and purges every exclusion record', async () => {
    // The playlist load path filters out tracks in removal history, so
    // restoring must clear the record or the track stays hidden on the next
    // sift of the playlist. A collected removal hides the song from every
    // sift, so every record of it goes.
    const { getByTestId } = await render(
      <SiftProvider initialTracks={[mockTrack]}>
        <TestConsumerWithPlaylistActions />
      </SiftProvider>
    );
    await act(async () => {
      await fireEvent.press(getByTestId('set-source-playlist'));
    });
    await act(async () => {
      await fireEvent.press(getByTestId('restore-pl'));
    });
    expect(mockProvider.restoreRemoved).toHaveBeenCalledWith(['1']);
    expect(mockProvider.addToPlaylist).not.toHaveBeenCalled();
    expect(forgetRemovals).toHaveBeenCalledWith('1', 'apple-music');
  });

  test('loadTracks filters out remembered keeps and removed tracks for playlist source', async () => {
    const trackB: Track = { id: '2', name: 'Track B', artist: 'B', album: 'B', duration: 100, playCount: 1, dateAdded: '2021-01-01T00:00:00.000Z' };
    mockProvider.loadPlaylistTracks.mockResolvedValueOnce([mockTrack, trackB]);
    (loadReviewedIds as jest.Mock).mockResolvedValueOnce(new Set(['2']));
    const { loadHistory } = require('../../src/services/RemovalHistoryStore');
    (loadHistory as jest.Mock).mockResolvedValueOnce([]);

    const { getByTestId } = await render(
      <SiftProvider initialTracks={[]}>
        <TestConsumerWithPlaylistActions />
      </SiftProvider>
    );
    await act(async () => {
      await fireEvent.press(getByTestId('set-source-playlist'));
    });
    await act(async () => {
      await fireEvent.press(getByTestId('load-tracks'));
    });
    // The source is read once; no "- Sifted" playlist is looked up.
    expect(mockProvider.loadPlaylistTracks).toHaveBeenCalledTimes(1);
    expect(mockProvider.loadPlaylists).not.toHaveBeenCalled();
    expect(loadReviewedIds).toHaveBeenCalledWith('apple-music:playlist:p1');
  });

  test('removeTrack on a playlist source collects the song in "Sift — Removed", never editing the playlist', async () => {
    const { getByTestId } = await render(
      <SiftProvider initialTracks={[mockTrack]}>
        <TestConsumerWithPlaylistActions />
      </SiftProvider>
    );
    await act(async () => {
      await fireEvent.press(getByTestId('set-source-playlist'));
    });
    await act(async () => {
      await fireEvent.press(getByTestId('remove-track'));
    });
    expect(mockProvider.removeFromLibrary).toHaveBeenCalledWith(['1']);
    expect(mockProvider.removeFromPlaylist).not.toHaveBeenCalled();
  });

  test('removeTrack handles error gracefully', async () => {
    mockProvider.removeFromLibrary.mockRejectedValueOnce(new Error('fail'));
    const { getByTestId } = await render(
      <SiftProvider initialTracks={[mockTrack]}>
        <TestConsumerWithPlaylistActions />
      </SiftProvider>
    );
    await act(async () => {
      await fireEvent.press(getByTestId('set-source-playlist'));
    });
    await act(async () => {
      await fireEvent.press(getByTestId('remove-track'));
    });
    // Should not throw
  });

  test('restoreTrack on a playlist source never adds to the playlist', async () => {
    const { getByTestId } = await render(
      <SiftProvider initialTracks={[mockTrack]}>
        <TestConsumerWithPlaylistActions />
      </SiftProvider>
    );
    await act(async () => {
      await fireEvent.press(getByTestId('set-source-playlist'));
    });
    await act(async () => {
      await fireEvent.press(getByTestId('restore-track'));
    });
    expect(mockProvider.restoreRemoved).toHaveBeenCalledWith(['1']);
    expect(mockProvider.addToPlaylist).not.toHaveBeenCalled();
  });

  test('restoreTrack handles error gracefully', async () => {
    mockProvider.addToPlaylist.mockRejectedValueOnce(new Error('fail'));
    const { getByTestId } = await render(
      <SiftProvider initialTracks={[mockTrack]}>
        <TestConsumerWithPlaylistActions />
      </SiftProvider>
    );
    await act(async () => {
      await fireEvent.press(getByTestId('set-source-playlist'));
    });
    await act(async () => {
      await fireEvent.press(getByTestId('restore-track'));
    });
    // Should not throw
  });

  test('warmCache calls provider.warmSongCache', async () => {
    const { getByTestId } = await renderWithProvider();
    await act(async () => {
      await fireEvent.press(getByTestId('warm-cache'));
    });
    // No playlist given: nothing to reload first.
    expect(mockProvider.warmSongCache).toHaveBeenCalledWith(['1', '2'], undefined);
  });

  test('warmCache requests authorization if needed', async () => {
    mockProvider.isAuthorized.mockResolvedValueOnce(false);
    mockProvider.requestAuthorization.mockResolvedValueOnce(true);
    const { getByTestId } = await renderWithProvider();
    await act(async () => {
      await fireEvent.press(getByTestId('warm-cache'));
    });
    expect(mockProvider.requestAuthorization).toHaveBeenCalled();
    expect(mockProvider.warmSongCache).toHaveBeenCalled();
  });

  test('warmCache skips when auth denied', async () => {
    mockProvider.isAuthorized.mockResolvedValueOnce(false);
    mockProvider.requestAuthorization.mockResolvedValueOnce(false);
    const { getByTestId } = await renderWithProvider();
    await act(async () => {
      await fireEvent.press(getByTestId('warm-cache'));
    });
    expect(mockProvider.warmSongCache).not.toHaveBeenCalled();
  });

  test('warmCache handles error gracefully', async () => {
    mockProvider.warmSongCache.mockRejectedValueOnce(new Error('fail'));
    const { getByTestId } = await renderWithProvider();
    await act(async () => {
      await fireEvent.press(getByTestId('warm-cache'));
    });
    // Should not throw
  });

  test('loadTracks with skipFiltering on an empty playlist returns to setup with an empty-playlist error', async () => {
    mockProvider.loadPlaylistTracks.mockResolvedValue([]);
    const { getByTestId } = await render(
      <SiftProvider initialTracks={[]}>
        <TestConsumerWithPlaylistActions />
      </SiftProvider>
    );
    await act(async () => {
      await fireEvent.press(getByTestId('set-source-playlist'));
    });
    await act(async () => {
      await fireEvent.press(getByTestId('load-tracks-skip'));
    });
    // Must not enter sifting with zero tracks (no card, no exit)…
    expect(getByTestId('phase').props.children).toBe('setup');
    // …and a genuinely empty playlist is not "already been sifted".
    expect(getByTestId('load-error').props.children).toBe('This playlist has no tracks to sift.');
  });

  test('loadTracks says every song was sifted when remembered keeps empty a non-empty playlist', async () => {
    mockProvider.loadPlaylistTracks.mockResolvedValueOnce([mockTrack]);
    (loadReviewedIds as jest.Mock).mockResolvedValueOnce(new Set(['1']));
    const { getByTestId } = await render(
      <SiftProvider initialTracks={[]}>
        <TestConsumerWithPlaylistActions />
      </SiftProvider>
    );
    await act(async () => {
      await fireEvent.press(getByTestId('set-source-playlist'));
    });
    await act(async () => {
      await fireEvent.press(getByTestId('load-tracks'));
    });
    expect(getByTestId('phase').props.children).toBe('setup');
    expect(getByTestId('load-error').props.children).toBe(
      'You\u2019ve sifted every song in this playlist. Turn on \u201cInclude songs I\u2019ve already sifted\u201d to go through them again.',
    );
  });

  test('loadTracks reports "removed in a previous sift" when only removal history emptied the playlist', async () => {
    // Nothing is remembered as kept — the single source track was
    // previously REMOVED. Blaming the ledger ("already sifted") here would
    // be a false claim.
    mockProvider.loadPlaylistTracks.mockResolvedValueOnce([mockTrack]);
    const { loadHistory } = require('../../src/services/RemovalHistoryStore');
    (loadHistory as jest.Mock).mockResolvedValueOnce([
      {
        track: mockTrack,
        source: { type: 'playlist', playlist: { id: 'p1', name: 'My Playlist', trackCount: 5 } },
        provider: 'apple-music',
        removedAt: '2026-04-08T12:00:00.000Z',
        collected: true,
      },
    ]);

    const { getByTestId } = await render(
      <SiftProvider initialTracks={[]}>
        <TestConsumerWithPlaylistActions />
      </SiftProvider>
    );
    await act(async () => {
      await fireEvent.press(getByTestId('set-source-playlist'));
    });
    await act(async () => {
      await fireEvent.press(getByTestId('load-tracks'));
    });
    expect(getByTestId('phase').props.children).toBe('setup');
    expect(getByTestId('load-error').props.children).toBe(
      'All tracks in this playlist were removed in a previous sift.',
    );
  });

  test('an older playlist removal, which never took effect, no longer hides the song', async () => {
    mockProvider.loadPlaylistTracks.mockResolvedValueOnce([mockTrack]);
    mockProvider.loadPlaylists.mockResolvedValue([]);
    const { loadHistory } = require('../../src/services/RemovalHistoryStore');
    (loadHistory as jest.Mock).mockResolvedValue([
      {
        track: mockTrack,
        source: { type: 'playlist', playlist: { id: 'p1', name: 'My Playlist', trackCount: 5 } },
        provider: 'apple-music',
        removedAt: '2026-04-08T12:00:00.000Z',
      },
    ]);
    try {
      const { getByTestId } = await render(
        <SiftProvider initialTracks={[]}>
          <TestConsumerWithPlaylistActions />
        </SiftProvider>
      );
      await act(async () => {
        await fireEvent.press(getByTestId('set-source-playlist'));
      });
      await act(async () => {
        await fireEvent.press(getByTestId('load-tracks'));
      });
      expect(getByTestId('phase').props.children).toBe('sifting');
    } finally {
      (loadHistory as jest.Mock).mockResolvedValue([]);
    }
  });

  test('a song removed in a library sift is left out of a playlist sift too', async () => {
    mockProvider.loadPlaylistTracks.mockResolvedValueOnce([mockTrack]);
    mockProvider.loadPlaylists.mockResolvedValue([]);
    const { loadHistory } = require('../../src/services/RemovalHistoryStore');
    (loadHistory as jest.Mock).mockResolvedValueOnce([
      { track: mockTrack, source: { type: 'library' }, provider: 'apple-music', removedAt: '2026-04-08T12:00:00.000Z' },
    ]);
    const { getByTestId } = await render(
      <SiftProvider initialTracks={[]}>
        <TestConsumerWithPlaylistActions />
      </SiftProvider>
    );
    await act(async () => {
      await fireEvent.press(getByTestId('set-source-playlist'));
    });
    await act(async () => {
      await fireEvent.press(getByTestId('load-tracks'));
    });
    expect(getByTestId('phase').props.children).toBe('setup');
    expect(getByTestId('load-error').props.children).toBe(
      'All tracks in this playlist were removed in a previous sift.',
    );
  });

  test('loadTracks reports the combined message when both filters emptied the playlist', async () => {
    mockProvider.loadPlaylistTracks.mockResolvedValueOnce([mockTrack, mockTrackB]);
    (loadReviewedIds as jest.Mock).mockResolvedValueOnce(new Set(['1'])); // track 1 kept before
    const { loadHistory } = require('../../src/services/RemovalHistoryStore');
    (loadHistory as jest.Mock).mockResolvedValueOnce([
      {
        track: mockTrackB, // track 2 was removed in a previous sift
        source: { type: 'playlist', playlist: { id: 'p1', name: 'My Playlist', trackCount: 5 } },
        provider: 'apple-music',
        removedAt: '2026-04-08T12:00:00.000Z',
        collected: true,
      },
    ]);

    const { getByTestId } = await render(
      <SiftProvider initialTracks={[]}>
        <TestConsumerWithPlaylistActions />
      </SiftProvider>
    );
    await act(async () => {
      await fireEvent.press(getByTestId('set-source-playlist'));
    });
    await act(async () => {
      await fireEvent.press(getByTestId('load-tracks'));
    });
    expect(getByTestId('phase').props.children).toBe('setup');
    expect(getByTestId('load-error').props.children).toBe(
      'All tracks in this playlist have already been sifted or removed.',
    );
  });

  test('loadTracks on an empty library returns to setup instead of a dead-end sift', async () => {
    mockProvider.loadLibrary.mockResolvedValue([]);
    const { getByTestId } = await render(
      <SiftProvider initialTracks={[]}>
        <TestConsumerWithPlaylistActions />
      </SiftProvider>
    );
    await act(async () => {
      await fireEvent.press(getByTestId('load-tracks'));
    });
    expect(getByTestId('phase').props.children).toBe('setup');
    expect(getByTestId('load-error').props.children).toBe('Your library has no tracks to sift.');
  });

  test('the poller runs only on the Sift screen (#144)', async () => {
    function Playing({ phase }: { phase: 'sifting' | 'done' }) {
      const { dispatch } = useSift();
      React.useEffect(() => {
        dispatch({ type: 'SET_IS_PLAYING', isPlaying: true });
        dispatch({ type: 'SET_PHASE', phase });
      }, [dispatch, phase]);
      return null;
    }
    const { rerender } = await render(<SiftProvider initialTracks={[mockTrack]}><Playing phase="sifting" /></SiftProvider>);
    await act(async () => {
      jest.advanceTimersByTime(600);
    });
    expect(mockProvider.getPlaybackState).toHaveBeenCalled();
    // The last decision moves to Done with isPlaying still set.
    await rerender(<SiftProvider initialTracks={[mockTrack]}><Playing phase="done" /></SiftProvider>);
    mockProvider.getPlaybackState.mockClear();
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(mockProvider.getPlaybackState).not.toHaveBeenCalled();
  });

  describe('reviewed ledger (#143)', () => {
    function LedgerConsumer() {
      const provider = useMusicProvider();
      const { state } = useSift();
      return (
        <>
          <Text testID="track-ids">{state.tracks.map((t) => t.id).join(',')}</Text>
          <Text testID="load-error">{state.loadError ?? ''}</Text>
          <TouchableOpacity testID="load-tracks" onPress={async () => { await provider.loadTracks(); }} />
          <TouchableOpacity testID="load-tracks-skip" onPress={async () => { await provider.loadTracks({ skipFiltering: true }); }} />
          <TouchableOpacity testID="keep-track" onPress={() => provider.keepTrack(mockTrack)} />
        </>
      );
    }
    afterEach(() => {
      // Back to the empty default even when a test fails part-way.
      (loadReviewedIds as jest.Mock).mockReset().mockResolvedValue(new Set());
    });
    const renderLedger = () => render(
      <SiftProvider initialTracks={[]}>
        <LedgerConsumer />
      </SiftProvider>,
    );

    test('a library keep is recorded under the library key', async () => {
      const { getByTestId } = await renderLedger();
      await act(async () => {
        await fireEvent.press(getByTestId('keep-track'));
      });
      expect(markReviewed).toHaveBeenCalledWith('apple-music:library', '1');
      // Nothing to add to: library keeps leave the song where it is.
      expect(mockProvider.addToPlaylist).not.toHaveBeenCalled();
    });

    test('a library sift leaves out songs kept earlier, but not skipped ones', async () => {
      mockProvider.loadLibrary.mockResolvedValue([mockTrack, mockTrackB]);
      (loadReviewedIds as jest.Mock).mockResolvedValueOnce(new Set(['1']));
      const { getByTestId } = await renderLedger();
      await act(async () => {
        await fireEvent.press(getByTestId('load-tracks'));
      });
      expect(loadReviewedIds).toHaveBeenCalledWith('apple-music:library');
      expect(getByTestId('track-ids').props.children).toBe('2');
    });

    test('skipFiltering (the Include switch, Start Over) brings them back', async () => {
      mockProvider.loadLibrary.mockResolvedValue([mockTrack, mockTrackB]);
      (loadReviewedIds as jest.Mock).mockResolvedValue(new Set(['1']));
      const { getByTestId } = await renderLedger();
      await act(async () => {
        await fireEvent.press(getByTestId('load-tracks-skip'));
      });
      // Least played first.
      expect(getByTestId('track-ids').props.children).toBe('2,1');
    });

    // ── Playlists remember keeps too ──
    let api!: ReturnType<typeof useMusicProvider>;
    let ctx!: ReturnType<typeof useSift>;
    function Capture() {
      const currentApi = useMusicProvider();
      const currentCtx = useSift();
      useEffect(() => {
        api = currentApi;
        ctx = currentCtx;
      });
      return null;
    }
    const playlistP1 = { type: 'playlist' as const, playlist: { id: 'p1', name: 'My Playlist', trackCount: 5 } };
    /** A sift of "My Playlist" (p1), loaded: its activeSource is p1. */
    async function renderOnPlaylist(tracks: Track[] = [mockTrack, mockTrackB]) {
      await render(<SiftProvider initialTracks={[]}><Capture /></SiftProvider>);
      await act(async () => {
        ctx.dispatch({ type: 'SET_SOURCE', source: playlistP1 });
      });
      await act(async () => {
        ctx.dispatch({ type: 'LOAD_TRACKS', tracks });
      });
    }
    const songs = (n: number, from = 0): Track[] => Array.from({ length: n }, (_, i) => ({
      ...mockTrack, id: `s${from + i}`, name: `Song ${from + i}`,
    }));

    test('a playlist keep is recorded under that playlist\'s key, and nothing is written to the service', async () => {
      await renderOnPlaylist();
      await act(async () => {
        await api.keepTrack(mockTrack);
      });
      expect(markReviewed).toHaveBeenCalledTimes(1);
      expect(markReviewed).toHaveBeenCalledWith('apple-music:playlist:p1', '1');
      expect(mockProvider.loadPlaylists).not.toHaveBeenCalled();
      expect(mockProvider.createPlaylist).not.toHaveBeenCalled();
      expect(mockProvider.addToPlaylist).not.toHaveBeenCalled();
    });

    test('a keep goes to the sift\'s own source, not one Setup shows since', async () => {
      await renderOnPlaylist();
      await act(async () => {
        ctx.dispatch({ type: 'SET_SOURCE', source: { type: 'library' } });
      });
      await act(async () => {
        await api.keepTrack(mockTrack);
      });
      expect(markReviewed).toHaveBeenCalledWith('apple-music:playlist:p1', '1');
    });

    test('taking back a sent keep takes it out of that source\'s ledger and says it worked', async () => {
      await renderOnPlaylist();
      let result: boolean | undefined;
      await act(async () => {
        result = await api.unkeepTrack(mockTrack);
      });
      expect(result).toBe(true);
      expect(unmarkReviewed).toHaveBeenCalledWith('apple-music:playlist:p1', '1');
      expect(mockProvider.removeFromPlaylist).not.toHaveBeenCalled();
    });

    test('so does a library one', async () => {
      await render(<SiftProvider initialTracks={[mockTrack]}><Capture /></SiftProvider>);
      await act(async () => {
        await expect(api.unkeepTrack(mockTrack)).resolves.toBe(true);
      });
      expect(unmarkReviewed).toHaveBeenCalledWith('apple-music:library', '1');
    });

    describe('saveKeptPlaylist (Done\'s "Save kept songs as a playlist")', () => {
      const NAME = 'My Playlist - Sifted';
      const result = (over: Partial<Record<'kept' | 'added' | 'notAdded' | 'leftOut', number>>) => ({
        playlistName: NAME, sourceName: 'My Playlist', kept: 0, added: 0, notAdded: 0, leftOut: 0, ...over,
      });
      /** Source "My Playlist" (p1) holds these; "- Sifted" playlists hold their own. */
      const holding = (source: Track[], sifted: Record<string, Track[]> = {}) => {
        mockProvider.loadPlaylistTracks.mockImplementation(async (id: string) => (id === 'p1' ? source : sifted[id] ?? []));
      };

      test('no "<name> - Sifted" yet: makes it empty, then adds every kept song still in the playlist', async () => {
        (loadReviewedIds as jest.Mock).mockResolvedValue(new Set(['1', '2']));
        holding([mockTrack, mockTrackB]);
        mockProvider.createPlaylist.mockResolvedValue('new-1');
        await renderOnPlaylist();
        let saved: unknown;
        await act(async () => {
          saved = await api.saveKeptPlaylist();
        });
        expect(saved).toEqual(result({ kept: 2, added: 2 }));
        expect(loadReviewedIds).toHaveBeenLastCalledWith('apple-music:playlist:p1');
        expect(mockProvider.findPlaylists).toHaveBeenCalledWith(NAME);
        expect(mockProvider.createPlaylist).toHaveBeenCalledTimes(1);
        expect(mockProvider.createPlaylist).toHaveBeenCalledWith(NAME);
        expect((mockProvider.addToPlaylist as jest.Mock).mock.calls).toEqual([['new-1', ['1', '2']]]);
        // A playlist just made has nothing in it to read.
        expect(mockProvider.loadPlaylistTracks).not.toHaveBeenCalledWith('new-1');
      });

      test(`many keeps go ${KEPT_SAVE_BATCH} at a time`, async () => {
        const kept = songs(KEPT_SAVE_BATCH * 2 + 5);
        (loadReviewedIds as jest.Mock).mockResolvedValue(new Set(kept.map((t) => t.id)));
        holding(kept);
        mockProvider.createPlaylist.mockResolvedValue('new-7');
        await renderOnPlaylist([]);
        await act(async () => {
          await expect(api.saveKeptPlaylist()).resolves.toEqual(result({ kept: kept.length, added: kept.length }));
        });
        const ids = kept.map((t) => t.id);
        expect(KEPT_SAVE_BATCH).toBe(10);
        expect((mockProvider.addToPlaylist as jest.Mock).mock.calls).toEqual([
          ['new-7', ids.slice(0, 10)],
          ['new-7', ids.slice(10, 20)],
          ['new-7', ids.slice(20)],
        ]);
      });

      test('an existing one gets only the songs not in it, matched by song across Apple\'s new ids', async () => {
        (loadReviewedIds as jest.Mock).mockResolvedValue(new Set(['1', '2']));
        mockProvider.findPlaylists.mockResolvedValue(['sifted-1']);
        // Track A landed under a library-instance id.
        holding([mockTrack, mockTrackB], { 'sifted-1': [{ ...mockTrack, id: 'library-99' }] });
        await renderOnPlaylist([]);
        let saved: unknown;
        await act(async () => {
          saved = await api.saveKeptPlaylist();
        });
        expect(mockProvider.loadPlaylistTracks).toHaveBeenCalledWith('sifted-1');
        expect(mockProvider.loadPlaylistTracks).toHaveBeenCalledWith('p1');
        expect((mockProvider.addToPlaylist as jest.Mock).mock.calls).toEqual([['sifted-1', ['2']]]);
        expect(mockProvider.createPlaylist).not.toHaveBeenCalled();
        expect(saved).toEqual(result({ kept: 2, added: 1 }));
      });

      test('everything already there: nothing is added', async () => {
        (loadReviewedIds as jest.Mock).mockResolvedValue(new Set(['1', '2']));
        mockProvider.findPlaylists.mockResolvedValue(['sifted-1']);
        holding([mockTrack, mockTrackB], { 'sifted-1': [mockTrack, mockTrackB] });
        await renderOnPlaylist();
        let saved: unknown;
        await act(async () => {
          saved = await api.saveKeptPlaylist();
        });
        expect(mockProvider.addToPlaylist).not.toHaveBeenCalled();
        expect(mockProvider.createPlaylist).not.toHaveBeenCalled();
        expect(saved).toEqual(result({ kept: 2 }));
      });

      test('keeps no longer in the playlist are left out, and counted', async () => {
        (loadReviewedIds as jest.Mock).mockResolvedValue(new Set(['gone', '1', 'also-gone']));
        holding([mockTrack, mockTrackB]);
        mockProvider.createPlaylist.mockResolvedValue('new-1');
        await renderOnPlaylist([]);
        await act(async () => {
          await expect(api.saveKeptPlaylist()).resolves.toEqual(result({ kept: 1, added: 1, leftOut: 2 }));
        });
        expect((mockProvider.addToPlaylist as jest.Mock).mock.calls).toEqual([['new-1', ['1']]]);
      });

      test('none of them still in the playlist: nothing is made', async () => {
        (loadReviewedIds as jest.Mock).mockResolvedValue(new Set(['gone', 'also-gone']));
        holding([mockTrack]);
        await renderOnPlaylist([]);
        await act(async () => {
          await expect(api.saveKeptPlaylist()).resolves.toEqual(result({ leftOut: 2 }));
        });
        expect(mockProvider.findPlaylists).not.toHaveBeenCalled();
        expect(mockProvider.createPlaylist).not.toHaveBeenCalled();
      });

      test('nothing remembered: nothing is read or written', async () => {
        await renderOnPlaylist();
        await act(async () => {
          await expect(api.saveKeptPlaylist()).resolves.toEqual(result({}));
        });
        expect(mockProvider.loadPlaylistTracks).not.toHaveBeenCalled();
        expect(mockProvider.findPlaylists).not.toHaveBeenCalled();
        expect(mockProvider.createPlaylist).not.toHaveBeenCalled();
      });

      test('songs Music refused make the save fail, to retry, after every batch was tried', async () => {
        const kept = songs(15);
        (loadReviewedIds as jest.Mock).mockResolvedValue(new Set(kept.map((t) => t.id)));
        holding(kept);
        mockProvider.createPlaylist.mockResolvedValue('new-1');
        mockProvider.addToPlaylist
          .mockRejectedValueOnce(new AddShortfallError({ added: 7, unresolved: 1, failed: 2 }))
          .mockResolvedValueOnce(undefined);
        await renderOnPlaylist([]);
        await act(async () => {
          await expect(api.saveKeptPlaylist()).rejects.toThrow(
            '12 songs added; 2 songs failed and can be tried again. 1 song couldn\u2019t be found.',
          );
        });
        expect(mockProvider.addToPlaylist).toHaveBeenCalledTimes(2);
        expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error), { tags: { flow: 'save-kept-playlist' } });
      });

      test('songs Music can\'t add are counted, and the batches after them still go', async () => {
        const kept = songs(15);
        (loadReviewedIds as jest.Mock).mockResolvedValue(new Set(kept.map((t) => t.id)));
        holding(kept);
        mockProvider.createPlaylist.mockResolvedValue('new-1');
        mockProvider.addToPlaylist.mockRejectedValueOnce(new AddShortfallError({ added: 7, unresolved: 3, failed: 0 })).mockResolvedValueOnce(undefined);
        await renderOnPlaylist([]);
        await act(async () => {
          await expect(api.saveKeptPlaylist()).resolves.toEqual(result({ kept: 15, added: 12, notAdded: 3 }));
        });
        expect(mockProvider.addToPlaylist).toHaveBeenCalledTimes(2);
        expect(Sentry.captureException).not.toHaveBeenCalled();
      });

      test('nothing that can be added isn\'t an error to retry forever: the save says how many', async () => {
        (loadReviewedIds as jest.Mock).mockResolvedValue(new Set(['1', '2']));
        holding([mockTrack, mockTrackB]);
        mockProvider.createPlaylist.mockResolvedValue('new-1');
        mockProvider.addToPlaylist.mockRejectedValueOnce(new AddShortfallError({ added: 0, unresolved: 2, failed: 0 }));
        await renderOnPlaylist([]);
        await act(async () => {
          await expect(api.saveKeptPlaylist()).resolves.toEqual(result({ kept: 2, added: 0, notAdded: 2 }));
        });
      });

      test('a batch that fails doesn\'t keep the later ones out; the save then fails with the first error', async () => {
        const kept = songs(KEPT_SAVE_BATCH * 3);
        (loadReviewedIds as jest.Mock).mockResolvedValue(new Set(kept.map((t) => t.id)));
        mockProvider.findPlaylists.mockResolvedValue(['sifted-1']);
        holding(kept);
        mockProvider.addToPlaylist
          .mockRejectedValueOnce(new Error('offline'))
          .mockRejectedValueOnce(new Error('second'))
          .mockResolvedValueOnce(undefined);
        await renderOnPlaylist([]);
        await act(async () => {
          await expect(api.saveKeptPlaylist()).rejects.toThrow('offline');
        });
        expect(mockProvider.addToPlaylist).toHaveBeenCalledTimes(3);
        expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error), { tags: { flow: 'save-kept-playlist' } });
      });

      test('a create that fails fails the save; nothing is added', async () => {
        (loadReviewedIds as jest.Mock).mockResolvedValue(new Set(['1']));
        mockProvider.createPlaylist.mockRejectedValueOnce(new Error('offline'));
        await renderOnPlaylist();
        await act(async () => {
          await expect(api.saveKeptPlaylist()).rejects.toThrow('offline');
        });
        expect(mockProvider.addToPlaylist).not.toHaveBeenCalled();
      });

      test('a save after one that made the playlist adds to that one, even with another of that name', async () => {
        (loadReviewedIds as jest.Mock).mockResolvedValue(new Set(['1']));
        holding([mockTrack]);
        mockProvider.createPlaylist.mockResolvedValue('new-1');
        mockProvider.addToPlaylist.mockRejectedValueOnce(new Error('offline'));
        await renderOnPlaylist();
        await act(async () => {
          await expect(api.saveKeptPlaylist()).rejects.toThrow('offline');
        });
        // The lookup now knows both: the one made here, and one the user made.
        mockProvider.findPlaylists.mockResolvedValue(['users-own', 'new-1']);
        await act(async () => {
          await expect(api.saveKeptPlaylist()).resolves.toEqual(result({ kept: 1, added: 1 }));
        });
        expect(mockProvider.createPlaylist).toHaveBeenCalledTimes(1);
        expect(mockProvider.addToPlaylist).toHaveBeenLastCalledWith('new-1', ['1']);
      });

      test('without the provider\'s lookup, a playlist made here is used before the library lists it', async () => {
        const findPlaylists = mockProvider.findPlaylists;
        (mockProvider as Partial<typeof mockProvider>).findPlaylists = undefined;
        try {
          (loadReviewedIds as jest.Mock).mockResolvedValue(new Set(['1']));
          mockProvider.createPlaylist.mockResolvedValue('new-1');
          mockProvider.addToPlaylist.mockRejectedValueOnce(new Error('offline'));
          await renderOnPlaylist();
          await act(async () => {
            await expect(api.saveKeptPlaylist()).rejects.toThrow('offline');
          });
          // loadPlaylists lags: it doesn't list "new-1" yet.
          await act(async () => {
            await api.saveKeptPlaylist();
          });
          expect(mockProvider.loadPlaylists).toHaveBeenCalled();
          expect(mockProvider.createPlaylist).toHaveBeenCalledTimes(1);
          expect(mockProvider.addToPlaylist).toHaveBeenLastCalledWith('new-1', ['1']);
        } finally {
          mockProvider.findPlaylists = findPlaylists;
        }
      });

      test('without the provider\'s lookup, the library\'s list finds an existing one by name', async () => {
        const findPlaylists = mockProvider.findPlaylists;
        (mockProvider as Partial<typeof mockProvider>).findPlaylists = undefined;
        try {
          (loadReviewedIds as jest.Mock).mockResolvedValue(new Set(['1']));
          mockProvider.loadPlaylists.mockResolvedValue([
            { id: 'p1', name: 'My Playlist', trackCount: 5 },
            { id: 'sifted-1', name: NAME, trackCount: 0 },
          ]);
          holding([mockTrack]);
          await renderOnPlaylist();
          await act(async () => {
            await api.saveKeptPlaylist();
          });
          expect(mockProvider.createPlaylist).not.toHaveBeenCalled();
          expect(mockProvider.addToPlaylist).toHaveBeenCalledWith('sifted-1', ['1']);
        } finally {
          mockProvider.findPlaylists = findPlaylists;
        }
      });

      test('it waits for earlier library writes to finish before reading anything', async () => {
        (loadReviewedIds as jest.Mock).mockResolvedValue(new Set(['1']));
        let settle!: () => void;
        mockProvider.writesSettled.mockImplementationOnce(() => new Promise<void>((res) => { settle = res; }));
        await renderOnPlaylist();
        let saving!: Promise<unknown>;
        await act(async () => {
          saving = api.saveKeptPlaylist();
        });
        expect(loadReviewedIds).not.toHaveBeenCalled();
        expect(mockProvider.findPlaylists).not.toHaveBeenCalled();
        await act(async () => {
          settle();
          await saving;
        });
        expect(mockProvider.addToPlaylist).toHaveBeenCalledWith('new-playlist', ['1']);
      });

      test('after a write timed out and is still landing, a save says so instead of adding the songs again', async () => {
        (loadReviewedIds as jest.Mock).mockResolvedValue(new Set(['1']));
        mockProvider.findPlaylists.mockResolvedValue(['sifted-1']);
        holding([mockTrack]);
        mockProvider.addToPlaylist.mockRejectedValueOnce(new QueueStallError(30000));
        await renderOnPlaylist();
        await act(async () => {
          await expect(api.saveKeptPlaylist()).rejects.toBeInstanceOf(QueueStallError);
        });
        // The timed-out add is still running.
        let settle!: () => void;
        mockProvider.writesSettled.mockImplementation(() => new Promise<void>((res) => { settle = res; }));
        let retry!: Promise<unknown>;
        await act(async () => {
          retry = api.saveKeptPlaylist();
          retry.catch(() => undefined);
        });
        await act(async () => {
          jest.advanceTimersByTime(KEPT_SAVE_SETTLE_MS - 1);
        });
        expect(mockProvider.addToPlaylist).toHaveBeenCalledTimes(1);
        await act(async () => {
          jest.advanceTimersByTime(1);
        });
        await expect(retry).rejects.toThrow(STILL_FINISHING);
        expect(STILL_FINISHING).toBe('Music is still finishing an earlier change. Try again in a moment.');
        expect(mockProvider.addToPlaylist).toHaveBeenCalledTimes(1);
        // Once it landed, the next save reads it and adds nothing twice.
        holding([mockTrack], { 'sifted-1': [mockTrack] });
        settle();
        mockProvider.writesSettled.mockResolvedValue(undefined);
        await act(async () => {
          await expect(api.saveKeptPlaylist()).resolves.toEqual(result({ kept: 1 }));
        });
        expect(mockProvider.addToPlaylist).toHaveBeenCalledTimes(1);
      });

      test('a library sift has nothing to save this way', async () => {
        await render(<SiftProvider initialTracks={[mockTrack]}><Capture /></SiftProvider>);
        await act(async () => {
          await expect(api.saveKeptPlaylist()).rejects.toThrow('Only a playlist sift saves its kept songs as a playlist');
        });
        expect(loadReviewedIds).not.toHaveBeenCalled();
      });

      test('it saves the sift\'s own playlist, not one Setup shows since', async () => {
        await renderOnPlaylist();
        await act(async () => {
          ctx.dispatch({ type: 'SET_SOURCE', source: { type: 'library' } });
        });
        await act(async () => {
          await api.saveKeptPlaylist();
        });
        expect(loadReviewedIds).toHaveBeenLastCalledWith('apple-music:playlist:p1');
      });

      test('two saves run one after the other, the second reading what the first left', async () => {
        (loadReviewedIds as jest.Mock).mockResolvedValue(new Set(['1']));
        let finishAdd!: () => void;
        mockProvider.createPlaylist.mockResolvedValue('new-1');
        mockProvider.addToPlaylist.mockImplementationOnce(() => new Promise<void>((resolve) => { finishAdd = resolve; }));
        await renderOnPlaylist();
        let first!: Promise<unknown>;
        let second!: Promise<unknown>;
        await act(async () => {
          first = api.saveKeptPlaylist();
          second = api.saveKeptPlaylist();
        });
        expect(mockProvider.findPlaylists).toHaveBeenCalledTimes(1);
        // The first made the playlist and added the song; the second finds both.
        mockProvider.findPlaylists.mockResolvedValue(['new-1']);
        holding([mockTrack], { 'new-1': [mockTrack] });
        await act(async () => {
          finishAdd();
          await first;
          await second;
        });
        expect(mockProvider.findPlaylists).toHaveBeenCalledTimes(2);
        expect(mockProvider.createPlaylist).toHaveBeenCalledTimes(1);
        await expect(second).resolves.toEqual(result({ kept: 1 }));
      });

      test('a failed save doesn\'t hold up the next', async () => {
        (loadReviewedIds as jest.Mock).mockResolvedValue(new Set(['1']));
        mockProvider.createPlaylist.mockRejectedValueOnce(new Error('offline'));
        await renderOnPlaylist();
        await act(async () => {
          await expect(api.saveKeptPlaylist()).rejects.toThrow('offline');
        });
        await act(async () => {
          await expect(api.saveKeptPlaylist()).resolves.toEqual(result({ kept: 1, added: 1 }));
        });
      });
    });


    test('a library that is all sifted says how to go again', async () => {
      mockProvider.loadLibrary.mockResolvedValue([mockTrack]);
      (loadReviewedIds as jest.Mock).mockResolvedValueOnce(new Set(['1']));
      const { getByTestId } = await renderLedger();
      await act(async () => {
        await fireEvent.press(getByTestId('load-tracks'));
      });
      expect(getByTestId('load-error').props.children).toBe(
        'You\u2019ve sifted every song in your library. Turn on \u201cInclude songs I\u2019ve already sifted\u201d to go through them again.',
      );
    });
  });

});
