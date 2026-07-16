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
  addToLibrary: jest.fn().mockResolvedValue(undefined),
  addToPlaylist: jest.fn().mockResolvedValue(undefined),
  removeFromLibrary: jest.fn().mockResolvedValue(undefined),
  removeFromPlaylist: jest.fn().mockResolvedValue(undefined),
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
}));

// Mock Alert
jest.mock('react-native/Libraries/Alert/Alert', () => ({
  alert: jest.fn(),
}));

const mockTrack: Track = {
  id: '1', name: 'Track A', artist: 'Artist A', album: 'Album A',
  duration: 200, playCount: 10, dateAdded: '2020-01-01T00:00:00.000Z',
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
    </>
  );
}

function TestConsumerWithSetSource() {
  const provider = useMusicProvider();
  const { dispatch } = useSift();
  return (
    <>
      <TouchableOpacity testID="set-source-playlist" onPress={() => {
        dispatch({
          type: 'SET_SOURCE',
          source: { type: 'playlist', playlist: { id: 'p1', name: 'My Playlist', trackCount: 5 } },
        });
      }} />
      <TouchableOpacity testID="load-tracks" onPress={async () => {
        await provider.loadTracks();
      }} />
      <TouchableOpacity testID="restore-pl" onPress={() => provider.restoreTrack(mockTrack)} />
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
        <TestConsumerWithSetSource />
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
        <TestConsumerWithSetSource />
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
});
