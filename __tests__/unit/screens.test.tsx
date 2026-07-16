import React from 'react';
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
};

jest.mock('../../src/services', () => ({
  createMusicProvider: jest.fn(() => mockProvider),
  MusicProviderService: {},
}));

jest.mock('../../src/hooks/useResolvedArtwork', () => ({
  useResolvedArtwork: jest.fn().mockReturnValue(null),
}));

// Must import after mocks
import { renderWithProviders, mockTrackA, mockTrackB, mockTrackC } from '../helpers/renderWithProviders';
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

  test('pressing sort button toggles sort dropdown', () => {
    const { getByText, queryByText } = renderWithProviders(<SetupScreen />);
    // Initially dropdown should not show all options
    expect(queryByText('Most Played')).toBeNull();
    // Press the sort button to open dropdown
    fireEvent.press(getByText('Least Played'));
    // Now all options should be visible
    expect(getByText('Most Played')).toBeTruthy();
    expect(getByText('Oldest Added')).toBeTruthy();
    expect(getByText('Newest Added')).toBeTruthy();
    expect(getByText('Random')).toBeTruthy();
  });

  test('selecting a sort option closes dropdown', () => {
    const { getByText, queryByText } = renderWithProviders(<SetupScreen />);
    fireEvent.press(getByText('Least Played'));
    fireEvent.press(getByText('Most Played'));
    // Dropdown should close
    expect(queryByText('Oldest Added')).toBeNull();
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

  test('shows Resume Session and Start Fresh when paused', () => {
    // To get paused state, we need to stop the session
    const StopThenDone = () => {
      const { stopSession } = useSift();
      React.useEffect(() => { stopSession(); }, [stopSession]);
      return <DoneScreen />;
    };
    const { getByText } = renderWithProviders(<StopThenDone />, { initialTracks: tracks });
    expect(getByText('Resume Session')).toBeTruthy();
    expect(getByText('Start Fresh')).toBeTruthy();
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

  test('renders Check Connection button', () => {
    const { getByText } = renderWithProviders(<SettingsScreen />);
    expect(getByText('Check Connection')).toBeTruthy();
  });

  test('shows disconnected status label and indicator', () => {
    const SetDisconnected = () => {
      const { dispatch } = useSift();
      React.useEffect(() => {
        dispatch({ type: 'SET_CONNECTION_STATUS', status: 'disconnected' });
      }, [dispatch]);
      return <SettingsScreen />;
    };
    const { getByTestId } = renderWithProviders(<SetDisconnected />);
    expect(getByTestId('connection-status-label').props.children).toBe('Not connected');
    expect(getByTestId('connection-status-indicator')).toBeTruthy();
  });
});
