import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';
import { SiftProvider, useSift } from '../../src/context/SiftContext';
import { useMusicProvider } from '../../src/hooks/useMusicProvider';
import { removeFromHistory } from '../../src/services/RemovalHistoryStore';
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
  createPlaylist: jest.fn().mockResolvedValue(undefined),
  removeFromPlaylist: jest.fn().mockResolvedValue(undefined),
  removeFromLibrary: jest.fn().mockResolvedValue(undefined),
  addToPlaylist: jest.fn().mockResolvedValue(undefined),
  addToLibrary: jest.fn().mockResolvedValue(undefined),
  warmSongCache: jest.fn().mockResolvedValue(undefined),
};

jest.mock('../../src/services', () => ({
  createMusicProvider: jest.fn(() => mockProvider),
  MusicProviderService: {},
}));

// Mock the removal-history store so restore/remove wiring is observable and
// loadHistory is deterministic (no file IO).
jest.mock('../../src/services/RemovalHistoryStore', () => ({
  logRemoval: jest.fn(() => Promise.resolve()),
  loadHistory: jest.fn(() => Promise.resolve([])),
  removeFromHistory: jest.fn(() => Promise.resolve()),
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
      <TouchableOpacity testID="create-playlist" onPress={() => provider.createPlaylist('Test', ['1'])} />
      <TouchableOpacity testID="load-library" onPress={() => provider.loadLibrary()} />
      <TouchableOpacity testID="load-playlists" onPress={async () => {
        lastLoadPlaylistsResult = await provider.loadPlaylists();
      }} />
      <TouchableOpacity testID="load-tracks" onPress={() => provider.loadTracks()} />
      <TouchableOpacity testID="restore" onPress={() => provider.restoreTrack(mockTrack)} />
      <TouchableOpacity testID="warm-cache" onPress={() => provider.warmCache(['1', '2'])} />
    </>
  );
}

function TestConsumerWithPlaylistActions() {
  const provider = useMusicProvider();
  const { state, dispatch } = useSift();
  return (
    <>
      <Text testID="pending-keeps">{state.pendingKeeps.map((t) => t.id).join(',')}</Text>
      <Text testID="load-error">{state.loadError ?? ''}</Text>
      <Text testID="playlist-error">{state.removalPlaylistError ?? ''}</Text>
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
      <TouchableOpacity testID="save-sifted" onPress={() => provider.saveSiftedPlaylist('My Playlist', [mockTrack])} />
      <TouchableOpacity testID="save-sifted-two" onPress={() => provider.saveSiftedPlaylist('My Playlist', [mockTrack, mockTrackB])} />
      <TouchableOpacity testID="save-sifted-empty" onPress={() => provider.saveSiftedPlaylist('My Playlist', [])} />
      <TouchableOpacity testID="warm-cache" onPress={() => provider.warmCache(['1', '2'])} />
      <TouchableOpacity testID="clear-sifted" onPress={() => provider.clearSiftedPlaylist('My Playlist')} />
      <TouchableOpacity testID="set-sifted-id" onPress={() => {
        dispatch({ type: 'SET_SIFTED_PLAYLIST_ID', id: 'sifted-renamed' });
      }} />
      <TouchableOpacity testID="add-pending-1" onPress={() => {
        dispatch({ type: 'ADD_PENDING_KEEP', track: mockTrack });
      }} />
      <TouchableOpacity testID="add-pending-2" onPress={() => {
        dispatch({ type: 'ADD_PENDING_KEEP', track: mockTrackB });
      }} />
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

// ── Unmount-during-retry harness ───────────────────────
// The probe lives outside the hook consumer so it survives the consumer's
// unmount and can observe ADD_PENDING_KEEP dispatches that land afterwards.
let capturedKeepPromises: Promise<void>[] = [];

function PendingKeepsProbe() {
  const { state } = useSift();
  return <Text testID="probe-pending-keeps">{state.pendingKeeps.map((t) => t.id).join(',')}</Text>;
}

function KeepPromiseConsumer() {
  const provider = useMusicProvider();
  const { dispatch } = useSift();
  return (
    <>
      <TouchableOpacity testID="kp-set-source" onPress={() => {
        dispatch({
          type: 'SET_SOURCE',
          source: { type: 'playlist', playlist: { id: 'p1', name: 'My Playlist', trackCount: 5 } },
        });
      }} />
      <TouchableOpacity testID="kp-keep" onPress={() => {
        capturedKeepPromises.push(provider.keepTrack(mockTrack));
      }} />
    </>
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
      <TouchableOpacity testID="sort-load-library" onPress={() => provider.loadLibrary()} />
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

  test('authorize calls provider.requestAuthorization', async () => {
    const { getByTestId } = renderWithProvider();
    await act(async () => {
      fireEvent.press(getByTestId('authorize'));
    });
    expect(mockProvider.requestAuthorization).toHaveBeenCalled();
  });

  test('authorize returns false on error', async () => {
    mockProvider.requestAuthorization.mockRejectedValue(new Error('fail'));
    const { getByTestId } = renderWithProvider();
    await act(async () => {
      fireEvent.press(getByTestId('authorize'));
    });
    expect(mockProvider.requestAuthorization).toHaveBeenCalled();
  });

  test('play calls provider.play', async () => {
    const { getByTestId } = renderWithProvider();
    await act(async () => {
      fireEvent.press(getByTestId('play'));
    });
    expect(mockProvider.play).toHaveBeenCalledWith('1', undefined);
  });

  test('play with position', async () => {
    const { getByTestId } = renderWithProvider();
    await act(async () => {
      fireEvent.press(getByTestId('play-pos'));
    });
    expect(mockProvider.play).toHaveBeenCalledWith('1', 30);
  });

  test('play handles error gracefully', async () => {
    mockProvider.play.mockRejectedValue(new Error('play error'));
    const { getByTestId } = renderWithProvider();
    await act(async () => {
      fireEvent.press(getByTestId('play'));
    });
    // Should not throw
  });

  test('pause calls provider.pause', async () => {
    const { getByTestId } = renderWithProvider();
    await act(async () => {
      fireEvent.press(getByTestId('pause'));
    });
    expect(mockProvider.pause).toHaveBeenCalled();
  });

  test('pause handles error gracefully', async () => {
    mockProvider.pause.mockRejectedValue(new Error('pause error'));
    const { getByTestId } = renderWithProvider();
    await act(async () => {
      fireEvent.press(getByTestId('pause'));
    });
    // Should not throw
  });

  test('resume calls provider.resume', async () => {
    const { getByTestId } = renderWithProvider();
    await act(async () => {
      fireEvent.press(getByTestId('resume'));
    });
    expect(mockProvider.resume).toHaveBeenCalled();
  });

  test('resume handles error gracefully', async () => {
    mockProvider.resume.mockRejectedValue(new Error('resume error'));
    const { getByTestId } = renderWithProvider();
    await act(async () => {
      fireEvent.press(getByTestId('resume'));
    });
    // Should not throw
  });

  test('seek calls provider.seek', () => {
    const { getByTestId } = renderWithProvider();
    fireEvent.press(getByTestId('seek'));
    expect(mockProvider.seek).toHaveBeenCalledWith(42);
  });

  test('skipForward calls provider.seek and getPlaybackState', () => {
    const { getByTestId } = renderWithProvider();
    fireEvent.press(getByTestId('skip-fwd'));
    expect(mockProvider.getPlaybackState).toHaveBeenCalled();
    expect(mockProvider.seek).toHaveBeenCalled();
  });

  test('skipBackward calls provider.seek', () => {
    const { getByTestId } = renderWithProvider();
    fireEvent.press(getByTestId('skip-bwd'));
    expect(mockProvider.getPlaybackState).toHaveBeenCalled();
    expect(mockProvider.seek).toHaveBeenCalled();
  });

  test('createPlaylist calls provider.createPlaylist', async () => {
    const { getByTestId } = renderWithProvider();
    await act(async () => {
      fireEvent.press(getByTestId('create-playlist'));
    });
    expect(mockProvider.createPlaylist).toHaveBeenCalledWith('Test', ['1']);
  });

  test('createPlaylist handles error', async () => {
    mockProvider.createPlaylist.mockRejectedValue(new Error('playlist fail'));
    const { getByTestId } = renderWithProvider();
    await act(async () => {
      fireEvent.press(getByTestId('create-playlist'));
    });
    // Should not throw
  });

  test('loadLibrary calls provider and dispatches tracks', async () => {
    const { getByTestId } = renderWithProvider();
    await act(async () => {
      fireEvent.press(getByTestId('load-library'));
    });
    expect(mockProvider.isAuthorized).toHaveBeenCalled();
    expect(mockProvider.loadLibrary).toHaveBeenCalled();
  });

  test('loadLibrary handles auth denial', async () => {
    mockProvider.isAuthorized.mockResolvedValue(false);
    mockProvider.requestAuthorization.mockResolvedValue(false);
    const { getByTestId } = renderWithProvider();
    await act(async () => {
      fireEvent.press(getByTestId('load-library'));
    });
    expect(mockProvider.requestAuthorization).toHaveBeenCalled();
  });

  test('loadLibrary handles load error', async () => {
    mockProvider.loadLibrary.mockRejectedValue(new Error('load fail'));
    const { getByTestId } = renderWithProvider();
    await act(async () => {
      fireEvent.press(getByTestId('load-library'));
    });
    // Should not throw, error dispatched to state
  });

  test('togglePlayPause pauses when playing, resumes when not', async () => {
    const { getByTestId } = renderWithProvider();
    // First play to set isPlaying
    await act(async () => {
      fireEvent.press(getByTestId('play'));
    });
    // Now toggle to pause
    await act(async () => {
      fireEvent.press(getByTestId('toggle'));
    });
    expect(mockProvider.pause).toHaveBeenCalled();
  });

  test('togglePlayPause resumes when not playing', async () => {
    const { getByTestId } = renderWithProvider();
    // Toggle without playing first — state.isPlaying is false, so it resumes
    await act(async () => {
      fireEvent.press(getByTestId('toggle'));
    });
    expect(mockProvider.resume).toHaveBeenCalled();
  });

  test('polling dispatches playback position while playing', async () => {
    const { getByTestId } = renderWithProvider();
    // Start playback to trigger polling
    await act(async () => {
      fireEvent.press(getByTestId('play'));
    });
    // Advance timers to trigger polling interval
    await act(async () => {
      jest.advanceTimersByTime(600);
    });
    expect(mockProvider.getPlaybackState).toHaveBeenCalled();
  });

  test('loadLibrary succeeds when initially unauthorized but grants access', async () => {
    mockProvider.isAuthorized.mockResolvedValue(false);
    mockProvider.requestAuthorization.mockResolvedValue(true);
    const { getByTestId } = renderWithProvider();
    await act(async () => {
      fireEvent.press(getByTestId('load-library'));
    });
    expect(mockProvider.requestAuthorization).toHaveBeenCalled();
    expect(mockProvider.loadLibrary).toHaveBeenCalled();
  });

  test('loadLibrary handles non-Error exception', async () => {
    mockProvider.loadLibrary.mockRejectedValue('string error');
    const { getByTestId } = renderWithProvider();
    await act(async () => {
      fireEvent.press(getByTestId('load-library'));
    });
    // Should dispatch generic error message for non-Error objects
  });

  test('loadPlaylists returns playlists from provider', async () => {
    const playlists = [{ id: 'p1', name: 'My Playlist', trackCount: 5 }];
    mockProvider.loadPlaylists.mockResolvedValue(playlists);
    const { getByTestId } = renderWithProvider();
    await act(async () => {
      fireEvent.press(getByTestId('load-playlists'));
    });
    expect(mockProvider.loadPlaylists).toHaveBeenCalled();
    expect(lastLoadPlaylistsResult).toEqual(playlists);
  });

  test('loadPlaylists returns empty array when provider does not support it', async () => {
    const originalLoadPlaylists = mockProvider.loadPlaylists;
    mockProvider.loadPlaylists = undefined as unknown as jest.Mock;
    const { getByTestId } = renderWithProvider();
    await act(async () => {
      fireEvent.press(getByTestId('load-playlists'));
    });
    expect(lastLoadPlaylistsResult).toEqual([]);
    mockProvider.loadPlaylists = originalLoadPlaylists;
  });

  test('loadPlaylists returns empty array when not authorized', async () => {
    mockProvider.isAuthorized.mockResolvedValue(false);
    mockProvider.requestAuthorization.mockResolvedValue(false);
    const { getByTestId } = renderWithProvider();
    await act(async () => {
      fireEvent.press(getByTestId('load-playlists'));
    });
    expect(mockProvider.requestAuthorization).toHaveBeenCalled();
  });

  test('loadPlaylists returns empty array on error', async () => {
    mockProvider.loadPlaylists.mockRejectedValue(new Error('fail'));
    const { getByTestId } = renderWithProvider();
    await act(async () => {
      fireEvent.press(getByTestId('load-playlists'));
    });
    // Should not throw
  });

  test('loadTracks loads library when source is library', async () => {
    const { getByTestId } = renderWithProvider();
    await act(async () => {
      fireEvent.press(getByTestId('load-tracks'));
    });
    expect(mockProvider.loadLibrary).toHaveBeenCalled();
  });

  test('loadTracks loads playlist tracks when source is playlist', async () => {
    mockProvider.loadPlaylistTracks.mockResolvedValue([mockTrack]);

    // We need to render with a provider that has a playlist source set.
    // The simplest approach is to use the SiftProvider and dispatch SET_SOURCE.
    const { getByTestId } = render(
      <SiftProvider initialTracks={[mockTrack]}>
        <TestConsumerWithPlaylistActions />
      </SiftProvider>
    );

    // Set source to playlist
    await act(async () => {
      fireEvent.press(getByTestId('set-source-playlist'));
    });

    // Now load tracks
    await act(async () => {
      fireEvent.press(getByTestId('load-tracks'));
    });

    expect(mockProvider.loadPlaylistTracks).toHaveBeenCalledWith('p1');
  });

  test('loadTracks handles auth denial', async () => {
    mockProvider.isAuthorized.mockResolvedValue(false);
    mockProvider.requestAuthorization.mockResolvedValue(false);
    const { getByTestId } = renderWithProvider();
    await act(async () => {
      fireEvent.press(getByTestId('load-tracks'));
    });
    expect(mockProvider.requestAuthorization).toHaveBeenCalled();
  });

  test('loadTracks handles load error', async () => {
    mockProvider.loadLibrary.mockRejectedValue(new Error('load fail'));
    const { getByTestId } = renderWithProvider();
    await act(async () => {
      fireEvent.press(getByTestId('load-tracks'));
    });
    // Should not throw
  });

  test('loadTracks handles non-Error exception', async () => {
    mockProvider.loadLibrary.mockRejectedValue('string error');
    const { getByTestId } = renderWithProvider();
    await act(async () => {
      fireEvent.press(getByTestId('load-tracks'));
    });
    // Should dispatch generic error message
  });

  test('loadLibrary sorts tracks by state.sortOrder (least-played default)', async () => {
    mockProvider.loadLibrary.mockResolvedValue(unsortedTracks);
    const { getByTestId } = render(
      <SiftProvider initialTracks={[mockTrack]}>
        <SortConsumer />
      </SiftProvider>
    );
    // Default sortOrder is 'least-played' → ascending by playCount.
    await act(async () => {
      fireEvent.press(getByTestId('sort-load-library'));
    });
    expect(getByTestId('track-order').props.children).toBe('3,5,10');
  });

  test('loadLibrary re-sorts when state.sortOrder changes to most-played', async () => {
    mockProvider.loadLibrary.mockResolvedValue(unsortedTracks);
    const { getByTestId } = render(
      <SiftProvider initialTracks={[mockTrack]}>
        <SortConsumer />
      </SiftProvider>
    );
    await act(async () => {
      fireEvent.press(getByTestId('set-most-played'));
    });
    await act(async () => {
      fireEvent.press(getByTestId('sort-load-library'));
    });
    // 'most-played' → descending by playCount.
    expect(getByTestId('track-order').props.children).toBe('10,5,3');
  });

  test('loadTracks sorts library tracks by state.sortOrder', async () => {
    mockProvider.loadLibrary.mockResolvedValue(unsortedTracks);
    const { getByTestId } = render(
      <SiftProvider initialTracks={[mockTrack]}>
        <SortConsumer />
      </SiftProvider>
    );
    await act(async () => {
      fireEvent.press(getByTestId('sort-load-tracks'));
    });
    // Default sortOrder is 'least-played' → ascending by playCount.
    expect(getByTestId('track-order').props.children).toBe('3,5,10');
  });

  test('restoreTrack re-adds to the library and purges its history record', async () => {
    const { getByTestId } = renderWithProvider();
    await act(async () => {
      fireEvent.press(getByTestId('restore'));
    });
    // Default source is library, so it re-adds to the library…
    expect(mockProvider.addToLibrary).toHaveBeenCalledWith(['1']);
    // …and clears the history entry (kept consistent with removeTrack, which
    // logs removals for both source types).
    expect(removeFromHistory).toHaveBeenCalledWith('1', { type: 'library' });
  });

  test('restoreTrack on a playlist re-adds to the playlist and purges the exclusion record', async () => {
    // This is the user-facing fix: the playlist load path filters out tracks in
    // removal history, so restoring must clear that record or the track stays
    // hidden on the next sift of the playlist.
    const { getByTestId } = render(
      <SiftProvider initialTracks={[mockTrack]}>
        <TestConsumerWithPlaylistActions />
      </SiftProvider>
    );
    await act(async () => {
      fireEvent.press(getByTestId('set-source-playlist'));
    });
    await act(async () => {
      fireEvent.press(getByTestId('restore-pl'));
    });
    expect(mockProvider.addToPlaylist).toHaveBeenCalledWith('p1', ['1']);
    expect(removeFromHistory).toHaveBeenCalledWith('1', {
      type: 'playlist',
      playlist: { id: 'p1', name: 'My Playlist', trackCount: 5 },
    });
  });

  test('restoreTrack does not purge history when the re-add fails', async () => {
    mockProvider.addToLibrary.mockRejectedValueOnce(new Error('network'));
    const { getByTestId } = renderWithProvider();
    await act(async () => {
      fireEvent.press(getByTestId('restore'));
    });
    // The re-add was attempted…
    expect(mockProvider.addToLibrary).toHaveBeenCalledWith(['1']);
    // …but history is purged only after a successful re-add, so a failed
    // restore must leave the exclusion record in place.
    expect(removeFromHistory).not.toHaveBeenCalled();
  });

  test('loadTracks filters out sifted and removed tracks for playlist source', async () => {
    const trackB: Track = { id: '2', name: 'Track B', artist: 'B', album: 'B', duration: 100, playCount: 1, dateAdded: '2021-01-01T00:00:00.000Z' };
    mockProvider.loadPlaylistTracks
      .mockResolvedValueOnce([mockTrack, trackB]) // original playlist
      .mockResolvedValueOnce([trackB]); // sifted playlist contains trackB
    mockProvider.loadPlaylists.mockResolvedValue([
      { id: 'sifted-1', name: 'My Playlist - Sifted', trackCount: 1 },
    ]);
    const { loadHistory } = require('../../src/services/RemovalHistoryStore');
    (loadHistory as jest.Mock).mockResolvedValueOnce([]);

    const { getByTestId } = render(
      <SiftProvider initialTracks={[]}>
        <TestConsumerWithPlaylistActions />
      </SiftProvider>
    );
    await act(async () => {
      fireEvent.press(getByTestId('set-source-playlist'));
    });
    await act(async () => {
      fireEvent.press(getByTestId('load-tracks'));
    });
    // loadPlaylistTracks called twice: once for source, once for sifted
    expect(mockProvider.loadPlaylistTracks).toHaveBeenCalledTimes(2);
  });

  test('removeTrack calls removeFromPlaylist for playlist source', async () => {
    const { getByTestId } = render(
      <SiftProvider initialTracks={[mockTrack]}>
        <TestConsumerWithPlaylistActions />
      </SiftProvider>
    );
    await act(async () => {
      fireEvent.press(getByTestId('set-source-playlist'));
    });
    await act(async () => {
      fireEvent.press(getByTestId('remove-track'));
    });
    expect(mockProvider.removeFromPlaylist).toHaveBeenCalledWith('p1', ['1']);
  });

  test('removeTrack handles error gracefully', async () => {
    mockProvider.removeFromPlaylist.mockRejectedValueOnce(new Error('fail'));
    const { getByTestId } = render(
      <SiftProvider initialTracks={[mockTrack]}>
        <TestConsumerWithPlaylistActions />
      </SiftProvider>
    );
    await act(async () => {
      fireEvent.press(getByTestId('set-source-playlist'));
    });
    await act(async () => {
      fireEvent.press(getByTestId('remove-track'));
    });
    // Should not throw
  });

  test('restoreTrack calls addToPlaylist for playlist source', async () => {
    const { getByTestId } = render(
      <SiftProvider initialTracks={[mockTrack]}>
        <TestConsumerWithPlaylistActions />
      </SiftProvider>
    );
    await act(async () => {
      fireEvent.press(getByTestId('set-source-playlist'));
    });
    await act(async () => {
      fireEvent.press(getByTestId('restore-track'));
    });
    expect(mockProvider.addToPlaylist).toHaveBeenCalledWith('p1', ['1']);
  });

  test('restoreTrack handles error gracefully', async () => {
    mockProvider.addToPlaylist.mockRejectedValueOnce(new Error('fail'));
    const { getByTestId } = render(
      <SiftProvider initialTracks={[mockTrack]}>
        <TestConsumerWithPlaylistActions />
      </SiftProvider>
    );
    await act(async () => {
      fireEvent.press(getByTestId('set-source-playlist'));
    });
    await act(async () => {
      fireEvent.press(getByTestId('restore-track'));
    });
    // Should not throw
  });

  test('saveSiftedPlaylist creates new playlist when none exists', async () => {
    mockProvider.loadPlaylists.mockResolvedValue([]);
    const { getByTestId } = render(
      <SiftProvider initialTracks={[mockTrack]}>
        <TestConsumerWithPlaylistActions />
      </SiftProvider>
    );
    await act(async () => {
      fireEvent.press(getByTestId('save-sifted'));
    });
    expect(mockProvider.createPlaylist).toHaveBeenCalledWith('My Playlist - Sifted', ['1']);
  });

  test('saveSiftedPlaylist adds to existing playlist', async () => {
    mockProvider.loadPlaylists.mockResolvedValue([
      { id: 'sifted-1', name: 'My Playlist - Sifted', trackCount: 0 },
    ]);
    mockProvider.loadPlaylistTracks.mockResolvedValue([]);
    const { getByTestId } = render(
      <SiftProvider initialTracks={[mockTrack]}>
        <TestConsumerWithPlaylistActions />
      </SiftProvider>
    );
    await act(async () => {
      fireEvent.press(getByTestId('save-sifted'));
    });
    expect(mockProvider.addToPlaylist).toHaveBeenCalledWith('sifted-1', ['1']);
  });

  test('saveSiftedPlaylist skips already-existing tracks', async () => {
    mockProvider.loadPlaylists.mockResolvedValue([
      { id: 'sifted-1', name: 'My Playlist - Sifted', trackCount: 1 },
    ]);
    mockProvider.loadPlaylistTracks.mockResolvedValue([mockTrack]);
    const { getByTestId } = render(
      <SiftProvider initialTracks={[mockTrack]}>
        <TestConsumerWithPlaylistActions />
      </SiftProvider>
    );
    await act(async () => {
      fireEvent.press(getByTestId('save-sifted'));
    });
    // All tracks already exist, addToPlaylist should not be called
    expect(mockProvider.addToPlaylist).not.toHaveBeenCalled();
  });

  test('saveSiftedPlaylist does nothing for empty kept tracks', async () => {
    const { getByTestId } = render(
      <SiftProvider initialTracks={[mockTrack]}>
        <TestConsumerWithPlaylistActions />
      </SiftProvider>
    );
    await act(async () => {
      fireEvent.press(getByTestId('save-sifted-empty'));
    });
    expect(mockProvider.createPlaylist).not.toHaveBeenCalled();
  });

  test('saveSiftedPlaylist handles error gracefully', async () => {
    mockProvider.loadPlaylists.mockRejectedValueOnce(new Error('fail'));
    const { getByTestId } = render(
      <SiftProvider initialTracks={[mockTrack]}>
        <TestConsumerWithPlaylistActions />
      </SiftProvider>
    );
    await act(async () => {
      fireEvent.press(getByTestId('save-sifted'));
    });
    // Should not throw
  });

  test('keepTrack creates sifted playlist when none exists', async () => {
    mockProvider.loadPlaylists
      .mockResolvedValueOnce([]) // no existing sifted playlist
      .mockResolvedValueOnce([{ id: 'new-sifted', name: 'My Playlist - Sifted', trackCount: 1 }]); // after creation
    const { getByTestId } = render(
      <SiftProvider initialTracks={[mockTrack]}>
        <TestConsumerWithPlaylistActions />
      </SiftProvider>
    );
    await act(async () => {
      fireEvent.press(getByTestId('set-source-playlist'));
    });
    await act(async () => {
      fireEvent.press(getByTestId('keep-track'));
    });
    expect(mockProvider.createPlaylist).toHaveBeenCalledWith('My Playlist - Sifted', ['1']);
  });

  test('keepTrack adds to existing sifted playlist', async () => {
    mockProvider.loadPlaylists.mockResolvedValue([
      { id: 'sifted-1', name: 'My Playlist - Sifted', trackCount: 1 },
    ]);
    const { getByTestId } = render(
      <SiftProvider initialTracks={[mockTrack]}>
        <TestConsumerWithPlaylistActions />
      </SiftProvider>
    );
    await act(async () => {
      fireEvent.press(getByTestId('set-source-playlist'));
    });
    // Reset the module-level sifted playlist cache
    await act(async () => {
      fireEvent.press(getByTestId('clear-sifted'));
    });
    mockProvider.loadPlaylists.mockResolvedValue([
      { id: 'sifted-1', name: 'My Playlist - Sifted', trackCount: 1 },
    ]);
    // The duplicate-guard readback finds the playlist empty, so the direct
    // add goes through.
    mockProvider.loadPlaylistTracks.mockResolvedValue([]);
    await act(async () => {
      fireEvent.press(getByTestId('keep-track'));
    });
    expect(mockProvider.addToPlaylist).toHaveBeenCalledWith('sifted-1', ['1']);
  });

  test('concurrent keepTrack calls only create sifted playlist once', async () => {
    mockProvider.loadPlaylists.mockReset();
    // First lookup: empty (so first keepTrack creates). Subsequent lookups
    // return the newly-created playlist so findSiftedPlaylistWithRetry resolves.
    mockProvider.loadPlaylists
      .mockResolvedValueOnce([])
      .mockResolvedValue([{ id: 'new-sifted', name: 'My Playlist - Sifted', trackCount: 1 }]);

    const { getByTestId } = render(
      <SiftProvider initialTracks={[mockTrack]}>
        <TestConsumerWithPlaylistActions />
      </SiftProvider>
    );
    await act(async () => {
      fireEvent.press(getByTestId('set-source-playlist'));
    });
    // Fire two keep-track calls before yielding to the queue. Both are for
    // the SAME track: the first creates the playlist with it, and the
    // duplicate guard must recognize the second as already present instead
    // of double-adding it.
    await act(async () => {
      fireEvent.press(getByTestId('keep-track'));
      fireEvent.press(getByTestId('keep-track'));
    });

    expect(mockProvider.createPlaylist).toHaveBeenCalledTimes(1);
    expect(mockProvider.addToPlaylist).not.toHaveBeenCalled();
  });

  test('concurrent keeps of two distinct tracks each land once', async () => {
    mockProvider.loadPlaylists.mockReset();
    // First lookup: empty, so T1 creates the playlist (seeding the contents
    // cache with itself); subsequent lookups return it so the id resolves.
    mockProvider.loadPlaylists
      .mockResolvedValueOnce([])
      .mockResolvedValue([{ id: 'new-sifted', name: 'My Playlist - Sifted', trackCount: 1 }]);

    const { getByTestId } = render(
      <SiftProvider initialTracks={[mockTrack, mockTrackB]}>
        <TestConsumerWithPlaylistActions />
      </SiftProvider>
    );
    await act(async () => {
      fireEvent.press(getByTestId('set-source-playlist'));
    });
    // Queue both keeps before yielding. T1 creates the playlist WITH itself;
    // T2 dequeues into a single direct add. The creation-seeded contents
    // cache stands in for the readback, so loadPlaylistTracks never runs.
    await act(async () => {
      fireEvent.press(getByTestId('keep-track'));
      fireEvent.press(getByTestId('keep-track-b'));
    });

    expect(mockProvider.createPlaylist).toHaveBeenCalledTimes(1);
    expect(mockProvider.createPlaylist).toHaveBeenCalledWith('My Playlist - Sifted', ['1']);
    expect(mockProvider.addToPlaylist).toHaveBeenCalledTimes(1);
    expect(mockProvider.addToPlaylist).toHaveBeenCalledWith('new-sifted', ['2']);
    expect(mockProvider.loadPlaylistTracks).not.toHaveBeenCalled();
    // Neither keep was buffered — both landed.
    expect(getByTestId('pending-keeps').props.children).toBe('');
  });

  test('a thrown add does not poison the contents cache — the next keep retries the add', async () => {
    mockProvider.loadPlaylists.mockReset();
    mockProvider.loadPlaylists.mockResolvedValue([
      { id: 'sifted-1', name: 'My Playlist - Sifted', trackCount: 0 },
    ]);
    // Readback: the playlist is currently empty.
    mockProvider.loadPlaylistTracks.mockResolvedValue([]);
    mockProvider.addToPlaylist.mockRejectedValueOnce(new Error('network'));

    const { getByTestId } = render(
      <SiftProvider initialTracks={[mockTrack]}>
        <TestConsumerWithPlaylistActions />
      </SiftProvider>
    );
    await act(async () => {
      fireEvent.press(getByTestId('set-source-playlist'));
    });

    // First keep: the direct add throws — the track is buffered, and it
    // must NOT be recorded as present in the contents cache.
    await act(async () => {
      fireEvent.press(getByTestId('keep-track'));
    });
    expect(getByTestId('pending-keeps').props.children).toBe('1');
    expect(mockProvider.addToPlaylist).toHaveBeenCalledTimes(1);

    // Second keep of the same track: the cache still reports it absent, so
    // the add is retried (and succeeds this time).
    await act(async () => {
      fireEvent.press(getByTestId('keep-track'));
    });
    expect(mockProvider.addToPlaylist).toHaveBeenCalledTimes(2);
    expect(mockProvider.addToPlaylist).toHaveBeenLastCalledWith('sifted-1', ['1']);
    // Exactly one readback — the failure invalidated nothing.
    expect(mockProvider.loadPlaylistTracks).toHaveBeenCalledTimes(1);
  });

  test('re-sift after Start Over re-adds a previously kept track', async () => {
    mockProvider.loadPlaylists.mockReset();
    mockProvider.loadPlaylists.mockResolvedValue([
      { id: 'sifted-1', name: 'My Playlist - Sifted', trackCount: 0 },
    ]);
    mockProvider.loadPlaylistTracks.mockResolvedValue([]);

    const first = render(
      <SiftProvider initialTracks={[mockTrack]}>
        <TestConsumerWithPlaylistActions />
      </SiftProvider>
    );
    await act(async () => {
      fireEvent.press(first.getByTestId('set-source-playlist'));
    });
    await act(async () => {
      fireEvent.press(first.getByTestId('keep-track'));
    });
    expect(mockProvider.addToPlaylist).toHaveBeenCalledTimes(1);

    // Start Over: the clear empties the playlist and invalidates the
    // calling instance's caches.
    await act(async () => {
      fireEvent.press(first.getByTestId('clear-sifted'));
    });
    first.unmount();

    // Fresh consumer (START_FRESH remounts the sifting screen, discarding
    // the per-instance caches): keeping the same track again must
    // re-resolve the playlist, read back the now-empty contents, and fire
    // the add a second time — never trust a stale "already present" cache.
    const second = render(
      <SiftProvider initialTracks={[mockTrack]}>
        <TestConsumerWithPlaylistActions />
      </SiftProvider>
    );
    await act(async () => {
      fireEvent.press(second.getByTestId('set-source-playlist'));
    });
    await act(async () => {
      fireEvent.press(second.getByTestId('keep-track'));
    });

    expect(mockProvider.addToPlaylist).toHaveBeenCalledTimes(2);
    expect(mockProvider.addToPlaylist).toHaveBeenLastCalledWith('sifted-1', ['1']);
    expect(second.getByTestId('pending-keeps').props.children).toBe('');
  });

  test('keepTrack handles error gracefully', async () => {
    mockProvider.loadPlaylists.mockRejectedValueOnce(new Error('fail'));
    const { getByTestId, unmount } = render(
      <SiftProvider initialTracks={[mockTrack]}>
        <TestConsumerWithPlaylistActions />
      </SiftProvider>
    );
    await act(async () => {
      fireEvent.press(getByTestId('set-source-playlist'));
    });
    await act(async () => {
      fireEvent.press(getByTestId('keep-track'));
    });
    // Unmount to prevent leaked async work from affecting the next test
    unmount();
  });

  test('warmCache calls provider.warmSongCache', async () => {
    const { getByTestId } = renderWithProvider();
    await act(async () => {
      fireEvent.press(getByTestId('warm-cache'));
    });
    expect(mockProvider.warmSongCache).toHaveBeenCalledWith(['1', '2']);
  });

  test('warmCache requests authorization if needed', async () => {
    mockProvider.isAuthorized.mockResolvedValueOnce(false);
    mockProvider.requestAuthorization.mockResolvedValueOnce(true);
    const { getByTestId } = renderWithProvider();
    await act(async () => {
      fireEvent.press(getByTestId('warm-cache'));
    });
    expect(mockProvider.requestAuthorization).toHaveBeenCalled();
    expect(mockProvider.warmSongCache).toHaveBeenCalled();
  });

  test('warmCache skips when auth denied', async () => {
    mockProvider.isAuthorized.mockResolvedValueOnce(false);
    mockProvider.requestAuthorization.mockResolvedValueOnce(false);
    const { getByTestId } = renderWithProvider();
    await act(async () => {
      fireEvent.press(getByTestId('warm-cache'));
    });
    expect(mockProvider.warmSongCache).not.toHaveBeenCalled();
  });

  test('warmCache handles error gracefully', async () => {
    mockProvider.warmSongCache.mockRejectedValueOnce(new Error('fail'));
    const { getByTestId } = renderWithProvider();
    await act(async () => {
      fireEvent.press(getByTestId('warm-cache'));
    });
    // Should not throw
  });

  test('clearSiftedPlaylist removes all tracks from sifted playlist', async () => {
    jest.useRealTimers();
    mockProvider.loadPlaylists.mockReset();
    mockProvider.loadPlaylists.mockResolvedValue([
      { id: 'sifted-1', name: 'My Playlist - Sifted', trackCount: 1 },
    ]);
    mockProvider.loadPlaylistTracks.mockResolvedValue([mockTrack]);

    const { getByTestId } = render(
      <SiftProvider initialTracks={[mockTrack]}>
        <TestConsumerWithPlaylistActions />
      </SiftProvider>
    );
    await act(async () => {
      fireEvent.press(getByTestId('clear-sifted'));
    });
    expect(mockProvider.removeFromPlaylist).toHaveBeenCalledWith('sifted-1', ['1']);
    jest.useFakeTimers();
  });

  test('clearSiftedPlaylist does nothing when no sifted playlist exists', async () => {
    mockProvider.loadPlaylists.mockResolvedValue([]);
    const { getByTestId } = render(
      <SiftProvider initialTracks={[mockTrack]}>
        <TestConsumerWithPlaylistActions />
      </SiftProvider>
    );
    await act(async () => {
      fireEvent.press(getByTestId('clear-sifted'));
    });
    expect(mockProvider.removeFromPlaylist).not.toHaveBeenCalled();
  });

  test('clearSiftedPlaylist handles error gracefully', async () => {
    mockProvider.loadPlaylists.mockRejectedValueOnce(new Error('fail'));
    const { getByTestId } = render(
      <SiftProvider initialTracks={[mockTrack]}>
        <TestConsumerWithPlaylistActions />
      </SiftProvider>
    );
    await act(async () => {
      fireEvent.press(getByTestId('clear-sifted'));
    });
    // Should not throw
  });

  test('keepTrack buffers the track when the sifted playlist cannot be resolved, and saveSiftedPlaylist flushes it', async () => {
    // The sifted playlist never shows up in loadPlaylists, so
    // findSiftedPlaylistWithRetry exhausts its retry window every time.
    mockProvider.loadPlaylists.mockReset();
    mockProvider.loadPlaylists.mockResolvedValue([]);

    const { getByTestId } = render(
      <SiftProvider initialTracks={[mockTrack]}>
        <TestConsumerWithPlaylistActions />
      </SiftProvider>
    );
    await act(async () => {
      fireEvent.press(getByTestId('set-source-playlist'));
    });

    // First keep: creates the playlist with the track — it landed, so
    // nothing is buffered even though the follow-up lookup fails.
    await act(async () => {
      fireEvent.press(getByTestId('keep-track'));
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1100);
    });
    expect(mockProvider.createPlaylist).toHaveBeenCalledTimes(1);
    expect(getByTestId('pending-keeps').props.children).toBe('');

    // Second keep: the playlist id is still unresolved and the retry window
    // exhausts again — the track must be buffered, not silently dropped.
    await act(async () => {
      fireEvent.press(getByTestId('keep-track'));
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1100);
    });
    expect(getByTestId('pending-keeps').props.children).toBe('1');
    expect(mockProvider.createPlaylist).toHaveBeenCalledTimes(1);
    expect(mockProvider.addToPlaylist).not.toHaveBeenCalled();

    // At Done, saveSiftedPlaylist persists the kept list and clears the buffer.
    mockProvider.loadPlaylists.mockResolvedValue([
      { id: 'sifted-1', name: 'My Playlist - Sifted', trackCount: 1 },
    ]);
    mockProvider.loadPlaylistTracks.mockResolvedValue([]);
    await act(async () => {
      fireEvent.press(getByTestId('save-sifted'));
    });
    expect(mockProvider.addToPlaylist).toHaveBeenCalledWith('sifted-1', ['1']);
    expect(getByTestId('pending-keeps').props.children).toBe('');
  });

  test('unmount during the retry delay settles in-flight keepTrack instead of hanging', async () => {
    capturedKeepPromises = [];
    // The sifted playlist never becomes visible, so after createPlaylist the
    // retry loop parks on its 250 ms delay timer.
    mockProvider.loadPlaylists.mockReset();
    mockProvider.loadPlaylists.mockResolvedValue([]);

    const { getByTestId, rerender } = render(
      <SiftProvider initialTracks={[mockTrack]}>
        <PendingKeepsProbe />
        <KeepPromiseConsumer />
      </SiftProvider>
    );
    await act(async () => {
      fireEvent.press(getByTestId('kp-set-source'));
    });

    // Two keeps: the first creates the playlist and enters the retry delay;
    // the second queues behind it and can only proceed once the first settles.
    await act(async () => {
      fireEvent.press(getByTestId('kp-keep'));
      fireEvent.press(getByTestId('kp-keep'));
    });
    expect(mockProvider.createPlaylist).toHaveBeenCalledTimes(1);
    expect(capturedKeepPromises).toHaveLength(2);

    // Unmount the hook consumer (SiftScreen leaving the sifting phase) while
    // the retry timer is pending. The unmount cleanup clears the timer — it
    // must also resolve the awaited promise or both keeps hang forever.
    rerender(
      <SiftProvider initialTracks={[mockTrack]}>
        <PendingKeepsProbe />
      </SiftProvider>
    );

    // Without the fix this never settles (clearTimeout strands the resolver)
    // and the test times out. No timer advancement: resolution must come from
    // the unmount cleanup itself.
    await act(async () => {
      await Promise.all(capturedKeepPromises);
    });

    // The queued second keep could not land anywhere after unmount — it must
    // be buffered via ADD_PENDING_KEEP, not silently dropped.
    expect(getByTestId('probe-pending-keeps').props.children).toBe('1');
    expect(mockProvider.createPlaylist).toHaveBeenCalledTimes(1);
    // And no zombie work: once unmounted, the retry loop must stop querying
    // the provider (initial lookup + the one pre-unmount retry attempt).
    expect(mockProvider.loadPlaylists).toHaveBeenCalledTimes(2);
  });

  test('keepTrack buffers the track when the playlist add throws', async () => {
    mockProvider.loadPlaylists.mockReset();
    mockProvider.loadPlaylists.mockResolvedValue([
      { id: 'sifted-1', name: 'My Playlist - Sifted', trackCount: 1 },
    ]);
    // The duplicate-guard readback finds the playlist empty, so keepTrack
    // attempts the direct add — which fails.
    mockProvider.loadPlaylistTracks.mockResolvedValue([]);
    mockProvider.addToPlaylist.mockRejectedValueOnce(new Error('network'));

    const { getByTestId } = render(
      <SiftProvider initialTracks={[mockTrack]}>
        <TestConsumerWithPlaylistActions />
      </SiftProvider>
    );
    await act(async () => {
      fireEvent.press(getByTestId('set-source-playlist'));
    });
    await act(async () => {
      fireEvent.press(getByTestId('keep-track'));
    });
    expect(getByTestId('pending-keeps').props.children).toBe('1');
  });

  test('loadTracks with skipFiltering on an empty playlist returns to setup with an empty-playlist error', async () => {
    mockProvider.loadPlaylistTracks.mockResolvedValue([]);
    const { getByTestId } = render(
      <SiftProvider initialTracks={[]}>
        <TestConsumerWithPlaylistActions />
      </SiftProvider>
    );
    await act(async () => {
      fireEvent.press(getByTestId('set-source-playlist'));
    });
    await act(async () => {
      fireEvent.press(getByTestId('load-tracks-skip'));
    });
    // Must not enter sifting with zero tracks (no card, no exit)…
    expect(getByTestId('phase').props.children).toBe('setup');
    // …and a genuinely empty playlist is not "already been sifted".
    expect(getByTestId('load-error').props.children).toBe('This playlist has no tracks to sift.');
  });

  test('loadTracks keeps the already-sifted error when filtering empties a non-empty playlist', async () => {
    mockProvider.loadPlaylistTracks
      .mockResolvedValueOnce([mockTrack]) // source playlist
      .mockResolvedValueOnce([mockTrack]); // sifted playlist already has it
    mockProvider.loadPlaylists.mockResolvedValue([
      { id: 'sifted-1', name: 'My Playlist - Sifted', trackCount: 1 },
    ]);
    const { getByTestId } = render(
      <SiftProvider initialTracks={[]}>
        <TestConsumerWithPlaylistActions />
      </SiftProvider>
    );
    await act(async () => {
      fireEvent.press(getByTestId('set-source-playlist'));
    });
    await act(async () => {
      fireEvent.press(getByTestId('load-tracks'));
    });
    expect(getByTestId('phase').props.children).toBe('setup');
    expect(getByTestId('load-error').props.children).toBe('All tracks in this playlist have already been sifted.');
  });

  test('loadTracks reports "removed in a previous sift" when only removal history emptied the playlist', async () => {
    // No sifted companion exists — the single source track was previously
    // REMOVED, not kept. Blaming the sifted filter ("already been sifted")
    // here would be a false claim.
    mockProvider.loadPlaylistTracks.mockResolvedValueOnce([mockTrack]);
    mockProvider.loadPlaylists.mockResolvedValue([]);
    const { loadHistory } = require('../../src/services/RemovalHistoryStore');
    (loadHistory as jest.Mock).mockResolvedValueOnce([
      {
        track: mockTrack,
        source: { type: 'playlist', playlist: { id: 'p1', name: 'My Playlist', trackCount: 5 } },
        provider: 'apple-music',
        removedAt: '2026-04-08T12:00:00.000Z',
      },
    ]);

    const { getByTestId } = render(
      <SiftProvider initialTracks={[]}>
        <TestConsumerWithPlaylistActions />
      </SiftProvider>
    );
    await act(async () => {
      fireEvent.press(getByTestId('set-source-playlist'));
    });
    await act(async () => {
      fireEvent.press(getByTestId('load-tracks'));
    });
    expect(getByTestId('phase').props.children).toBe('setup');
    expect(getByTestId('load-error').props.children).toBe(
      'All tracks in this playlist were removed in a previous sift.',
    );
  });

  test('loadTracks reports the combined message when both filters emptied the playlist', async () => {
    mockProvider.loadPlaylistTracks
      .mockResolvedValueOnce([mockTrack, mockTrackB]) // source playlist
      .mockResolvedValueOnce([mockTrack]); // sifted companion holds track 1
    mockProvider.loadPlaylists.mockResolvedValue([
      { id: 'sifted-1', name: 'My Playlist - Sifted', trackCount: 1 },
    ]);
    const { loadHistory } = require('../../src/services/RemovalHistoryStore');
    (loadHistory as jest.Mock).mockResolvedValueOnce([
      {
        track: mockTrackB, // track 2 was removed in a previous sift
        source: { type: 'playlist', playlist: { id: 'p1', name: 'My Playlist', trackCount: 5 } },
        provider: 'apple-music',
        removedAt: '2026-04-08T12:00:00.000Z',
      },
    ]);

    const { getByTestId } = render(
      <SiftProvider initialTracks={[]}>
        <TestConsumerWithPlaylistActions />
      </SiftProvider>
    );
    await act(async () => {
      fireEvent.press(getByTestId('set-source-playlist'));
    });
    await act(async () => {
      fireEvent.press(getByTestId('load-tracks'));
    });
    expect(getByTestId('phase').props.children).toBe('setup');
    expect(getByTestId('load-error').props.children).toBe(
      'All tracks in this playlist have already been sifted or removed.',
    );
  });

  test('loadTracks on an empty library returns to setup instead of a dead-end sift', async () => {
    mockProvider.loadLibrary.mockResolvedValue([]);
    const { getByTestId } = render(
      <SiftProvider initialTracks={[]}>
        <TestConsumerWithPlaylistActions />
      </SiftProvider>
    );
    await act(async () => {
      fireEvent.press(getByTestId('load-tracks'));
    });
    expect(getByTestId('phase').props.children).toBe('setup');
    expect(getByTestId('load-error').props.children).toBe('Your library has no tracks to sift.');
  });

  test('re-sift does not re-offer a kept track that read back under a library-instance id', async () => {
    // Regression: a non-library track is kept under its catalog id, but the
    // sifted playlist reads it back under the library-instance id Apple
    // Music assigned when it landed. An id-only filter would re-offer it on
    // every re-sift; the identity filter must recognize it.
    mockProvider.loadPlaylistTracks
      .mockResolvedValueOnce([mockTrack]) // source playlist: catalog id '1'
      .mockResolvedValueOnce([{ ...mockTrack, id: 'library-instance-99' }]); // sifted readback
    mockProvider.loadPlaylists.mockResolvedValue([
      { id: 'sifted-1', name: 'My Playlist - Sifted', trackCount: 1 },
    ]);

    const { getByTestId } = render(
      <SiftProvider initialTracks={[]}>
        <TestConsumerWithPlaylistActions />
      </SiftProvider>
    );
    await act(async () => {
      fireEvent.press(getByTestId('set-source-playlist'));
    });
    await act(async () => {
      fireEvent.press(getByTestId('load-tracks'));
    });

    // The only source track is already sifted (under its new id) — nothing
    // is offered and the load reports the already-sifted state.
    expect(getByTestId('phase').props.children).toBe('setup');
    expect(getByTestId('load-error').props.children).toBe(
      'All tracks in this playlist have already been sifted.',
    );
  });

  test('keepTrack does not re-add a song already in the sifted playlist under another id', async () => {
    mockProvider.loadPlaylists.mockResolvedValue([
      { id: 'sifted-1', name: 'My Playlist - Sifted', trackCount: 1 },
    ]);
    // Readback: the same song, but under the library-instance id assigned
    // when it landed in the playlist.
    mockProvider.loadPlaylistTracks.mockResolvedValue([
      { ...mockTrack, id: 'library-instance-42' },
    ]);

    const { getByTestId } = render(
      <SiftProvider initialTracks={[mockTrack]}>
        <TestConsumerWithPlaylistActions />
      </SiftProvider>
    );
    await act(async () => {
      fireEvent.press(getByTestId('set-source-playlist'));
    });
    await act(async () => {
      fireEvent.press(getByTestId('keep-track'));
    });

    // Already present: neither re-added nor buffered.
    expect(mockProvider.addToPlaylist).not.toHaveBeenCalled();
    expect(getByTestId('pending-keeps').props.children).toBe('');
  });

  test('saveSiftedPlaylist resolves the sifted playlist by id even after a rename', async () => {
    mockProvider.loadPlaylists.mockResolvedValue([
      // The companion was renamed, so no "<name> - Sifted" match exists —
      // only the persisted id can find it.
      { id: 'sifted-renamed', name: 'My Renamed Companion', trackCount: 0 },
    ]);
    mockProvider.loadPlaylistTracks.mockResolvedValue([]);

    const { getByTestId } = render(
      <SiftProvider initialTracks={[mockTrack]}>
        <TestConsumerWithPlaylistActions />
      </SiftProvider>
    );
    await act(async () => {
      fireEvent.press(getByTestId('set-sifted-id'));
    });
    await act(async () => {
      fireEvent.press(getByTestId('save-sifted'));
    });

    expect(mockProvider.addToPlaylist).toHaveBeenCalledWith('sifted-renamed', ['1']);
    // Without id-first resolution the name miss would create a duplicate
    // "My Playlist - Sifted" playlist.
    expect(mockProvider.createPlaylist).not.toHaveBeenCalled();
  });

  test('clearSiftedPlaylist resolves the sifted playlist by id even after a rename', async () => {
    mockProvider.loadPlaylists.mockResolvedValue([
      { id: 'sifted-renamed', name: 'My Renamed Companion', trackCount: 1 },
    ]);
    mockProvider.loadPlaylistTracks.mockResolvedValue([mockTrack]);

    const { getByTestId } = render(
      <SiftProvider initialTracks={[mockTrack]}>
        <TestConsumerWithPlaylistActions />
      </SiftProvider>
    );
    await act(async () => {
      fireEvent.press(getByTestId('set-sifted-id'));
    });
    await act(async () => {
      fireEvent.press(getByTestId('clear-sifted'));
    });

    expect(mockProvider.removeFromPlaylist).toHaveBeenCalledWith('sifted-renamed', ['1']);
  });

  test('loadTracks filtering resolves the sifted playlist by id even after a rename', async () => {
    mockProvider.loadPlaylists.mockResolvedValue([
      { id: 'sifted-renamed', name: 'My Renamed Companion', trackCount: 1 },
    ]);
    mockProvider.loadPlaylistTracks
      .mockResolvedValueOnce([mockTrack, mockTrackB]) // source playlist
      .mockResolvedValueOnce([mockTrack]); // renamed companion, found by id

    const { getByTestId } = render(
      <SiftProvider initialTracks={[]}>
        <TestConsumerWithPlaylistActions />
      </SiftProvider>
    );
    await act(async () => {
      fireEvent.press(getByTestId('set-source-playlist'));
    });
    await act(async () => {
      fireEvent.press(getByTestId('set-sifted-id'));
    });
    await act(async () => {
      fireEvent.press(getByTestId('load-tracks'));
    });

    // The companion was read (by id) and its track filtered from the sift.
    expect(mockProvider.loadPlaylistTracks).toHaveBeenCalledWith('sifted-renamed');
    expect(getByTestId('phase').props.children).toBe('sifting');
  });

  test('a failed save still drops the tracks that actually landed from pendingKeeps', async () => {
    // The provider throws on ANY shortfall, but native adds are per-item —
    // most tracks may have landed by then. Treating the error as "nothing
    // was saved" would retry the full snapshot forever; the readback repair
    // must drop exactly the landed tracks and keep only genuine failures.
    mockProvider.loadPlaylists.mockReset();
    mockProvider.loadPlaylists.mockResolvedValue([
      { id: 'sifted-1', name: 'My Playlist - Sifted', trackCount: 0 },
    ]);
    mockProvider.loadPlaylistTracks
      .mockResolvedValueOnce([]) // pre-add diff readback: nothing present yet
      .mockResolvedValueOnce([mockTrack]); // post-failure readback: track 1 landed
    mockProvider.addToPlaylist.mockRejectedValueOnce(
      new Error('1 of 2 tracks could not be added to the playlist'),
    );

    const { getByTestId } = render(
      <SiftProvider initialTracks={[mockTrack, mockTrackB]}>
        <TestConsumerWithPlaylistActions />
      </SiftProvider>
    );
    await act(async () => {
      fireEvent.press(getByTestId('set-source-playlist'));
    });
    await act(async () => {
      fireEvent.press(getByTestId('add-pending-1'));
    });
    await act(async () => {
      fireEvent.press(getByTestId('add-pending-2'));
    });
    expect(getByTestId('pending-keeps').props.children).toBe('1,2');

    await act(async () => {
      fireEvent.press(getByTestId('save-sifted-two'));
    });

    // The add was attempted with both tracks and failed…
    expect(mockProvider.addToPlaylist).toHaveBeenCalledWith('sifted-1', ['1', '2']);
    // …the error is surfaced for the Retry affordance…
    expect(getByTestId('playlist-error').props.children).toBe(
      '1 of 2 tracks could not be added to the playlist',
    );
    // …and ONLY the track that did not land stays buffered.
    expect(getByTestId('pending-keeps').props.children).toBe('2');
  });

  test('a keep buffered while a save is in flight survives the save cleanup', async () => {
    mockProvider.loadPlaylists.mockResolvedValue([
      { id: 'sifted-1', name: 'My Playlist - Sifted', trackCount: 0 },
    ]);
    mockProvider.loadPlaylistTracks.mockResolvedValue([]);
    let resolveAdd: (() => void) | undefined;
    mockProvider.addToPlaylist.mockImplementationOnce(
      () => new Promise<void>((res) => { resolveAdd = () => res(); }),
    );

    const { getByTestId } = render(
      <SiftProvider initialTracks={[mockTrack]}>
        <TestConsumerWithPlaylistActions />
      </SiftProvider>
    );
    await act(async () => {
      fireEvent.press(getByTestId('set-source-playlist'));
    });
    // Track 1 is buffered; the save starts persisting exactly that snapshot
    // and parks on its playlist add.
    await act(async () => {
      fireEvent.press(getByTestId('add-pending-1'));
    });
    await act(async () => {
      fireEvent.press(getByTestId('save-sifted'));
    });
    expect(resolveAdd).toBeDefined();

    // A late keep fails and gets buffered while the save is still in flight.
    await act(async () => {
      fireEvent.press(getByTestId('add-pending-2'));
    });
    expect(getByTestId('pending-keeps').props.children).toBe('1,2');

    // The save's cleanup removes only its own snapshot (track 1) — the
    // late keep (track 2) survives and can re-fire the Done fallback.
    await act(async () => {
      resolveAdd?.();
    });
    expect(getByTestId('pending-keeps').props.children).toBe('2');
  });

  test('clearSiftedPlaylist waits for in-flight keeps before reading the playlist', async () => {
    mockProvider.loadPlaylists.mockResolvedValue([
      { id: 'sifted-1', name: 'My Playlist - Sifted', trackCount: 0 },
    ]);
    mockProvider.loadPlaylistTracks.mockResolvedValue([]);
    let resolveAdd: (() => void) | undefined;
    mockProvider.addToPlaylist.mockImplementationOnce(
      () => new Promise<void>((res) => { resolveAdd = () => res(); }),
    );

    const { getByTestId } = render(
      <SiftProvider initialTracks={[mockTrack]}>
        <TestConsumerWithPlaylistActions />
      </SiftProvider>
    );
    await act(async () => {
      fireEvent.press(getByTestId('set-source-playlist'));
    });
    // The keep resolves the playlist and parks mid-add.
    await act(async () => {
      fireEvent.press(getByTestId('keep-track'));
    });
    expect(resolveAdd).toBeDefined();

    // The clear must wait for the keep chain — reading the playlist now
    // would miss the mid-flight track and leave it behind.
    await act(async () => {
      fireEvent.press(getByTestId('clear-sifted'));
    });
    expect(mockProvider.removeFromPlaylist).not.toHaveBeenCalled();

    // Once the keep lands, the clear proceeds and sees the landed track.
    mockProvider.loadPlaylistTracks.mockResolvedValue([mockTrack]);
    await act(async () => {
      resolveAdd?.();
    });
    expect(mockProvider.removeFromPlaylist).toHaveBeenCalledWith('sifted-1', ['1']);
  });

  test('clearSiftedPlaylist proceeds after the keep-queue timeout instead of hanging forever', async () => {
    // A native add that never settles must not park the clear's
    // `await keepQueue` permanently — that would brick Start Over for the
    // rest of the app session with no error and no way out.
    mockProvider.loadPlaylists.mockReset();
    mockProvider.loadPlaylists.mockResolvedValue([
      { id: 'sifted-1', name: 'My Playlist - Sifted', trackCount: 0 },
    ]);
    mockProvider.loadPlaylistTracks.mockResolvedValue([]);
    let hangResolve: (() => void) | undefined;
    mockProvider.addToPlaylist.mockImplementationOnce(
      () => new Promise<void>((res) => { hangResolve = () => res(); }),
    );

    const { getByTestId } = render(
      <SiftProvider initialTracks={[mockTrack]}>
        <TestConsumerWithPlaylistActions />
      </SiftProvider>
    );
    await act(async () => {
      fireEvent.press(getByTestId('set-source-playlist'));
    });
    // The keep resolves the playlist and hangs on its native add.
    await act(async () => {
      fireEvent.press(getByTestId('keep-track'));
    });
    expect(hangResolve).toBeDefined();

    // The clear parks on the keep queue…
    await act(async () => {
      fireEvent.press(getByTestId('clear-sifted'));
    });
    expect(mockProvider.removeFromPlaylist).not.toHaveBeenCalled();

    // …until the bounded wait elapses; then it proceeds (with a breadcrumb)
    // rather than waiting forever on the hung add.
    mockProvider.loadPlaylistTracks.mockResolvedValue([mockTrack]);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(15000);
    });
    expect(mockProvider.removeFromPlaylist).toHaveBeenCalledWith('sifted-1', ['1']);
    const Sentry = require('@sentry/react-native');
    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('keep queue did not settle'),
      }),
    );

    // Settle the hung add so no parked keep-queue link leaks into the
    // tests that run after this one.
    await act(async () => {
      hangResolve?.();
    });
  });
});
