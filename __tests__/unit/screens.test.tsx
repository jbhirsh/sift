import React from 'react';
import { ActionSheetIOS, Alert, Text, TouchableOpacity } from 'react-native';
import { fireEvent, act, waitFor } from '@testing-library/react-native';

// Common mocks
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: jest.fn().mockReturnValue('light'),
}));

jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('expo-image', () => ({ Image: 'Image' }));

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
  play: jest.fn().mockResolvedValue(undefined),
  pause: jest.fn().mockResolvedValue(undefined),
  resume: jest.fn().mockResolvedValue(undefined),
  seek: jest.fn(),
  getPlaybackState: jest.fn().mockReturnValue({ position: 0, isPlaying: false }),
  createPlaylist: jest.fn().mockResolvedValue(undefined),
  loadPlaylists: jest.fn().mockResolvedValue([]),
  loadPlaylistTracks: jest.fn().mockResolvedValue([]),
  removeFromPlaylist: jest.fn().mockResolvedValue(undefined),
  addToPlaylist: jest.fn().mockResolvedValue(1),
};

jest.mock('../../src/services', () => ({
  createMusicProvider: jest.fn(() => mockProvider),
  MusicProviderService: {},
}));

jest.mock('../../src/services/RemovalHistoryStore', () => ({
  logRemoval: jest.fn(() => Promise.resolve()),
  loadHistory: jest.fn(() => Promise.resolve([])),
  removeFromHistory: jest.fn(() => Promise.resolve()),
  clearHistoryForSource: jest.fn(() => Promise.resolve(true)),
}));

jest.mock('../../src/hooks/useResolvedArtwork', () => ({
  useResolvedArtwork: jest.fn().mockReturnValue(null),
  clearArtworkCache: jest.fn(),
}));

// Must import after mocks
import { renderWithProviders, mockTrackA, mockTrackB, mockTrackC } from '../helpers/renderWithProviders';
import { clearHistoryForSource } from '../../src/services/RemovalHistoryStore';
import { clearSession } from '../../src/services/SessionStore';
import { useSift } from '../../src/context/SiftContext';
import SetupScreen from '../../src/screens/SetupScreen';
import LoadingScreen from '../../src/screens/LoadingScreen';
import DoneScreen from '../../src/screens/DoneScreen';
import SettingsScreen from '../../src/screens/SettingsScreen';
import PlaylistPicker from '../../src/components/PlaylistPicker';

describe('SetupScreen', () => {
  test('renders brand text', () => {
    const { getByTestId } = renderWithProviders(<SetupScreen />);
    expect(getByTestId('setup-brand').props.children).toBe('sift.');
  });

  test('renders Start Sifting button when no saved session', () => {
    const { getByText } = renderWithProviders(<SetupScreen />);
    expect(getByText('Start Sifting')).toBeTruthy();
  });

  test('renders error when loadError exists', () => {
    const { queryByTestId } = renderWithProviders(<SetupScreen />);
    expect(queryByTestId('setup-error')).toBeNull();
  });

  test('renders music service picker with Apple Music and Spotify', () => {
    const { getByText } = renderWithProviders(<SetupScreen />);
    expect(getByText('Apple Music')).toBeTruthy();
    expect(getByText('Spotify')).toBeTruthy();
  });

  test('renders sort by section', () => {
    const { getByText } = renderWithProviders(<SetupScreen />);
    expect(getByText('Sort by')).toBeTruthy();
    expect(getByText('Least Played')).toBeTruthy();
  });

  test('pressing sort button opens action sheet', () => {
    const spy = jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions').mockImplementation(() => {});
    const { getByText } = renderWithProviders(<SetupScreen />);
    fireEvent.press(getByText('Least Played'));
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        options: ['Least Played', 'Most Played', 'Oldest Added', 'Newest Added', 'Random', 'Cancel'],
        cancelButtonIndex: 5,
      }),
      expect.any(Function),
    );
    spy.mockRestore();
  });

  test('selecting a sort option from action sheet dispatches sort order', () => {
    const spy = jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions').mockImplementation((_opts, cb) => { cb(1); });
    const { getByText } = renderWithProviders(<SetupScreen />);
    // Mock calls callback with index 1 ("Most Played") immediately
    fireEvent.press(getByText('Least Played'));
    expect(getByText('Most Played')).toBeTruthy();
    spy.mockRestore();
  });

  test('pressing provider segment switches provider', () => {
    const { getByText } = renderWithProviders(<SetupScreen />);
    fireEvent.press(getByText('Spotify'));
    // Component should still render without error
    expect(getByText('Spotify')).toBeTruthy();
  });

  test('renders source picker with Library and Playlist options', () => {
    const { getByText } = renderWithProviders(<SetupScreen />);
    expect(getByText('Sift source')).toBeTruthy();
    expect(getByText('Library')).toBeTruthy();
    expect(getByText('Playlist')).toBeTruthy();
  });

  test('tapping Library dispatches SET_SOURCE with library type', () => {
    const { getByTestId } = renderWithProviders(<SetupScreen />);
    fireEvent.press(getByTestId('source-library'));
    // Should not throw — Library is the default
    expect(getByTestId('source-library')).toBeTruthy();
  });

  test('tapping Playlist opens playlist picker', async () => {
    mockProvider.loadPlaylists.mockResolvedValue([
      { id: 'p1', name: 'Test Playlist', trackCount: 5 },
    ]);
    const { getByTestId } = renderWithProviders(<SetupScreen />);
    await act(async () => {
      fireEvent.press(getByTestId('source-playlist'));
    });
    expect(getByTestId('playlist-picker-modal')).toBeTruthy();
  });

  test('selecting a playlist from picker shows playlist name', async () => {
    mockProvider.loadPlaylists.mockResolvedValue([
      { id: 'p1', name: 'My Playlist', trackCount: 8 },
    ]);
    const { getByTestId, getByText } = renderWithProviders(<SetupScreen />);
    await act(async () => {
      fireEvent.press(getByTestId('source-playlist'));
    });
    await act(async () => {
      fireEvent.press(getByTestId('playlist-row-p1'));
    });
    expect(getByText('My Playlist')).toBeTruthy();
    expect(getByText('Change')).toBeTruthy();
  });

  test('cancelling playlist picker keeps library source', async () => {
    mockProvider.loadPlaylists.mockResolvedValue([
      { id: 'p1', name: 'Test', trackCount: 3 },
    ]);
    const { getByTestId, queryByTestId } = renderWithProviders(<SetupScreen />);
    await act(async () => {
      fireEvent.press(getByTestId('source-playlist'));
    });
    expect(getByTestId('playlist-picker-modal')).toBeTruthy();
    await act(async () => {
      fireEvent.press(getByTestId('playlist-picker-cancel'));
    });
    expect(queryByTestId('playlist-picker-modal')).toBeNull();
  });

  test('Change button reopens playlist picker', async () => {
    mockProvider.loadPlaylists.mockResolvedValue([
      { id: 'p1', name: 'My Playlist', trackCount: 8 },
    ]);
    const { getByTestId, getByText } = renderWithProviders(<SetupScreen />);
    // Select a playlist
    await act(async () => {
      fireEvent.press(getByTestId('source-playlist'));
    });
    await act(async () => {
      fireEvent.press(getByTestId('playlist-row-p1'));
    });
    // Reopen via Change button
    await act(async () => {
      fireEvent.press(getByText('Change'));
    });
    expect(getByTestId('playlist-picker-modal')).toBeTruthy();
  });

  test('pressing Start Sifting triggers startFresh', async () => {
    const { getByText } = renderWithProviders(<SetupScreen />);
    await act(async () => {
      fireEvent.press(getByText('Start Sifting'));
    });
    // Should not throw
  });

  test('shows inline Resume Sifting button when saved session matches current source', async () => {
    const { loadSession } = require('../../src/services/SessionStore');
    (loadSession as jest.Mock).mockResolvedValueOnce({
      tracks: [mockTrackA, mockTrackB, mockTrackC],
      cursor: 1,
      kept: [mockTrackA],
      removed: [],
      skipped: [],
      sortOrder: 'least-played',
      savedAt: '2026-04-10T00:00:00.000Z',
      provider: 'apple-music',
      source: { type: 'library' },
    });

    const { queryByText } = renderWithProviders(<SetupScreen />);
    await act(async () => {});
    expect(queryByText('Resume Sifting')).toBeTruthy();
    expect(queryByText('Start Sifting')).toBeNull();
  });

  test('Resume restores persisted pendingKeeps and removalErrors', async () => {
    function PendingProbe() {
      const { state } = useSift();
      return <Text testID="probe-pending">{state.pendingKeeps.length}</Text>;
    }
    const { loadSession } = require('../../src/services/SessionStore');
    (loadSession as jest.Mock).mockResolvedValueOnce({
      tracks: [mockTrackA, mockTrackB, mockTrackC],
      cursor: 1,
      kept: [mockTrackA],
      removed: [],
      skipped: [],
      sortOrder: 'least-played',
      savedAt: '2026-04-10T00:00:00.000Z',
      provider: 'apple-music',
      source: { type: 'library' },
      pendingKeeps: [mockTrackC],
      removalErrors: ['Could not remove Track B'],
    });

    const { getByTestId } = renderWithProviders(<><SetupScreen /><PendingProbe /></>);
    await act(async () => {});
    await act(async () => {
      fireEvent.press(getByTestId('resume-modal-resume'));
    });
    // The repair signal survives the kill/relaunch: Done's fallback save can
    // still fire for the buffered keep.
    expect(getByTestId('probe-pending').props.children).toBe(1);
  });

  test('Resume restores the persisted siftedPlaylistId', async () => {
    function SiftedIdProbe() {
      const { state } = useSift();
      return <Text testID="probe-sifted-id">{state.siftedPlaylistId ?? 'null'}</Text>;
    }
    const { loadSession } = require('../../src/services/SessionStore');
    (loadSession as jest.Mock).mockResolvedValueOnce({
      tracks: [mockTrackA, mockTrackB, mockTrackC],
      cursor: 1,
      kept: [mockTrackA],
      removed: [],
      skipped: [],
      sortOrder: 'least-played',
      savedAt: '2026-04-10T00:00:00.000Z',
      provider: 'apple-music',
      source: { type: 'playlist', playlist: { id: 'p1', name: 'Mix', trackCount: 3 } },
      siftedPlaylistId: 'sifted-9',
    });

    const { getByTestId } = renderWithProviders(<><SetupScreen /><SiftedIdProbe /></>);
    await act(async () => {});
    await act(async () => {
      fireEvent.press(getByTestId('resume-modal-resume'));
    });
    // Sifted-playlist lookups keep resolving by id (rename-proof) after a
    // kill/relaunch instead of degrading to the name match.
    expect(getByTestId('probe-sifted-id').props.children).toBe('sifted-9');
  });

  test('Resume of a legacy session without siftedPlaylistId defaults to null', async () => {
    function SiftedIdProbe() {
      const { state } = useSift();
      return <Text testID="probe-sifted-id">{state.siftedPlaylistId ?? 'null'}</Text>;
    }
    const { loadSession } = require('../../src/services/SessionStore');
    (loadSession as jest.Mock).mockResolvedValueOnce({
      tracks: [mockTrackA, mockTrackB, mockTrackC],
      cursor: 1,
      kept: [mockTrackA],
      removed: [],
      skipped: [],
      sortOrder: 'least-played',
      savedAt: '2026-04-10T00:00:00.000Z',
      provider: 'apple-music',
      source: { type: 'library' },
    });

    const { getByTestId } = renderWithProviders(<><SetupScreen /><SiftedIdProbe /></>);
    await act(async () => {});
    await act(async () => {
      fireEvent.press(getByTestId('resume-modal-resume'));
    });
    expect(getByTestId('probe-sifted-id').props.children).toBe('null');
  });

  test('Resume of a legacy session without pendingKeeps defaults to empty', async () => {
    function PendingProbe() {
      const { state } = useSift();
      return <Text testID="probe-pending">{state.pendingKeeps.length}</Text>;
    }
    const { loadSession } = require('../../src/services/SessionStore');
    (loadSession as jest.Mock).mockResolvedValueOnce({
      tracks: [mockTrackA, mockTrackB, mockTrackC],
      cursor: 1,
      kept: [mockTrackA],
      removed: [],
      skipped: [],
      sortOrder: 'least-played',
      savedAt: '2026-04-10T00:00:00.000Z',
      provider: 'apple-music',
      source: { type: 'library' },
    });

    const { getByTestId } = renderWithProviders(<><SetupScreen /><PendingProbe /></>);
    await act(async () => {});
    await act(async () => {
      fireEvent.press(getByTestId('resume-modal-resume'));
    });
    expect(getByTestId('probe-pending').props.children).toBe(0);
  });

  test('cancelled resume modal does not reappear when user re-selects matching source', async () => {
    const { loadSession } = require('../../src/services/SessionStore');
    (loadSession as jest.Mock).mockResolvedValueOnce({
      tracks: [mockTrackA, mockTrackB],
      cursor: 0,
      kept: [],
      removed: [],
      skipped: [],
      sortOrder: 'least-played',
      savedAt: '2026-04-10T00:00:00.000Z',
      provider: 'apple-music',
      source: { type: 'library' },
    });

    const { getByTestId, queryByTestId } = renderWithProviders(<SetupScreen />);
    await act(async () => {});

    expect(queryByTestId('resume-session-modal')).toBeTruthy();

    await act(async () => {
      fireEvent.press(getByTestId('resume-modal-cancel'));
    });
    expect(queryByTestId('resume-session-modal')).toBeNull();

    await act(async () => {
      fireEvent.press(getByTestId('source-playlist'));
    });
    await act(async () => {
      fireEvent.press(getByTestId('source-library'));
    });

    expect(queryByTestId('resume-session-modal')).toBeNull();
  });

  test('playlist picker excludes "- Sifted" companion playlists', async () => {
    mockProvider.loadPlaylists.mockResolvedValue([
      { id: 'p1', name: 'My Playlist', trackCount: 8 },
      { id: 's1', name: 'My Playlist - Sifted', trackCount: 8 },
    ]);
    const { getByTestId, queryByTestId } = renderWithProviders(<SetupScreen />);
    await act(async () => {
      fireEvent.press(getByTestId('source-playlist'));
    });
    expect(getByTestId('playlist-row-p1')).toBeTruthy();
    // Companion playlists are sift outputs, not sources — offering one
    // would target "<x> - Sifted - Sifted".
    expect(queryByTestId('playlist-row-s1')).toBeNull();
  });

  test('start-over paths are disabled while a sifted-playlist save is in flight', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const WithCreating = () => {
      const { dispatch } = useSift();
      React.useEffect(() => {
        dispatch({ type: 'SET_CREATING_PLAYLIST', creating: true });
      }, [dispatch]);
      return <SetupScreen />;
    };
    mockProvider.loadPlaylists.mockResolvedValue([
      { id: 'p1', name: 'My Playlist', trackCount: 8 },
      { id: 's1', name: 'My Playlist - Sifted', trackCount: 8 },
    ]);
    const { getByTestId } = renderWithProviders(<WithCreating />);
    await act(async () => {
      fireEvent.press(getByTestId('source-playlist'));
    });
    await act(async () => {
      fireEvent.press(getByTestId('playlist-row-p1'));
    });

    // The Re-sift (start-over) button is disabled, and pressing it must not
    // open the destructive confirmation: its clear would race the in-flight
    // save on the same remote playlist.
    expect(getByTestId('setup-resift').props.accessibilityState?.disabled).toBe(true);
    await act(async () => {
      fireEvent.press(getByTestId('setup-resift'));
    });
    expect(alertSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  test('selecting an already-sifted playlist swaps the button to Re-sift Playlist', async () => {
    mockProvider.loadPlaylists.mockResolvedValue([
      { id: 'p1', name: 'My Playlist', trackCount: 8 },
      { id: 's1', name: 'My Playlist - Sifted', trackCount: 8 },
    ]);
    const { getByTestId, queryByText } = renderWithProviders(<SetupScreen />);
    await act(async () => {
      fireEvent.press(getByTestId('source-playlist'));
    });
    await act(async () => {
      fireEvent.press(getByTestId('playlist-row-p1'));
    });
    expect(queryByText('Re-sift Playlist')).toBeTruthy();
    expect(queryByText('Start Sifting')).toBeNull();
  });

  test('selecting a playlist without a sifted companion keeps Start Sifting', async () => {
    mockProvider.loadPlaylists.mockResolvedValue([
      { id: 'p1', name: 'My Playlist', trackCount: 8 },
    ]);
    const { getByTestId, queryByText } = renderWithProviders(<SetupScreen />);
    await act(async () => {
      fireEvent.press(getByTestId('source-playlist'));
    });
    await act(async () => {
      fireEvent.press(getByTestId('playlist-row-p1'));
    });
    expect(queryByText('Start Sifting')).toBeTruthy();
    expect(queryByText('Re-sift Playlist')).toBeNull();
  });

  test('Re-sift Playlist asks for confirmation, then clears the sifted playlist and history and starts fresh', async () => {
    (clearHistoryForSource as jest.Mock).mockClear();
    (clearSession as jest.Mock).mockClear();
    mockProvider.removeFromPlaylist.mockClear();
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockProvider.loadPlaylists.mockResolvedValue([
      { id: 'p1', name: 'My Playlist', trackCount: 8 },
      { id: 's1', name: 'My Playlist - Sifted', trackCount: 8 },
    ]);
    const { getByTestId, getByText } = renderWithProviders(<SetupScreen />);
    await act(async () => {
      fireEvent.press(getByTestId('source-playlist'));
    });
    await act(async () => {
      fireEvent.press(getByTestId('playlist-row-p1'));
    });

    await act(async () => {
      fireEvent.press(getByText('Re-sift Playlist'));
    });

    // Destructive — must be gated behind the same confirmation as DoneScreen.
    expect(alertSpy).toHaveBeenCalledWith(
      'Start Over?',
      expect.stringContaining('"My Playlist - Sifted"'),
      expect.arrayContaining([
        expect.objectContaining({ text: 'Cancel', style: 'cancel' }),
        expect.objectContaining({ text: 'Start Over', style: 'destructive' }),
      ]),
    );
    // Nothing destructive before the user confirms.
    expect(mockProvider.removeFromPlaylist).not.toHaveBeenCalled();
    expect(clearHistoryForSource).not.toHaveBeenCalled();
    expect(clearSession).not.toHaveBeenCalled();

    // Confirm: the sifted playlist is emptied, the history wiped, and a
    // fresh unfiltered sift starts.
    mockProvider.loadPlaylistTracks.mockResolvedValueOnce([mockTrackA]);
    const buttons = (alertSpy.mock.calls[0][2] ?? []) as { style?: string; onPress?: () => void }[];
    await act(async () => {
      buttons.find((b) => b.style === 'destructive')?.onPress?.();
    });
    expect(mockProvider.removeFromPlaylist).toHaveBeenCalledWith('s1', [mockTrackA.id]);
    expect(clearHistoryForSource).toHaveBeenCalledWith('p1');
    expect(clearSession).toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  test('cancelling the Re-sift confirmation leaves everything untouched', async () => {
    (clearHistoryForSource as jest.Mock).mockClear();
    (clearSession as jest.Mock).mockClear();
    mockProvider.removeFromPlaylist.mockClear();
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockProvider.loadPlaylists.mockResolvedValue([
      { id: 'p1', name: 'My Playlist', trackCount: 8 },
      { id: 's1', name: 'My Playlist - Sifted', trackCount: 8 },
    ]);
    const { getByTestId, getByText, queryByText } = renderWithProviders(<SetupScreen />);
    await act(async () => {
      fireEvent.press(getByTestId('source-playlist'));
    });
    await act(async () => {
      fireEvent.press(getByTestId('playlist-row-p1'));
    });
    await act(async () => {
      fireEvent.press(getByText('Re-sift Playlist'));
    });
    // The cancel button has no onPress — dismissing must change nothing.
    expect(mockProvider.removeFromPlaylist).not.toHaveBeenCalled();
    expect(clearHistoryForSource).not.toHaveBeenCalled();
    expect(clearSession).not.toHaveBeenCalled();
    expect(queryByText('Re-sift Playlist')).toBeTruthy();
    alertSpy.mockRestore();
  });

  test('start over keeps the Re-sift affordance and shows an error when the sifted playlist cannot be cleared', async () => {
    (clearHistoryForSource as jest.Mock).mockClear();
    (clearSession as jest.Mock).mockClear();
    mockProvider.removeFromPlaylist.mockClear();
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockProvider.loadPlaylists.mockResolvedValue([
      { id: 'p1', name: 'My Playlist', trackCount: 8 },
      { id: 's1', name: 'My Playlist - Sifted', trackCount: 8 },
    ]);
    const { getByTestId, getByText, queryByText } = renderWithProviders(<SetupScreen />);
    await act(async () => {
      fireEvent.press(getByTestId('source-playlist'));
    });
    await act(async () => {
      fireEvent.press(getByTestId('playlist-row-p1'));
    });
    await act(async () => {
      fireEvent.press(getByText('Re-sift Playlist'));
    });

    // clearSiftedPlaylist fails (its loadPlaylists lookup rejects)…
    mockProvider.loadPlaylists.mockRejectedValueOnce(new Error('network'));
    const buttons = (alertSpy.mock.calls[0][2] ?? []) as { style?: string; onPress?: () => void }[];
    await act(async () => {
      buttons.find((b) => b.style === 'destructive')?.onPress?.();
    });

    // …so nothing local is wiped and the failure is visible.
    expect(getByTestId('setup-error').props.children).toBe(
      'Could not empty the sifted playlist. Check your connection and try again.',
    );
    expect(clearHistoryForSource).not.toHaveBeenCalled();
    expect(clearSession).not.toHaveBeenCalled();
    expect(queryByText('Re-sift Playlist')).toBeTruthy();
    alertSpy.mockRestore();
  });

  test('Start Over without resuming clears a renamed companion via the session siftedPlaylistId', async () => {
    // The saved session persisted the companion's id. Restoring provider +
    // source on mount but NOT the id would make this Start Over clear by
    // name only — a renamed "<name> - Sifted" companion would silently
    // survive while the local history is wiped.
    const { loadSession } = require('../../src/services/SessionStore');
    (loadSession as jest.Mock).mockResolvedValueOnce({
      tracks: [mockTrackA, mockTrackB],
      cursor: 0,
      kept: [],
      removed: [],
      skipped: [],
      sortOrder: 'least-played',
      savedAt: '2026-04-10T00:00:00.000Z',
      provider: 'apple-music',
      source: { type: 'playlist', playlist: { id: 'p1', name: 'Mix', trackCount: 2 } },
      siftedPlaylistId: 'sifted-renamed',
    });
    (clearHistoryForSource as jest.Mock).mockClear();
    mockProvider.removeFromPlaylist.mockClear();
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    // The companion was renamed: no "Mix - Sifted" name match exists — only
    // the persisted id can find it.
    mockProvider.loadPlaylists.mockResolvedValue([
      { id: 'sifted-renamed', name: 'Totally Different Name', trackCount: 1 },
    ]);
    mockProvider.loadPlaylistTracks.mockResolvedValue([mockTrackA]);

    const { getByTestId } = renderWithProviders(<SetupScreen />);
    await act(async () => {});

    // Start Over straight from the resume modal, without resuming.
    await act(async () => {
      fireEvent.press(getByTestId('resume-modal-start-over'));
    });
    const buttons = (alertSpy.mock.calls[0][2] ?? []) as { style?: string; onPress?: () => void }[];
    await act(async () => {
      buttons.find((b) => b.style === 'destructive')?.onPress?.();
    });

    // Found by id and emptied — name-only resolution would have skipped it.
    expect(mockProvider.removeFromPlaylist).toHaveBeenCalledWith('sifted-renamed', [mockTrackA.id]);
    expect(clearHistoryForSource).toHaveBeenCalledWith('p1');
    alertSpy.mockRestore();
  });

  test('backing out of an active sift does not pop the resume modal over the inline Resume button', async () => {
    // Back-out leaves the same session both in memory (tracks/cursor/
    // activeSource untouched) and on disk (the back button flushes the
    // autosave). The inline Resume Sifting button already offers the
    // choice; the modal on top would double-prompt on every back-out.
    const { loadSession } = require('../../src/services/SessionStore');
    (loadSession as jest.Mock).mockResolvedValueOnce({
      tracks: [mockTrackA, mockTrackB],
      cursor: 0,
      kept: [],
      removed: [],
      skipped: [],
      sortOrder: 'least-played',
      savedAt: '2026-04-10T00:00:00.000Z',
      provider: 'apple-music',
      source: { type: 'library' },
    });

    const BackedOut = () => {
      const { dispatch } = useSift();
      React.useEffect(() => {
        // The back-out shape: a loaded sift (LOAD_TRACKS stamps
        // activeSource) followed by SET_PHASE back to setup.
        dispatch({ type: 'LOAD_TRACKS', tracks: [mockTrackA, mockTrackB] });
        dispatch({ type: 'SET_PHASE', phase: 'setup' });
      }, [dispatch]);
      return <SetupScreen />;
    };

    const { queryByTestId, queryByText } = renderWithProviders(<BackedOut />);
    await act(async () => {});

    expect(queryByTestId('resume-session-modal')).toBeNull();
    expect(queryByText('Resume Sifting')).toBeTruthy();
  });

  test('a provider picked while the session is still loading is not overwritten', async () => {
    const { loadSession } = require('../../src/services/SessionStore');
    let resolveSession: ((session: unknown) => void) | undefined;
    (loadSession as jest.Mock).mockImplementationOnce(
      () => new Promise((res) => { resolveSession = res; }),
    );
    const ProviderProbe = () => {
      const { state } = useSift();
      return (
        <>
          <Text testID="probe-provider">{state.provider}</Text>
          <Text testID="probe-source-type">{state.source.type}</Text>
        </>
      );
    };

    const { getByText, getByTestId, queryByTestId } = renderWithProviders(
      <><SetupScreen /><ProviderProbe /></>,
    );
    // The user picks Spotify while loadSession is still pending…
    await act(async () => {
      fireEvent.press(getByText('Spotify'));
    });
    expect(getByTestId('probe-provider').props.children).toBe('spotify');

    // …then the saved session (apple-music, playlist source) finally loads.
    await act(async () => {
      resolveSession?.({
        tracks: [mockTrackA, mockTrackB],
        cursor: 0,
        kept: [],
        removed: [],
        skipped: [],
        sortOrder: 'least-played',
        savedAt: '2026-04-10T00:00:00.000Z',
        provider: 'apple-music',
        source: { type: 'playlist', playlist: { id: 'p9', name: 'Saved Mix', trackCount: 2 } },
      });
    });

    // The explicit choice survives: no provider/source overwrite, no modal
    // shoved on top of an in-progress setup.
    expect(getByTestId('probe-provider').props.children).toBe('spotify');
    expect(getByTestId('probe-source-type').props.children).toBe('library');
    expect(queryByTestId('resume-session-modal')).toBeNull();
  });

  test('a finished session with unflushed keeps is offered and resumes straight to Done', async () => {
    // The autosave persists pendingKeeps precisely so an app kill cannot
    // silently drop them — a finished session with buffered keeps must
    // still get the resume path (Done's fallback save repairs them).
    const { loadSession } = require('../../src/services/SessionStore');
    (loadSession as jest.Mock).mockResolvedValueOnce({
      tracks: [mockTrackA, mockTrackB],
      cursor: 2,
      kept: [mockTrackA, mockTrackB],
      removed: [],
      skipped: [],
      sortOrder: 'least-played',
      savedAt: '2026-04-10T00:00:00.000Z',
      provider: 'apple-music',
      source: { type: 'playlist', playlist: { id: 'p1', name: 'Mix', trackCount: 2 } },
      pendingKeeps: [mockTrackB],
      siftedPlaylistId: null,
    });
    const PhaseProbe = () => {
      const { state } = useSift();
      return (
        <>
          <Text testID="probe-phase">{state.phase}</Text>
          <Text testID="probe-pending">{state.pendingKeeps.length}</Text>
        </>
      );
    };

    const { getByTestId, getByText, queryByTestId } = renderWithProviders(
      <><SetupScreen /><PhaseProbe /></>,
    );
    await act(async () => {});

    expect(queryByTestId('resume-session-modal')).toBeTruthy();
    // The copy tells the truth: nothing is left to sift, only to save.
    expect(getByText(/unsaved changes from a finished sift/)).toBeTruthy();

    await act(async () => {
      fireEvent.press(getByTestId('resume-modal-resume'));
    });
    expect(getByTestId('probe-phase').props.children).toBe('done');
    expect(getByTestId('probe-pending').props.children).toBe(1);
  });

  test('a finished session with nothing left to flush is still dropped silently', async () => {
    const { loadSession } = require('../../src/services/SessionStore');
    (loadSession as jest.Mock).mockResolvedValueOnce({
      tracks: [mockTrackA, mockTrackB],
      cursor: 2,
      kept: [mockTrackA, mockTrackB],
      removed: [],
      skipped: [],
      sortOrder: 'least-played',
      savedAt: '2026-04-10T00:00:00.000Z',
      provider: 'apple-music',
      source: { type: 'playlist', playlist: { id: 'p1', name: 'Mix', trackCount: 2 } },
      pendingKeeps: [],
    });

    const { queryByTestId, queryByText } = renderWithProviders(<SetupScreen />);
    await act(async () => {});

    expect(queryByTestId('resume-session-modal')).toBeNull();
    expect(queryByText('Start Sifting')).toBeTruthy();
  });

  test('shows Start Sifting after switching away from saved session source', async () => {
    const { loadSession } = require('../../src/services/SessionStore');
    (loadSession as jest.Mock).mockResolvedValueOnce({
      tracks: [mockTrackA, mockTrackB],
      cursor: 0,
      kept: [],
      removed: [],
      skipped: [],
      sortOrder: 'least-played',
      savedAt: '2026-04-10T00:00:00.000Z',
      provider: 'apple-music',
      source: { type: 'playlist', playlist: { id: 'p1', name: 'Saved Playlist', trackCount: 2 } },
    });

    const { getByTestId, queryByText } = renderWithProviders(<SetupScreen />);
    // Wait for session to load (source gets pre-populated to playlist)
    await act(async () => {});
    // Switch source back to library — no longer matches saved session
    await act(async () => {
      fireEvent.press(getByTestId('source-library'));
    });
    expect(queryByText('Start Sifting')).toBeTruthy();
    expect(queryByText('Resume Sifting')).toBeNull();
  });
});

describe('LoadingScreen', () => {
  test('renders brand text', () => {
    const { getByTestId } = renderWithProviders(<LoadingScreen />);
    expect(getByTestId('loading-brand').props.children).toBe('sift.');
  });

  test('renders loading message', () => {
    const { getByTestId } = renderWithProviders(<LoadingScreen />);
    expect(getByTestId('loading-message')).toBeTruthy();
  });

  test('calls loadLibrary on mount', () => {
    renderWithProviders(<LoadingScreen />);
    // loadLibrary triggers isAuthorized → loadLibrary chain
    expect(mockProvider.isAuthorized).toHaveBeenCalled();
  });
});

// Mock Clipboard on react-native's Clipboard export
import { Clipboard } from 'react-native';
const mockClipboardSetString = jest.fn();
Clipboard.setString = mockClipboardSetString;

describe('DoneScreen', () => {
  const tracks = [mockTrackA, mockTrackB, mockTrackC];

  test('renders done title when all tracks sifted', () => {
    const { getByTestId } = renderWithProviders(<DoneScreen />, { initialTracks: tracks });
    expect(getByTestId('done-title')).toBeTruthy();
  });

  test('renders summary counts', () => {
    const { getByTestId } = renderWithProviders(<DoneScreen />, { initialTracks: tracks });
    expect(getByTestId('summary-count-kept')).toBeTruthy();
    expect(getByTestId('summary-count-removed')).toBeTruthy();
    expect(getByTestId('summary-count-skipped')).toBeTruthy();
  });

  test('renders Start Over button when done', () => {
    const { getByText } = renderWithProviders(<DoneScreen />, { initialTracks: tracks });
    expect(getByText('Start Over')).toBeTruthy();
  });

  test('pressing Start Over calls startFresh', async () => {
    const { getByText } = renderWithProviders(<DoneScreen />, { initialTracks: tracks });
    await act(async () => {
      fireEvent.press(getByText('Start Over'));
    });
    // Should not throw
  });

  test('Start Over on a library source does not ask for confirmation', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { getByText } = renderWithProviders(<DoneScreen />, { initialTracks: tracks });
    await act(async () => {
      fireEvent.press(getByText('Start Over'));
    });
    expect(alertSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  test('Start Over on a playlist source asks for confirmation before destroying anything', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const WithPlaylistSource = () => {
      const { dispatch } = useSift();
      React.useEffect(() => {
        dispatch({
          type: 'SET_SOURCE',
          source: { type: 'playlist', playlist: { id: 'p1', name: 'Mix', trackCount: 3 } },
        });
      }, [dispatch]);
      return <DoneScreen />;
    };
    const { getByText } = renderWithProviders(<WithPlaylistSource />, { initialTracks: tracks });
    await act(async () => {
      fireEvent.press(getByText('Start Over'));
    });
    // The destructive clear must be gated behind a confirmation alert.
    expect(alertSpy).toHaveBeenCalledWith(
      'Start Over?',
      expect.stringContaining('cannot be undone'),
      expect.arrayContaining([
        expect.objectContaining({ text: 'Cancel', style: 'cancel' }),
        expect.objectContaining({ text: 'Start Over', style: 'destructive' }),
      ]),
    );
    alertSpy.mockRestore();
  });

  test('confirmed Start Over on a playlist source clears everything and resets to setup', async () => {
    (clearHistoryForSource as jest.Mock).mockClear();
    (clearSession as jest.Mock).mockClear();
    mockProvider.removeFromPlaylist.mockClear();
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const WithPlaylistSource = () => {
      const { dispatch } = useSift();
      React.useEffect(() => {
        dispatch({
          type: 'SET_SOURCE',
          source: { type: 'playlist', playlist: { id: 'p1', name: 'Mix', trackCount: 3 } },
        });
      }, [dispatch]);
      return <DoneScreen />;
    };
    mockProvider.loadPlaylists.mockResolvedValue([
      { id: 's1', name: 'Mix - Sifted', trackCount: 1 },
    ]);
    mockProvider.loadPlaylistTracks.mockResolvedValueOnce([mockTrackA]);

    const { getByText } = renderWithProviders(<WithPlaylistSource />, { initialTracks: tracks });
    await act(async () => {
      fireEvent.press(getByText('Start Over'));
    });
    const buttons = (alertSpy.mock.calls[0][2] ?? []) as { style?: string; onPress?: () => void }[];
    await act(async () => {
      buttons.find((b) => b.style === 'destructive')?.onPress?.();
    });

    expect(mockProvider.removeFromPlaylist).toHaveBeenCalledWith('s1', [mockTrackA.id]);
    expect(clearHistoryForSource).toHaveBeenCalledWith('p1');
    // resetToSetup ran — the saved session is gone.
    expect(clearSession).toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  test('Start Over does not reset when clearing the sifted playlist fails', async () => {
    (clearHistoryForSource as jest.Mock).mockClear();
    (clearSession as jest.Mock).mockClear();
    mockProvider.removeFromPlaylist.mockClear();
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const WithPlaylistSource = () => {
      const { dispatch } = useSift();
      React.useEffect(() => {
        dispatch({
          type: 'SET_SOURCE',
          source: { type: 'playlist', playlist: { id: 'p1', name: 'Mix', trackCount: 3 } },
        });
      }, [dispatch]);
      return <DoneScreen />;
    };
    // clearSiftedPlaylist fails outright (its loadPlaylists lookup rejects).
    mockProvider.loadPlaylists.mockRejectedValueOnce(new Error('network'));

    const { getByText, getByTestId } = renderWithProviders(<WithPlaylistSource />, { initialTracks: tracks });
    await act(async () => {
      fireEvent.press(getByText('Start Over'));
    });
    const buttons = (alertSpy.mock.calls[0][2] ?? []) as { style?: string; onPress?: () => void }[];
    await act(async () => {
      buttons.find((b) => b.style === 'destructive')?.onPress?.();
    });

    // The failure is visible, and neither the history nor the session was
    // wiped — the state needed to reconcile the sifted playlist survives.
    expect(getByTestId('start-over-error').props.children).toBe(
      'Could not empty the sifted playlist. Check your connection and try again.',
    );
    expect(clearHistoryForSource).not.toHaveBeenCalled();
    expect(clearSession).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  test('shows removed tracks section after removing tracks', () => {
    const DecideThenDone = () => {
      const { decide, state } = useSift();
      React.useEffect(() => { decide('remove'); }, [decide]);
      if (state.removed.length === 0) return null;
      return <DoneScreen />;
    };
    const { getByText } = renderWithProviders(<DecideThenDone />, { initialTracks: tracks });
    expect(getByText('Tracks Removed')).toBeTruthy();
    expect(getByText('Copy List')).toBeTruthy();
  });

  test('copy list button copies removed tracks', () => {
    const DecideThenDone = () => {
      const { decide, state } = useSift();
      React.useEffect(() => { decide('remove'); }, [decide]);
      if (state.removed.length === 0) return null;
      return <DoneScreen />;
    };
    const { getByText } = renderWithProviders(<DecideThenDone />, { initialTracks: tracks });
    fireEvent.press(getByText('Copy List'));
    expect(mockClipboardSetString).toHaveBeenCalled();
    expect(getByText('Copied!')).toBeTruthy();
  });

  test('copy toast reset timer is cleared on unmount', () => {
    // Regression: the 2s "Copied!" reset timeout leaked past unmount,
    // firing setState on an unmounted screen and holding the process open
    // (Jest's "did not exit one second after the test run" warning).
    jest.useFakeTimers();
    try {
      const DecideThenDone = () => {
        const { decide, state } = useSift();
        React.useEffect(() => { decide('remove'); }, [decide]);
        if (state.removed.length === 0) return null;
        return <DoneScreen />;
      };
      const { getByText, unmount } = renderWithProviders(<DecideThenDone />, { initialTracks: tracks });
      // Spy on the timer pair rather than counting pending timers — the
      // press also schedules framework-internal timers, so identify the
      // toast timer by its unique 2000ms delay and assert that exact
      // handle is what unmount clears.
      const setSpy = jest.spyOn(globalThis, 'setTimeout');
      const clearSpy = jest.spyOn(globalThis, 'clearTimeout');
      try {
        fireEvent.press(getByText('Copy List'));
        const toastCallIndex = setSpy.mock.calls.findIndex((call) => call[1] === 2000);
        expect(toastCallIndex).toBeGreaterThanOrEqual(0);
        const toastHandle = setSpy.mock.results[toastCallIndex].value;
        unmount();
        expect(clearSpy).toHaveBeenCalledWith(toastHandle);
      } finally {
        setSpy.mockRestore();
        clearSpy.mockRestore();
      }
    } finally {
      jest.useRealTimers();
    }
  });

  test('Done fallback saves only buffered keeps, never the whole kept list', async () => {
    // Regression: replaying the full kept list double-added tracks whose
    // Apple Music id changed between keep-time (catalog) and playlist
    // readback (library instance) — seen as duplicate songs in the real
    // "- Sifted" playlist on device.
    mockProvider.addToPlaylist.mockClear();
    mockProvider.createPlaylist.mockClear();
    mockProvider.loadPlaylists.mockResolvedValueOnce([
      { id: 's1', name: 'Mix - Sifted', trackCount: 2 },
    ]);
    mockProvider.loadPlaylistTracks.mockResolvedValueOnce([mockTrackA, mockTrackB]);

    const WithLandedAndPending = () => {
      const { dispatch } = useSift();
      React.useEffect(() => {
        dispatch({
          type: 'SET_SOURCE',
          source: { type: 'playlist', playlist: { id: 'p1', name: 'Mix', trackCount: 3 } },
        });
        // A and B landed incrementally during sifting; only C is buffered.
        dispatch({ type: 'ADD_PENDING_KEEP', track: mockTrackC });
      }, [dispatch]);
      return <DoneScreen />;
    };
    renderWithProviders(<WithLandedAndPending />, { initialTracks: [mockTrackA, mockTrackB, mockTrackC] });

    await waitFor(() => {
      expect(mockProvider.addToPlaylist).toHaveBeenCalledWith('s1', [mockTrackC.id]);
    });
    expect(mockProvider.addToPlaylist).toHaveBeenCalledTimes(1);
    expect(mockProvider.createPlaylist).not.toHaveBeenCalled();
  });

  test('a buffered keep already in the playlist under a different id is not re-added', async () => {
    mockProvider.addToPlaylist.mockClear();
    mockProvider.createPlaylist.mockClear();
    mockProvider.loadPlaylists.mockResolvedValueOnce([
      { id: 's1', name: 'Mix - Sifted', trackCount: 1 },
    ]);
    // Same song, different id: the library-instance identity Apple Music
    // assigns when a catalog track lands in a playlist.
    mockProvider.loadPlaylistTracks.mockResolvedValueOnce([
      { ...mockTrackC, id: 'library-instance-999' },
    ]);

    const WithRelabeledPending = () => {
      const { dispatch, state } = useSift();
      React.useEffect(() => {
        dispatch({
          type: 'SET_SOURCE',
          source: { type: 'playlist', playlist: { id: 'p1', name: 'Mix', trackCount: 3 } },
        });
        dispatch({ type: 'ADD_PENDING_KEEP', track: mockTrackC });
      }, [dispatch]);
      return (
        <>
          <DoneScreen />
          <Text testID="probe-pending-after">{state.pendingKeeps.length}</Text>
        </>
      );
    };
    const { getByTestId } = renderWithProviders(<WithRelabeledPending />, { initialTracks: [mockTrackC] });

    // The save completes as a no-op add and clears the buffer.
    await waitFor(() => {
      expect(getByTestId('probe-pending-after').props.children).toBe(0);
    });
    expect(mockProvider.addToPlaylist).not.toHaveBeenCalled();
    expect(mockProvider.createPlaylist).not.toHaveBeenCalled();
  });

  test('Retry after a failed sifted-playlist save clears the error, re-saves, and flushes pendingKeeps', async () => {
    // A failed save leaves removalPlaylistError set, which permanently blocks
    // the fallback-save effect — the Retry button is the only non-destructive
    // way to get buffered pendingKeeps out again.
    const WithSaveError = () => {
      const { dispatch, state } = useSift();
      React.useEffect(() => {
        dispatch({
          type: 'SET_SOURCE',
          source: { type: 'playlist', playlist: { id: 'p1', name: 'Mix', trackCount: 3 } },
        });
        dispatch({ type: 'DECIDE', decision: 'keep' });
        dispatch({ type: 'ADD_PENDING_KEEP', track: mockTrackA });
        dispatch({ type: 'SET_PLAYLIST_ERROR', error: 'Failed to save sifted playlist' });
      }, [dispatch]);
      return (
        <>
          <DoneScreen />
          {/* Probe: pendingKeeps must be flushed after a successful retry */}
          <Text testID="probe-pending-count">{state.pendingKeeps.length}</Text>
        </>
      );
    };

    mockProvider.loadPlaylists.mockResolvedValue([]);
    mockProvider.createPlaylist.mockResolvedValue(undefined);

    const { getByTestId, getByText, queryByText, queryByTestId } = renderWithProviders(
      <WithSaveError />,
      { initialTracks: tracks },
    );
    await act(async () => {});

    // The error is shown and nothing has been saved (the effect is blocked).
    expect(getByText('Failed to save sifted playlist')).toBeTruthy();
    expect(getByTestId('probe-pending-count').props.children).toBe(1);
    expect(mockProvider.createPlaylist).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.press(getByTestId('retry-save-button'));
    });

    // Retry re-triggered the save with the kept list…
    expect(mockProvider.createPlaylist).toHaveBeenCalledTimes(1);
    expect(mockProvider.createPlaylist).toHaveBeenCalledWith('Mix - Sifted', [mockTrackA.id]);
    // …cleared the error state…
    expect(queryByText('Failed to save sifted playlist')).toBeNull();
    expect(queryByTestId('retry-save-button')).toBeNull();
    expect(getByText('Sifted playlist created!')).toBeTruthy();
    // …and the buffered keeps are no longer stranded.
    expect(getByTestId('probe-pending-count').props.children).toBe(0);
  });

  test('Start Over is disabled while a restore is in flight', async () => {
    // A restore's removeFromHistory and Start Over's clearHistoryForSource
    // mutate the same history file; a restore also re-adds the track
    // remotely. Letting Start Over run mid-restore would let the queued
    // restore repopulate what the clear just wiped.
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    let resolveRestore: (() => void) | undefined;
    mockProvider.addToPlaylist.mockImplementationOnce(
      () => new Promise<void>((res) => { resolveRestore = () => res(); }),
    );
    const WithRemoved = () => {
      const { decide, dispatch } = useSift();
      // One-shot: decide's identity changes after each decision, and this
      // must remove exactly one track. DoneScreen stays mounted across the
      // whole test (the restored track's ROW disappears, the screen does
      // not).
      const ranRef = React.useRef(false);
      React.useEffect(() => {
        if (ranRef.current) return;
        ranRef.current = true;
        dispatch({
          type: 'SET_SOURCE',
          source: { type: 'playlist', playlist: { id: 'p1', name: 'Mix', trackCount: 3 } },
        });
        decide('remove');
      }, [decide, dispatch]);
      return <DoneScreen />;
    };
    const { getByTestId } = renderWithProviders(
      <WithRemoved />,
      { initialTracks: tracks },
    );
    await act(async () => {});

    await act(async () => {
      fireEvent.press(getByTestId('done-start-over'));
    });
    // Sanity: with nothing in flight the confirmation opens normally.
    expect(alertSpy).toHaveBeenCalledTimes(1);
    alertSpy.mockClear();

    // Kick off a restore; it parks on the playlist re-add.
    await act(async () => {
      fireEvent.press(getByTestId(`restore-track-${mockTrackA.id}`));
    });
    expect(resolveRestore).toBeDefined();

    // While the restore is in flight, Start Over is disabled and pressing
    // it must not even open the destructive confirmation.
    expect(getByTestId('done-start-over').props.accessibilityState?.disabled).toBe(true);
    await act(async () => {
      fireEvent.press(getByTestId('done-start-over'));
    });
    expect(alertSpy).not.toHaveBeenCalled();

    // Once the restore settles, Start Over unblocks.
    await act(async () => {
      resolveRestore?.();
    });
    expect(getByTestId('done-start-over').props.accessibilityState?.disabled).toBe(false);
    alertSpy.mockRestore();
  });

  test('Start Over is disabled while a sifted-playlist save is in flight', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const WithSaveInFlight = () => {
      const { dispatch } = useSift();
      React.useEffect(() => {
        dispatch({
          type: 'SET_SOURCE',
          source: { type: 'playlist', playlist: { id: 'p1', name: 'Mix', trackCount: 3 } },
        });
        dispatch({ type: 'SET_CREATING_PLAYLIST', creating: true });
      }, [dispatch]);
      return <DoneScreen />;
    };
    const { getByTestId } = renderWithProviders(<WithSaveInFlight />, { initialTracks: tracks });
    await act(async () => {});

    // Disabled: a concurrent clearSiftedPlaylist would race the in-flight
    // save on the same remote playlist.
    expect(getByTestId('done-start-over').props.accessibilityState?.disabled).toBe(true);
    await act(async () => {
      fireEvent.press(getByTestId('done-start-over'));
    });
    expect(alertSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  test('fallback save cannot fire while Start Over\'s clear is in flight', async () => {
    // Pins the reverse half of the save/clear mutual exclusion: a keep that
    // buffers while the confirmed Start Over's clear is mid-flight (exactly
    // what a failed parked keep does when the clear's `await keepQueue`
    // settles) must NOT trigger the fallback save until the clear settles —
    // and after a successful clear the reset discards it with the session.
    mockProvider.addToPlaylist.mockClear();
    mockProvider.createPlaylist.mockClear();
    (clearSession as jest.Mock).mockClear();
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockProvider.loadPlaylists.mockResolvedValue([
      { id: 's1', name: 'Mix - Sifted', trackCount: 1 },
    ]);
    mockProvider.loadPlaylistTracks.mockResolvedValue([mockTrackA]);
    // Park the clear mid-flight on its remove call.
    let resolveClear: (() => void) | undefined;
    mockProvider.removeFromPlaylist.mockImplementationOnce(
      () => new Promise<void>((res) => { resolveClear = () => res(); }),
    );

    const WithLateKeep = () => {
      const { dispatch } = useSift();
      React.useEffect(() => {
        dispatch({
          type: 'SET_SOURCE',
          source: { type: 'playlist', playlist: { id: 'p1', name: 'Mix', trackCount: 3 } },
        });
      }, [dispatch]);
      return (
        <>
          <DoneScreen />
          <TouchableOpacity
            testID="late-keep"
            onPress={() => dispatch({ type: 'ADD_PENDING_KEEP', track: mockTrackC })}
          />
        </>
      );
    };
    const { getByTestId } = renderWithProviders(<WithLateKeep />, { initialTracks: tracks });
    await act(async () => {});

    // Confirm Start Over; the clear runs until it parks on the remove.
    await act(async () => {
      fireEvent.press(getByTestId('done-start-over'));
    });
    const buttons = (alertSpy.mock.calls[0][2] ?? []) as { style?: string; onPress?: () => void }[];
    await act(async () => {
      buttons.find((b) => b.style === 'destructive')?.onPress?.();
    });
    expect(resolveClear).toBeDefined();

    // A keep buffers while the clear is in flight…
    await act(async () => {
      fireEvent.press(getByTestId('late-keep'));
    });
    // …and the fallback save must NOT start: no add, no create, and the
    // local session is still untouched (the clear has not settled).
    expect(mockProvider.addToPlaylist).not.toHaveBeenCalled();
    expect(mockProvider.createPlaylist).not.toHaveBeenCalled();
    expect(clearSession).not.toHaveBeenCalled();

    // The clear settles; the reset then discards the buffered keep with the
    // rest of the session — the save never fires against the emptied
    // playlist.
    await act(async () => {
      resolveClear?.();
    });
    expect(mockProvider.addToPlaylist).not.toHaveBeenCalled();
    expect(mockProvider.createPlaylist).not.toHaveBeenCalled();
    expect(clearSession).toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  test('Retry is disabled while Start Over\'s clear is in flight', async () => {
    mockProvider.addToPlaylist.mockClear();
    mockProvider.createPlaylist.mockClear();
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockProvider.loadPlaylists.mockResolvedValue([
      { id: 's1', name: 'Mix - Sifted', trackCount: 1 },
    ]);
    mockProvider.loadPlaylistTracks.mockResolvedValue([mockTrackA]);
    let resolveClear: (() => void) | undefined;
    mockProvider.removeFromPlaylist.mockImplementationOnce(
      () => new Promise<void>((res) => { resolveClear = () => res(); }),
    );

    // A previously failed save left the error + Retry visible on Done.
    const WithSaveError = () => {
      const { dispatch } = useSift();
      React.useEffect(() => {
        dispatch({
          type: 'SET_SOURCE',
          source: { type: 'playlist', playlist: { id: 'p1', name: 'Mix', trackCount: 3 } },
        });
        dispatch({ type: 'DECIDE', decision: 'keep' });
        dispatch({ type: 'SET_PLAYLIST_ERROR', error: 'Failed to save sifted playlist' });
      }, [dispatch]);
      return <DoneScreen />;
    };
    const { getByTestId, getByText } = renderWithProviders(<WithSaveError />, { initialTracks: tracks });
    await act(async () => {});
    expect(getByTestId('retry-save-button').props.accessibilityState?.disabled).not.toBe(true);

    // Confirm Start Over; the clear parks on its remove call.
    await act(async () => {
      fireEvent.press(getByTestId('done-start-over'));
    });
    const buttons = (alertSpy.mock.calls[0][2] ?? []) as { style?: string; onPress?: () => void }[];
    await act(async () => {
      buttons.find((b) => b.style === 'destructive')?.onPress?.();
    });
    expect(resolveClear).toBeDefined();

    // Retry is disabled while the clear is in flight, and pressing it must
    // not start a save: no error reset, no playlist calls racing the clear.
    expect(getByTestId('retry-save-button').props.accessibilityState?.disabled).toBe(true);
    await act(async () => {
      fireEvent.press(getByTestId('retry-save-button'));
    });
    expect(getByText('Failed to save sifted playlist')).toBeTruthy();
    expect(mockProvider.addToPlaylist).not.toHaveBeenCalled();
    expect(mockProvider.createPlaylist).not.toHaveBeenCalled();

    await act(async () => {
      resolveClear?.();
    });
    alertSpy.mockRestore();
  });

  test('failed removals are listed and the blanket removed claim is replaced', async () => {
    const WithRemovalErrors = () => {
      const { decide, dispatch, state } = useSift();
      React.useEffect(() => {
        decide('remove');
        dispatch({ type: 'ADD_REMOVAL_ERROR', error: mockTrackA.name });
      }, [decide, dispatch]);
      if (state.removed.length === 0) return null;
      return <DoneScreen />;
    };
    const { getByTestId, getByText, queryByText } = renderWithProviders(
      <WithRemovalErrors />,
      { initialTracks: tracks },
    );

    // The warning block names the track whose removal failed…
    expect(getByTestId('removal-errors')).toBeTruthy();
    expect(getByTestId('removal-error-0').props.children).toBe(mockTrackA.name);
    // …and the blanket "have been removed" claim is qualified.
    expect(queryByText('These tracks have been moved to "Sift — Removed" in Music.')).toBeNull();
    expect(getByText(/but some could not be/)).toBeTruthy();
  });

  test('a keep buffered during the fallback save re-fires the save for it', async () => {
    // The fallback save snapshots pendingKeeps at effect-fire time. A keep
    // that gets buffered while that save is in flight must survive the
    // save's cleanup (REMOVE_PENDING_KEEPS of the snapshot only) and
    // re-fire the fallback, instead of being wiped with the snapshot.
    mockProvider.addToPlaylist.mockReset();
    let resolveFirstAdd: (() => void) | undefined;
    mockProvider.addToPlaylist
      .mockImplementationOnce(() => new Promise((res) => { resolveFirstAdd = () => res(1); }))
      .mockResolvedValue(1);
    mockProvider.createPlaylist.mockClear();
    mockProvider.loadPlaylists.mockResolvedValue([
      { id: 's1', name: 'Mix - Sifted', trackCount: 0 },
    ]);
    mockProvider.loadPlaylistTracks.mockResolvedValue([]);

    const MidSaveKeep = () => {
      const { dispatch } = useSift();
      React.useEffect(() => {
        dispatch({
          type: 'SET_SOURCE',
          source: { type: 'playlist', playlist: { id: 'p1', name: 'Mix', trackCount: 3 } },
        });
        dispatch({ type: 'ADD_PENDING_KEEP', track: mockTrackA });
      }, [dispatch]);
      return (
        <>
          <DoneScreen />
          <TouchableOpacity
            testID="late-keep"
            onPress={() => dispatch({ type: 'ADD_PENDING_KEEP', track: mockTrackC })}
          />
        </>
      );
    };

    const { getByTestId } = renderWithProviders(
      <MidSaveKeep />,
      { initialTracks: [mockTrackA, mockTrackC] },
    );

    // The fallback save fires for the buffered keep and parks on its add.
    await waitFor(() => expect(resolveFirstAdd).toBeDefined());

    // A late keep is buffered mid-save…
    await act(async () => {
      fireEvent.press(getByTestId('late-keep'));
    });
    await act(async () => {
      resolveFirstAdd?.();
    });

    // …survives the save's cleanup, and the fallback fires again for it.
    await waitFor(() => {
      expect(mockProvider.addToPlaylist).toHaveBeenCalledWith('s1', [mockTrackC.id]);
    });
    expect(mockProvider.addToPlaylist).toHaveBeenCalledWith('s1', [mockTrackA.id]);
    expect(mockProvider.createPlaylist).not.toHaveBeenCalled();
  });

});

describe('PlaylistPicker', () => {
  const mockPlaylists = [
    { id: 'p1', name: 'Chill Vibes', trackCount: 12 },
    { id: 'p2', name: 'Workout Mix', trackCount: 25 },
  ];

  test('renders loading state', () => {
    const { getByTestId } = renderWithProviders(
      <PlaylistPicker playlists={[]} loading={true} onSelect={jest.fn()} onCancel={jest.fn()} />,
    );
    expect(getByTestId('playlist-picker-loading')).toBeTruthy();
  });

  test('renders empty state when no playlists', () => {
    const { getByTestId } = renderWithProviders(
      <PlaylistPicker playlists={[]} loading={false} onSelect={jest.fn()} onCancel={jest.fn()} />,
    );
    expect(getByTestId('playlist-picker-empty')).toBeTruthy();
  });

  test('renders playlist rows', () => {
    const { getByTestId, getByText } = renderWithProviders(
      <PlaylistPicker playlists={mockPlaylists} loading={false} onSelect={jest.fn()} onCancel={jest.fn()} />,
    );
    expect(getByTestId('playlist-picker-list')).toBeTruthy();
    expect(getByText('Chill Vibes')).toBeTruthy();
    expect(getByText('12 tracks')).toBeTruthy();
    expect(getByText('Workout Mix')).toBeTruthy();
    expect(getByText('25 tracks')).toBeTruthy();
  });

  test('tapping a row calls onSelect with the playlist', () => {
    const onSelect = jest.fn();
    const { getByTestId } = renderWithProviders(
      <PlaylistPicker playlists={mockPlaylists} loading={false} onSelect={onSelect} onCancel={jest.fn()} />,
    );
    fireEvent.press(getByTestId('playlist-row-p1'));
    expect(onSelect).toHaveBeenCalledWith(mockPlaylists[0]);
  });

  test('tapping cancel calls onCancel', () => {
    const onCancel = jest.fn();
    const { getByTestId } = renderWithProviders(
      <PlaylistPicker playlists={mockPlaylists} loading={false} onSelect={jest.fn()} onCancel={onCancel} />,
    );
    fireEvent.press(getByTestId('playlist-picker-cancel'));
    expect(onCancel).toHaveBeenCalled();
  });

  test('renders singular "track" for count of 1', () => {
    const single = [{ id: 'p1', name: 'Solo', trackCount: 1 }];
    const { getByText } = renderWithProviders(
      <PlaylistPicker playlists={single} loading={false} onSelect={jest.fn()} onCancel={jest.fn()} />,
    );
    expect(getByText('1 track')).toBeTruthy();
  });
});

describe('SettingsScreen', () => {
  test('renders Settings header', () => {
    const { getByText } = renderWithProviders(<SettingsScreen />);
    expect(getByText('Settings')).toBeTruthy();
  });

  test('renders version text', () => {
    const { getByText } = renderWithProviders(<SettingsScreen />);
    expect(getByText('Version 1.0.0')).toBeTruthy();
  });

  test('renders connection status', () => {
    const { getByTestId } = renderWithProviders(<SettingsScreen />);
    expect(getByTestId('connection-status-label')).toBeTruthy();
    expect(getByTestId('connection-status-indicator')).toBeTruthy();
  });

  test('check connection reports Connected without prompting when already authorized', async () => {
    mockProvider.isAuthorized.mockResolvedValueOnce(true);
    mockProvider.requestAuthorization.mockClear();
    const { getByTestId } = renderWithProviders(<SettingsScreen />);

    await act(async () => {
      fireEvent.press(getByTestId('check-connection-button'));
    });

    await waitFor(() => {
      expect(getByTestId('connection-status-label').props.children).toBe('Connected');
    });
    // Already authorized → must not re-open the consent flow.
    expect(mockProvider.requestAuthorization).not.toHaveBeenCalled();
  });

  test('check connection prompts and reports Connected when authorization is granted', async () => {
    mockProvider.isAuthorized.mockResolvedValueOnce(false);
    mockProvider.requestAuthorization.mockResolvedValueOnce(true);
    const { getByTestId } = renderWithProviders(<SettingsScreen />);

    await act(async () => {
      fireEvent.press(getByTestId('check-connection-button'));
    });

    await waitFor(() => {
      expect(getByTestId('connection-status-label').props.children).toBe('Connected');
    });
    expect(mockProvider.requestAuthorization).toHaveBeenCalled();
  });

  test('check connection prompts and reports Not connected when authorization is denied', async () => {
    mockProvider.isAuthorized.mockResolvedValueOnce(false);
    mockProvider.requestAuthorization.mockResolvedValueOnce(false);
    const { getByTestId } = renderWithProviders(<SettingsScreen />);

    await act(async () => {
      fireEvent.press(getByTestId('check-connection-button'));
    });

    await waitFor(() => {
      expect(getByTestId('connection-status-label').props.children).toBe('Not connected');
    });
  });

  test('renders provider display name', () => {
    const { getByText } = renderWithProviders(<SettingsScreen />);
    expect(getByText('Apple Music')).toBeTruthy();
  });
});
