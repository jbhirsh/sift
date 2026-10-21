import React from 'react';
import { AccessibilityInfo, ActionSheetIOS, Alert, Text } from 'react-native';
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
  createPlaylist: jest.fn().mockResolvedValue('new-playlist'),
  loadPlaylists: jest.fn().mockResolvedValue([]),
  loadPlaylistTracks: jest.fn().mockResolvedValue([]),
  removeFromPlaylist: jest.fn().mockResolvedValue(undefined),
  restoreRemoved: jest.fn().mockResolvedValue(1),
  removeFromLibrary: jest.fn().mockResolvedValue(undefined),
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
  forgetRemovals: jest.fn(() => Promise.resolve()),
  clearHistoryForSource: jest.fn(() => Promise.resolve(true)),
}));

// The app's config, as the running app gets it: Settings shows its version.
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: jest.requireActual('../../app.json').expo.version } },
}));

jest.mock('../../src/hooks/useResolvedArtwork', () => ({
  useResolvedArtwork: jest.fn().mockReturnValue(null),
  clearArtworkCache: jest.fn(),
}));

// Must import after mocks
import { renderWithProviders, mockTrackA, mockTrackB, mockTrackC } from '../helpers/renderWithProviders';
import { a11yViolations } from '../helpers/a11yScan';
import { clearHistoryForSource } from '../../src/services/RemovalHistoryStore';
import { clearSession } from '../../src/services/SessionStore';
import { useSift } from '../../src/context/SiftContext';
import SetupScreen from '../../src/screens/SetupScreen';
import LoadingScreen from '../../src/screens/LoadingScreen';
import DoneScreen from '../../src/screens/DoneScreen';
import SettingsScreen from '../../src/screens/SettingsScreen';
import PlaylistPicker from '../../src/components/PlaylistPicker';
import { loadReviewedIds, unmarkReviewed } from '../../src/services/ReviewedLedgerStore';
import { useMusicProvider } from '../../src/hooks/useMusicProvider';

describe('SetupScreen', () => {
  // Start Sifting and Start Over read the saved session from disk before
  // they decide whether to ask (#137), so a test's queued loadSession results
  // must not spill into the next test.
  beforeEach(() => {
    const { loadSession } = require('../../src/services/SessionStore');
    (loadSession as jest.Mock).mockReset();
    (loadSession as jest.Mock).mockResolvedValue(null);
  });

  test('renders brand text', async () => {
    const { getByTestId } = await renderWithProviders(<SetupScreen />);
    expect(getByTestId('setup-brand').props.children).toBe('sift.');
  });

  test('renders Start Sifting button when no saved session', async () => {
    const { getByText } = await renderWithProviders(<SetupScreen />);
    expect(getByText('Start Sifting')).toBeTruthy();
  });

  test('renders error when loadError exists', async () => {
    const { queryByTestId } = await renderWithProviders(<SetupScreen />);
    expect(queryByTestId('setup-error')).toBeNull();
  });

  test('offers no music service choice: Apple Music only (#140)', async () => {
    const { queryByText } = await renderWithProviders(<SetupScreen />);
    // Spotify was removed: no option, and no service picker.
    expect(queryByText('Spotify')).toBeNull();
    expect(queryByText('Music service')).toBeNull();
  });

  test('renders sort by section', async () => {
    const { getByText } = await renderWithProviders(<SetupScreen />);
    expect(getByText('Sort by')).toBeTruthy();
    expect(getByText('Least Played')).toBeTruthy();
  });

  test('pressing sort button opens action sheet', async () => {
    const spy = jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions').mockImplementation(() => {});
    const { getByText } = await renderWithProviders(<SetupScreen />);
    await fireEvent.press(getByText('Least Played'));
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        options: ['Least Played', 'Most Played', 'Oldest Added', 'Newest Added', 'Random', 'Cancel'],
        cancelButtonIndex: 5,
      }),
      expect.any(Function),
    );
    spy.mockRestore();
  });

  test('selecting a sort option from action sheet dispatches sort order', async () => {
    const spy = jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions').mockImplementation((_opts, cb) => { cb(1); });
    const { getByText } = await renderWithProviders(<SetupScreen />);
    // Mock calls callback with index 1 ("Most Played") immediately
    await fireEvent.press(getByText('Least Played'));
    expect(getByText('Most Played')).toBeTruthy();
    spy.mockRestore();
  });

  test('Plays and Added pick which songs the sift takes; Cancel leaves them', async () => {
    function FilterProbe() {
      const { state } = useSift();
      return <Text testID="probe-filter">{JSON.stringify(state.filter)}</Text>;
    }
    let pick = 0;
    const spy = jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions').mockImplementation((_opts, cb) => { cb(pick); });
    const { getByTestId } = await renderWithProviders(<><SetupScreen /><FilterProbe /></>);
    expect(getByTestId('filter-plays')).toHaveTextContent('Any');
    expect(getByTestId('filter-added')).toHaveTextContent('Any time');

    pick = 1;
    await fireEvent.press(getByTestId('filter-plays'));
    expect(spy).toHaveBeenLastCalledWith(
      { options: ['Any', 'Never played', '5 or fewer', '20 or fewer', 'Cancel'], cancelButtonIndex: 4 },
      expect.any(Function),
    );
    expect(getByTestId('filter-plays')).toHaveTextContent('Never played');

    pick = 2;
    await fireEvent.press(getByTestId('filter-added'));
    expect(spy).toHaveBeenLastCalledWith(
      { options: ['Any time', 'Over a year ago', 'Over 3 years ago', 'Over 5 years ago', 'Cancel'], cancelButtonIndex: 4 },
      expect.any(Function),
    );
    expect(getByTestId('filter-added')).toHaveTextContent('Over 3 years ago');
    expect(JSON.parse(getByTestId('probe-filter').props.children)).toEqual({ maxPlays: 0, addedYearsAgo: 3 });

    pick = 4; // Cancel
    await fireEvent.press(getByTestId('filter-plays'));
    expect(JSON.parse(getByTestId('probe-filter').props.children)).toEqual({ maxPlays: 0, addedYearsAgo: 3 });
    expect(getByTestId('filter-plays').props.accessibilityRole).toBe('button');
    spy.mockRestore();
  });

  test('renders source picker with Library and Playlist options', async () => {
    const { getByText } = await renderWithProviders(<SetupScreen />);
    expect(getByText('Sift source')).toBeTruthy();
    expect(getByText('Library')).toBeTruthy();
    expect(getByText('Playlist')).toBeTruthy();
  });

  test('tapping Library dispatches SET_SOURCE with library type', async () => {
    const { getByTestId } = await renderWithProviders(<SetupScreen />);
    await fireEvent.press(getByTestId('source-library'));
    // Should not throw — Library is the default
    expect(getByTestId('source-library')).toBeTruthy();
  });

  test('tapping Playlist opens playlist picker', async () => {
    mockProvider.loadPlaylists.mockResolvedValue([
      { id: 'p1', name: 'Test Playlist', trackCount: 5 },
    ]);
    const { getByTestId } = await renderWithProviders(<SetupScreen />);
    await act(async () => {
      await fireEvent.press(getByTestId('source-playlist'));
    });
    expect(getByTestId('playlist-picker-modal')).toBeTruthy();
  });

  test('selecting a playlist from picker shows playlist name', async () => {
    mockProvider.loadPlaylists.mockResolvedValue([
      { id: 'p1', name: 'My Playlist', trackCount: 8 },
    ]);
    const { getByTestId, getByText } = await renderWithProviders(<SetupScreen />);
    await act(async () => {
      await fireEvent.press(getByTestId('source-playlist'));
    });
    await act(async () => {
      await fireEvent.press(getByTestId('playlist-row-p1'));
    });
    expect(getByText('My Playlist')).toBeTruthy();
    expect(getByText('Change')).toBeTruthy();
  });

  test('cancelling playlist picker keeps library source', async () => {
    mockProvider.loadPlaylists.mockResolvedValue([
      { id: 'p1', name: 'Test', trackCount: 3 },
    ]);
    const { getByTestId, queryByTestId } = await renderWithProviders(<SetupScreen />);
    await act(async () => {
      await fireEvent.press(getByTestId('source-playlist'));
    });
    expect(getByTestId('playlist-picker-modal')).toBeTruthy();
    await act(async () => {
      await fireEvent.press(getByTestId('playlist-picker-cancel'));
    });
    expect(queryByTestId('playlist-picker-modal')).toBeNull();
  });

  test('Change button reopens playlist picker', async () => {
    mockProvider.loadPlaylists.mockResolvedValue([
      { id: 'p1', name: 'My Playlist', trackCount: 8 },
    ]);
    const { getByTestId, getByText } = await renderWithProviders(<SetupScreen />);
    // Select a playlist
    await act(async () => {
      await fireEvent.press(getByTestId('source-playlist'));
    });
    await act(async () => {
      await fireEvent.press(getByTestId('playlist-row-p1'));
    });
    // Reopen via Change button
    await act(async () => {
      await fireEvent.press(getByText('Change'));
    });
    expect(getByTestId('playlist-picker-modal')).toBeTruthy();
  });

  test('pressing Start Sifting triggers startFresh', async () => {
    const { getByText } = await renderWithProviders(<SetupScreen />);
    await act(async () => {
      await fireEvent.press(getByText('Start Sifting'));
    });
    // Should not throw
  });

  test('Start Sifting with no unfinished sift starts without asking', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    (clearSession as jest.Mock).mockClear();
    const { getByText } = await renderWithProviders(<SetupScreen />);
    await act(async () => {
      await fireEvent.press(getByText('Start Sifting'));
    });
    expect(alertSpy).not.toHaveBeenCalled();
    expect(clearSession).toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  test('Start Sifting on another source asks before discarding an unfinished sift (#137)', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    (clearSession as jest.Mock).mockClear();
    const { loadSession } = require('../../src/services/SessionStore');
    const session = {
      tracks: [mockTrackA, mockTrackB, mockTrackC],
      cursor: 2,
      kept: [mockTrackA],
      removed: [mockTrackB],
      skipped: [],
      sortOrder: 'least-played',
      savedAt: '2026-04-10T00:00:00.000Z',
      provider: 'apple-music',
      source: { type: 'playlist', playlist: { id: 'p1', name: 'Mix', trackCount: 3 } },
    };
    // Once for the mount check, once when Start Sifting looks again.
    (loadSession as jest.Mock).mockResolvedValueOnce(session).mockResolvedValueOnce(session);
    const { getByTestId, getByText } = await renderWithProviders(<SetupScreen />);
    await act(async () => {});
    // Dismiss the resume prompt and pick a different source.
    await act(async () => {
      await fireEvent.press(getByTestId('resume-modal-cancel'));
    });
    await act(async () => {
      await fireEvent.press(getByTestId('source-library'));
    });
    await act(async () => {
      await fireEvent.press(getByText('Start Sifting'));
    });

    expect(alertSpy).toHaveBeenCalledWith(
      'Discard your current sift?',
      expect.stringContaining('2 decisions so far (1 kept, 1 removed, 0 skipped) in your sift of "Mix"'),
      expect.arrayContaining([
        expect.objectContaining({ text: 'Cancel', style: 'cancel' }),
        expect.objectContaining({ text: 'Discard', style: 'destructive' }),
      ]),
    );
    // Nothing is thrown away until the user confirms.
    expect(clearSession).not.toHaveBeenCalled();
    const buttons = (alertSpy.mock.calls[0][2] ?? []) as { style?: string; onPress?: () => void }[];
    await act(async () => {
      buttons.find((b) => b.style === 'destructive')?.onPress?.();
    });
    expect(clearSession).toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  test('library Start Over in the resume prompt asks first when there are decisions (#137)', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    (clearSession as jest.Mock).mockClear();
    const { loadSession } = require('../../src/services/SessionStore');
    const session = {
      tracks: [mockTrackA, mockTrackB, mockTrackC],
      cursor: 1,
      kept: [mockTrackA],
      removed: [],
      skipped: [],
      sortOrder: 'least-played',
      savedAt: '2026-04-10T00:00:00.000Z',
      provider: 'apple-music',
      source: { type: 'library' },
    };
    // Once for the mount check, once when Start Over reads what it would discard.
    (loadSession as jest.Mock).mockResolvedValueOnce(session).mockResolvedValueOnce(session);
    const { getByTestId } = await renderWithProviders(<SetupScreen />);
    await act(async () => {});
    await act(async () => {
      await fireEvent.press(getByTestId('resume-modal-start-over'));
    });
    expect(alertSpy).toHaveBeenCalledWith(
      'Start Over?',
      expect.stringContaining('1 decision so far'),
      expect.arrayContaining([expect.objectContaining({ text: 'Discard and Start Over', style: 'destructive' })]),
    );
    expect(clearSession).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  test('Start Over first sends the decision the saved session was holding', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { loadSession } = require('../../src/services/SessionStore');
    const { logRemoval } = require('../../src/services/RemovalHistoryStore');
    (logRemoval as jest.Mock).mockClear();
    const session = {
      tracks: [mockTrackA, mockTrackB, mockTrackC],
      cursor: 2,
      kept: [mockTrackA],
      removed: [mockTrackB],
      skipped: [],
      sortOrder: 'least-played',
      savedAt: '2026-04-10T00:00:00.000Z',
      provider: 'apple-music',
      source: { type: 'library' },
      pending: { trackId: mockTrackB.id, decision: 'remove', at: 515151 },
    };
    (loadSession as jest.Mock).mockResolvedValue(session);
    const { getByTestId } = await renderWithProviders(<SetupScreen />);
    await act(async () => {});
    await act(async () => {
      await fireEvent.press(getByTestId('resume-modal-start-over'));
    });
    const buttons = alertSpy.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    await act(async () => {
      buttons.find((b) => b.text === 'Discard and Start Over')?.onPress?.();
    });
    expect(logRemoval).toHaveBeenCalledWith(expect.objectContaining({ track: mockTrackB, source: { type: 'library' } }));
    expect(clearSession).toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  test('the Setup footnote says what Remove does for the chosen source (#141)', async () => {
    const { getByTestId } = await renderWithProviders(<SetupScreen />);
    expect(getByTestId('remove-explanation').props.children).toBe(
      'Removed songs are collected in "Sift \u2014 Removed" for you to delete from your library in Music.',
    );
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

    const { queryByText } = await renderWithProviders(<SetupScreen />);
    await act(async () => {});
    expect(queryByText('Resume Sifting')).toBeTruthy();
    expect(queryByText('Start Sifting')).toBeNull();
  });

  test('"Finish and see summary" after backing out of a sift shows Done (#142)', async () => {
    const BackedOut = () => {
      const { dispatch, state } = useSift();
      React.useEffect(() => {
        dispatch({ type: 'LOAD_TRACKS', tracks: [mockTrackA, mockTrackB] });
        dispatch({ type: 'SET_PHASE', phase: 'setup' });
      }, [dispatch]);
      return (
        <>
          <SetupScreen />
          <Text testID="probe-phase">{state.phase}</Text>
        </>
      );
    };
    const { getByTestId } = await renderWithProviders(<BackedOut />);
    await act(async () => {});
    await act(async () => {
      await fireEvent.press(getByTestId('setup-finish'));
    });
    expect(getByTestId('probe-phase').props.children).toBe('done');
  });

  test('"Finish and see summary" resumes a saved sift straight to Done (#142)', async () => {
    function PhaseProbe() {
      const { state } = useSift();
      return <Text testID="probe-phase">{`${state.phase}:${state.cursor}`}</Text>;
    }
    const { loadSession } = require('../../src/services/SessionStore');
    let resolveSession: ((session: unknown) => void) | undefined;
    (loadSession as jest.Mock).mockImplementationOnce(
      () => new Promise((res) => { resolveSession = res; }),
    );
    const { getByTestId } = await renderWithProviders(<><SetupScreen /><PhaseProbe /></>);
    // The source is picked while the saved sift loads, so no sheet pops up
    // and the inline Resume block offers it instead.
    await act(async () => {
      await fireEvent.press(getByTestId('source-library'));
    });
    await act(async () => {
      resolveSession?.({
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
    });
    await act(async () => {
      await fireEvent.press(getByTestId('setup-finish'));
    });
    expect(getByTestId('probe-phase').props.children).toBe('done:1');
  });

  test('the inline Resume block shows the saved sift\'s counts (#142)', async () => {
    const { loadSession } = require('../../src/services/SessionStore');
    let resolveSession: ((session: unknown) => void) | undefined;
    (loadSession as jest.Mock).mockImplementationOnce(
      () => new Promise((res) => { resolveSession = res; }),
    );
    const { getByTestId } = await renderWithProviders(<SetupScreen />);
    await act(async () => {
      await fireEvent.press(getByTestId('source-library'));
    });
    await act(async () => {
      resolveSession?.({
        tracks: [mockTrackA, mockTrackB, mockTrackC],
        cursor: 2,
        kept: [mockTrackA],
        removed: [mockTrackB],
        skipped: [],
        sortOrder: 'least-played',
        savedAt: '2026-04-10T00:00:00.000Z',
        provider: 'apple-music',
        source: { type: 'library' },
      });
    });
    expect(getByTestId('setup-stat-kept').props.accessibilityLabel).toBe('1 kept');
    expect(getByTestId('setup-stat-removed').props.accessibilityLabel).toBe('1 removed');
    expect(getByTestId('setup-stat-skipped').props.accessibilityLabel).toBe('0 skipped');
    expect(getByTestId('setup-stat-remaining').props.accessibilityLabel).toBe('1 remaining');
  });

  test('the inline Resume block counts an in-memory sift after backing out (#142)', async () => {
    const BackedOut = () => {
      const { dispatch, decide } = useSift();
      React.useEffect(() => {
        dispatch({ type: 'LOAD_TRACKS', tracks: [mockTrackA, mockTrackB, mockTrackC] });
        decide('skip');
        dispatch({ type: 'SET_PHASE', phase: 'setup' });
      }, [dispatch, decide]);
      return <SetupScreen />;
    };
    const { getByTestId } = await renderWithProviders(<BackedOut />);
    await act(async () => {});
    expect(getByTestId('setup-stat-skipped').props.accessibilityLabel).toBe('1 skipped');
    expect(getByTestId('setup-stat-remaining').props.accessibilityLabel).toBe('2 remaining');
  });

  test('Resume restores persisted removalErrors', async () => {
    function ErrorsProbe() {
      const { state } = useSift();
      return <Text testID="probe-errors">{state.removalErrors.join('|')}</Text>;
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
      removalErrors: ['Could not remove Track B'],
    });

    const { getByTestId } = await renderWithProviders(<><SetupScreen /><ErrorsProbe /></>);
    await act(async () => {});
    await act(async () => {
      await fireEvent.press(getByTestId('resume-modal-resume'));
    });
    // The repair signal survives the kill/relaunch.
    expect(getByTestId('probe-errors').props.children).toBe('Could not remove Track B');
  });

  test('Resume asks for Music access first, and stays on Setup without it', async () => {
    function PhaseProbe() {
      const { state } = useSift();
      return <Text testID="probe-phase">{state.phase}</Text>;
    }
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockProvider.isAuthorized.mockResolvedValueOnce(false);
    mockProvider.requestAuthorization.mockResolvedValueOnce(false);
    const { loadSession } = require('../../src/services/SessionStore');
    (loadSession as jest.Mock).mockResolvedValueOnce({
      tracks: [mockTrackA, mockTrackB],
      cursor: 1,
      kept: [mockTrackA],
      removed: [],
      skipped: [],
      sortOrder: 'least-played',
      savedAt: '2026-04-10T00:00:00.000Z',
      provider: 'apple-music',
      source: { type: 'library' },
    });
    const { getByTestId } = await renderWithProviders(<><SetupScreen /><PhaseProbe /></>);
    await act(async () => {});
    await act(async () => {
      await fireEvent.press(getByTestId('resume-modal-resume'));
    });
    expect(alertSpy).toHaveBeenCalledWith('Music Access Required', expect.any(String), expect.any(Array));
    expect(getByTestId('probe-phase').props.children).toBe('setup');
    alertSpy.mockRestore();
  });

  test('a new sift first sends the decision the saved session was holding', async () => {
    const { loadSession } = require('../../src/services/SessionStore');
    const { logRemoval } = require('../../src/services/RemovalHistoryStore');
    (logRemoval as jest.Mock).mockClear();
    mockProvider.removeFromLibrary.mockClear();
    mockProvider.removeFromPlaylist.mockClear();
    const mix = { type: 'playlist', playlist: { id: 'p9', name: 'Old Mix', trackCount: 3 } };
    // Finished but for its last card's decision, which never went out.
    const session = {
      tracks: [mockTrackA, mockTrackB],
      cursor: 2,
      kept: [mockTrackA],
      removed: [mockTrackB],
      skipped: [],
      sortOrder: 'least-played',
      savedAt: '2026-04-10T00:00:00.000Z',
      provider: 'apple-music',
      source: mix,
      pending: { trackId: mockTrackB.id, decision: 'remove', at: 424242 },
    };
    (loadSession as jest.Mock).mockResolvedValue(session);
    const { getByText } = await renderWithProviders(<SetupScreen />);
    await act(async () => {
      await fireEvent.press(getByText('Start Sifting'));
    });
    expect(logRemoval).toHaveBeenCalledWith(expect.objectContaining({ track: mockTrackB, source: mix }));
    // Collected in "Sift — Removed", like any Remove; the playlist isn't edited.
    expect(mockProvider.removeFromLibrary).toHaveBeenCalledWith([mockTrackB.id]);
    expect(mockProvider.removeFromPlaylist).not.toHaveBeenCalled();
    expect(clearSession).toHaveBeenCalled();
  });

  test.each([
    // Saved before failed removals were recorded by id: derived from the
    // names, so the chip and Done still count the failure.
    ['a legacy session (names only)', {}, 'b'],
    // Saved with ids: taken as saved, not re-derived from names.
    ['a session with ids', { failedRemovalIds: ['c'] }, 'c'],
  ])('Resume restores failed removal ids from %s', async (_label, extra, expected) => {
    function FailedIdsProbe() {
      const { state } = useSift();
      return <Text testID="probe-failed-ids">{state.failedRemovalIds.join(',')}</Text>;
    }
    const removedB = { ...mockTrackB, id: 'b' };
    const removedC = { ...mockTrackC, id: 'c' };
    const { loadSession } = require('../../src/services/SessionStore');
    (loadSession as jest.Mock).mockResolvedValueOnce({
      tracks: [mockTrackA, removedB, removedC],
      cursor: 2,
      kept: [],
      removed: [removedB, removedC],
      skipped: [],
      sortOrder: 'least-played',
      savedAt: '2026-04-10T00:00:00.000Z',
      provider: 'apple-music',
      source: { type: 'library' },
      removalErrors: [mockTrackB.name],
      ...extra,
    });

    const { getByTestId } = await renderWithProviders(<><SetupScreen /><FailedIdsProbe /></>);
    await act(async () => {});
    await act(async () => {
      await fireEvent.press(getByTestId('resume-modal-resume'));
    });
    expect(getByTestId('probe-failed-ids').props.children).toBe(expected);
  });

  test.each([
    ['a playlist sift reloads its playlist (#54)', { type: 'playlist', playlist: { id: 'pl-9', name: 'Mix', trackCount: 3 } }, 'pl-9'],
    ['a library sift has no playlist to reload', { type: 'library' }, undefined],
  ])('Resume warms the cache: %s', async (_label, source, expectedPlaylist) => {
    const warm = jest.fn().mockResolvedValue(3);
    (mockProvider as { warmSongCache?: jest.Mock }).warmSongCache = warm;
    try {
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
        source,
      });
      const { getByTestId } = await renderWithProviders(<SetupScreen />);
      await act(async () => {});
      await act(async () => {
        await fireEvent.press(getByTestId('resume-modal-resume'));
      });
      // From the card it resumes on: the cards up next (with the playlist
      // reload), then the rest, the decided ones last.
      expect(warm).toHaveBeenNthCalledWith(1, [mockTrackB.id, mockTrackC.id], expectedPlaylist);
      expect(warm).toHaveBeenNthCalledWith(2, [mockTrackA.id], undefined);
    } finally {
      delete (mockProvider as { warmSongCache?: jest.Mock }).warmSongCache;
    }
  });

  test('Resume marks the cache warming until each warm-up is done, so the card can retry', async () => {
    function CacheProbe() {
      const { state } = useSift();
      return <Text testID="probe-cache">{`${state.songCacheWarming}:${state.songCacheGeneration}`}</Text>;
    }
    let finishFirst!: () => void;
    const warm = jest.fn()
      .mockImplementationOnce(() => new Promise<number>((resolve) => { finishFirst = () => resolve(2); }))
      .mockResolvedValue(1);
    (mockProvider as { warmSongCache?: jest.Mock }).warmSongCache = warm;
    try {
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
      const { getByTestId } = await renderWithProviders(<><SetupScreen /><CacheProbe /></>);
      await act(async () => {});
      await act(async () => {
        await fireEvent.press(getByTestId('resume-modal-resume'));
      });
      expect(getByTestId('probe-cache').props.children).toBe('true:0');
      await act(async () => {
        finishFirst();
      });
      expect(getByTestId('probe-cache').props.children).toBe('false:2');
    } finally {
      delete (mockProvider as { warmSongCache?: jest.Mock }).warmSongCache;
    }
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

    const { getByTestId, queryByTestId } = await renderWithProviders(<SetupScreen />);
    await act(async () => {});

    expect(queryByTestId('resume-session-modal')).toBeTruthy();

    await act(async () => {
      await fireEvent.press(getByTestId('resume-modal-cancel'));
    });
    expect(queryByTestId('resume-session-modal')).toBeNull();

    await act(async () => {
      await fireEvent.press(getByTestId('source-playlist'));
    });
    await act(async () => {
      await fireEvent.press(getByTestId('source-library'));
    });

    expect(queryByTestId('resume-session-modal')).toBeNull();
  });

  test('playlist picker excludes "- Sifted" companion playlists', async () => {
    mockProvider.loadPlaylists.mockResolvedValue([
      { id: 'p1', name: 'My Playlist', trackCount: 8 },
      { id: 's1', name: 'My Playlist - Sifted', trackCount: 8 },
      { id: 'r1', name: 'Sift \u2014 Removed', trackCount: 3 },
    ]);
    const { getByTestId, queryByTestId } = await renderWithProviders(<SetupScreen />);
    await act(async () => {
      await fireEvent.press(getByTestId('source-playlist'));
    });
    expect(getByTestId('playlist-row-p1')).toBeTruthy();
    // Companion playlists are sift outputs, not sources — offering one
    // would target "<x> - Sifted - Sifted".
    expect(queryByTestId('playlist-row-s1')).toBeNull();
    // Nor "Sift — Removed": every song in it is already removed.
    expect(queryByTestId('playlist-row-r1')).toBeNull();
  });

  test('a "- Sifted" playlist no longer changes the button: a playlist offers Start Sifting', async () => {
    mockProvider.loadPlaylists.mockResolvedValue([
      { id: 'p1', name: 'My Playlist', trackCount: 8 },
      { id: 's1', name: 'My Playlist - Sifted', trackCount: 8 },
    ]);
    const { getByTestId, queryByText } = await renderWithProviders(<SetupScreen />);
    await act(async () => {
      await fireEvent.press(getByTestId('source-playlist'));
    });
    await act(async () => {
      await fireEvent.press(getByTestId('playlist-row-p1'));
    });
    expect(queryByText('Start Sifting')).toBeTruthy();
    expect(queryByText('Re-sift Playlist')).toBeNull();
  });

  const mixSession = {
    tracks: [mockTrackA, mockTrackB, mockTrackC],
    cursor: 1,
    kept: [mockTrackA],
    removed: [],
    skipped: [],
    sortOrder: 'least-played',
    savedAt: '2026-04-10T00:00:00.000Z',
    provider: 'apple-music',
    source: { type: 'playlist', playlist: { id: 'p1', name: 'Mix', trackCount: 3 } },
  };

  test('a playlist Start Over asks first, then clears its removal history (all but collected removals), never touching "- Sifted"', async () => {
    (clearHistoryForSource as jest.Mock).mockClear();
    (clearSession as jest.Mock).mockClear();
    mockProvider.removeFromPlaylist.mockClear();
    mockProvider.loadPlaylists.mockClear();
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { InteractionManager } = require('react-native');
    const later = jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation((cb: unknown) => {
      (cb as () => void)();
      return { then: () => undefined, done: () => undefined, cancel: () => undefined };
    });
    const { loadSession } = require('../../src/services/SessionStore');
    (loadSession as jest.Mock).mockResolvedValue(mixSession);
    const { getByTestId } = await renderWithProviders(<SetupScreen />);
    await act(async () => {});
    await act(async () => {
      await fireEvent.press(getByTestId('resume-modal-start-over'));
    });
    expect(alertSpy).toHaveBeenCalledWith(
      'Start Over?',
      // Apple Music collects removals, so nothing about the history.
      'You have 1 decision so far (1 kept, 0 removed, 0 skipped) in your sift of "Mix". You won’t be able to resume it.',
      expect.arrayContaining([expect.objectContaining({ text: 'Discard and Start Over', style: 'destructive' })]),
    );
    // Nothing goes before the user confirms.
    expect(clearHistoryForSource).not.toHaveBeenCalled();
    expect(clearSession).not.toHaveBeenCalled();
    const buttons = (alertSpy.mock.calls[0][2] ?? []) as { style?: string; onPress?: () => void }[];
    await act(async () => {
      buttons.find((b) => b.style === 'destructive')?.onPress?.();
    });
    expect(clearHistoryForSource).toHaveBeenCalledWith('p1');
    expect(clearSession).toHaveBeenCalled();
    expect(mockProvider.loadPlaylists).not.toHaveBeenCalled();
    expect(mockProvider.removeFromPlaylist).not.toHaveBeenCalled();
    alertSpy.mockRestore();
    later.mockRestore();
  });

  test('a playlist Start Over that can\'t clear the removal history keeps the sift and says so', async () => {
    (clearSession as jest.Mock).mockClear();
    (clearHistoryForSource as jest.Mock).mockResolvedValueOnce(false);
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { InteractionManager } = require('react-native');
    const later = jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation((cb: unknown) => {
      (cb as () => void)();
      return { then: () => undefined, done: () => undefined, cancel: () => undefined };
    });
    const { loadSession } = require('../../src/services/SessionStore');
    (loadSession as jest.Mock).mockResolvedValue(mixSession);
    const { getByTestId } = await renderWithProviders(<SetupScreen />);
    await act(async () => {});
    await act(async () => {
      await fireEvent.press(getByTestId('resume-modal-start-over'));
    });
    const buttons = (alertSpy.mock.calls[0][2] ?? []) as { style?: string; onPress?: () => void }[];
    await act(async () => {
      buttons.find((b) => b.style === 'destructive')?.onPress?.();
    });
    expect(getByTestId('setup-error').props.children).toBe('Could not clear the removal history. Try again.');
    expect(clearSession).not.toHaveBeenCalled();
    alertSpy.mockRestore();
    later.mockRestore();
  });

  test('a playlist Start Over with no decisions to lose still asks, and says removed songs stay collected', async () => {
    (clearHistoryForSource as jest.Mock).mockClear();
    (clearSession as jest.Mock).mockClear();
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { InteractionManager } = require('react-native');
    const later = jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation((cb: unknown) => {
      (cb as () => void)();
      return { then: () => undefined, done: () => undefined, cancel: () => undefined };
    });
    const { loadSession } = require('../../src/services/SessionStore');
    (loadSession as jest.Mock).mockResolvedValue({ ...mixSession, cursor: 0, kept: [] });
    const { getByTestId } = await renderWithProviders(<SetupScreen />);
    await act(async () => {});
    await act(async () => {
      await fireEvent.press(getByTestId('resume-modal-start-over'));
    });
    expect(alertSpy).toHaveBeenCalledWith(
      'Start Over?',
      'This starts "Mix" over. Songs you removed stay in "Sift \u2014 Removed".',
      expect.arrayContaining([expect.objectContaining({ text: 'Start Over', style: 'destructive' })]),
    );
    expect(clearHistoryForSource).not.toHaveBeenCalled();
    const buttons = (alertSpy.mock.calls[0][2] ?? []) as { style?: string; onPress?: () => void }[];
    await act(async () => {
      buttons.find((b) => b.style === 'destructive')?.onPress?.();
    });
    expect(clearHistoryForSource).toHaveBeenCalledWith('p1');
    expect(clearSession).toHaveBeenCalled();
    alertSpy.mockRestore();
    later.mockRestore();
  });

  test('with the sift still in memory, picking its source again resumes it, not the older copy Setup loaded', async () => {
    // Setup loads the saved session when it opens. A sift backed out of is
    // in memory too, and changes after that load (a held decision sent on
    // the way out, a removal that failed): the copy on disk is older.
    // Picking the sift's source again used to offer that copy in the
    // resume sheet, and Resume restored it over the newer sift.
    function Probe() {
      const { state } = useSift();
      return <Text testID="probe-cursor">{`${state.phase}:${state.cursor}:${state.skipped.length}`}</Text>;
    }
    const BackedOut = () => {
      const { dispatch, decide } = useSift();
      const ran = React.useRef(false);
      React.useEffect(() => {
        if (ran.current) return;
        ran.current = true;
        dispatch({ type: 'LOAD_TRACKS', tracks: [mockTrackA, mockTrackB, mockTrackC] });
        decide('skip');
        decide('skip');
        dispatch({ type: 'SET_PHASE', phase: 'setup' });
      }, [dispatch, decide]);
      return <SetupScreen />;
    };
    const { loadSession } = require('../../src/services/SessionStore');
    // The older copy: one decision behind the sift in memory.
    (loadSession as jest.Mock).mockResolvedValue({
      tracks: [mockTrackA, mockTrackB, mockTrackC],
      cursor: 1,
      kept: [],
      removed: [],
      skipped: [mockTrackA],
      sortOrder: 'least-played',
      savedAt: '2026-04-10T00:00:00.000Z',
      provider: 'apple-music',
      source: { type: 'library' },
    });
    mockProvider.loadPlaylists.mockResolvedValue([{ id: 'p1', name: 'My Playlist', trackCount: 8 }]);
    const { getByTestId, getByText, queryByTestId } = await renderWithProviders(<><BackedOut /><Probe /></>);
    await act(async () => {});
    expect(queryByTestId('resume-session-modal')).toBeNull();
    // Away to a playlist and back to the library.
    await act(async () => {
      await fireEvent.press(getByTestId('source-playlist'));
    });
    await act(async () => {
      await fireEvent.press(getByTestId('playlist-row-p1'));
    });
    await act(async () => {
      await fireEvent.press(getByTestId('source-library'));
    });
    expect(queryByTestId('resume-session-modal')).toBeNull();
    await act(async () => {
      await fireEvent.press(getByText('Resume Sifting'));
    });
    expect(getByTestId('probe-cursor').props.children).toBe('sifting:2:2');
  });

  test('without the sift in memory, picking the saved sift\'s source still offers it', async () => {
    const { loadSession } = require('../../src/services/SessionStore');
    let resolveSession: ((session: unknown) => void) | undefined;
    (loadSession as jest.Mock).mockImplementationOnce(
      () => new Promise((res) => { resolveSession = res; }),
    );
    mockProvider.loadPlaylists.mockResolvedValue([{ id: 'p1', name: 'Mix', trackCount: 3 }]);
    const { getByTestId, queryByTestId } = await renderWithProviders(<SetupScreen />);
    // Library picked while the saved playlist sift loads: no sheet yet.
    await act(async () => {
      await fireEvent.press(getByTestId('source-library'));
    });
    await act(async () => {
      resolveSession?.(mixSession);
    });
    expect(queryByTestId('resume-session-modal')).toBeNull();
    await act(async () => {
      await fireEvent.press(getByTestId('source-playlist'));
    });
    await act(async () => {
      await fireEvent.press(getByTestId('playlist-row-p1'));
    });
    expect(queryByTestId('resume-session-modal')).toBeTruthy();
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

    const { queryByTestId, queryByText } = await renderWithProviders(<BackedOut />);
    await act(async () => {});

    expect(queryByTestId('resume-session-modal')).toBeNull();
    expect(queryByText('Resume Sifting')).toBeTruthy();
  });

  test('a source picked while the session is still loading is not overwritten', async () => {
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

    const { getByTestId, queryByTestId } = await renderWithProviders(
      <><SetupScreen /><ProviderProbe /></>,
    );
    // The user picks the library source while loadSession is still pending…
    await act(async () => {
      await fireEvent.press(getByTestId('source-library'));
    });

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

    // The explicit choice survives: no source overwrite, no modal shoved on
    // top of an in-progress setup.
    expect(getByTestId('probe-source-type').props.children).toBe('library');
    expect(queryByTestId('resume-session-modal')).toBeNull();
  });

  test('a finished session is dropped silently, even one an older build saved with keeps that never reached "- Sifted"', async () => {
    // Those keeps are remembered in the ledger as the session loads
    // (SessionStore), so nothing is left on it to resume for.
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

    const { queryByTestId, queryByText } = await renderWithProviders(<SetupScreen />);
    await act(async () => {});

    expect(queryByTestId('resume-session-modal')).toBeNull();
    expect(queryByText('Start Sifting')).toBeTruthy();
    expect(queryByText('Resume Sifting')).toBeNull();
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

    const { getByTestId, queryByText } = await renderWithProviders(<SetupScreen />);
    // Wait for session to load (source gets pre-populated to playlist)
    await act(async () => {});
    // Switch source back to library — no longer matches saved session
    await act(async () => {
      await fireEvent.press(getByTestId('source-library'));
    });
    expect(queryByText('Start Sifting')).toBeTruthy();
    expect(queryByText('Resume Sifting')).toBeNull();
  });
});

describe('SetupScreen: songs sifted before (#143)', () => {
  const AsyncStorage = require('@react-native-async-storage/async-storage').default;
  afterEach(async () => {
    await AsyncStorage.clear();
  });

  function SkipProbe() {
    const { state } = useSift();
    return <Text testID="probe-skip">{`${state.phase}:${state.skipFiltering}`}</Text>;
  }

  test('no switch before anything was kept', async () => {
    const { queryByTestId } = await renderWithProviders(<SetupScreen />);
    await act(async () => {});
    expect(queryByTestId('include-sifted-switch')).toBeNull();
  });

  test('says how many kept songs a library sift leaves out, and the switch brings them back', async () => {
    await AsyncStorage.setItem('sift_reviewed_ledger', JSON.stringify({ 'apple-music:library': ['a', 'b', 'c'] }));
    const { getByTestId } = await renderWithProviders(<><SetupScreen /><SkipProbe /></>);
    await act(async () => {});
    expect(getByTestId('reviewed-note').props.children).toBe('3 songs you’ve already kept are left out of new sifts.');
    await act(async () => {
      await fireEvent(getByTestId('include-sifted-switch'), 'valueChange', true);
    });
    expect(getByTestId('reviewed-note').props.children).toBe('Songs you’ve already kept are included in new sifts. Songs you removed stay out.');
    await act(async () => {
      await fireEvent.press(getByTestId('setup-start-sifting'));
    });
    expect(getByTestId('probe-skip').props.children).toBe('loading:true');
  });

  test('a playlist counts the songs an older build saved to its "- Sifted"', async () => {
    // Matched by song: "- Sifted" files each one under a new id.
    mockProvider.loadPlaylists.mockResolvedValue([
      { id: 'p1', name: 'My Playlist', trackCount: 3 },
      { id: 's1', name: 'My Playlist - Sifted', trackCount: 2 },
    ]);
    mockProvider.loadPlaylistTracks.mockImplementation(async (id: string) =>
      (id === 's1' ? [{ ...mockTrackA, id: 'i.1' }, { ...mockTrackB, id: 'i.2' }] : [mockTrackA, mockTrackB, mockTrackC]));
    try {
      const { getByTestId, queryByTestId } = await renderWithProviders(<SetupScreen />);
      await act(async () => {});
      expect(queryByTestId('include-sifted-switch')).toBeNull();
      await act(async () => {
        await fireEvent.press(getByTestId('source-playlist'));
      });
      await act(async () => {
        await fireEvent.press(getByTestId('playlist-row-p1'));
      });
      await act(async () => {});
      expect(getByTestId('reviewed-note').props.children).toBe('2 songs you’ve already kept are left out of new sifts.');
      expect(getByTestId('include-sifted-switch')).toBeTruthy();
    } finally {
      mockProvider.loadPlaylists.mockResolvedValue([]);
      mockProvider.loadPlaylistTracks.mockReset().mockResolvedValue([]);
    }
  });

  test('a playlist shows its own kept songs, and the switch brings them back for it', async () => {
    await AsyncStorage.setItem('sift_reviewed_ledger', JSON.stringify({
      'apple-music:library': ['x'],
      'apple-music:playlist:p1': ['a', 'b'],
    }));
    mockProvider.loadPlaylists.mockResolvedValue([
      { id: 'p1', name: 'My Playlist', trackCount: 8 },
      { id: 'p2', name: 'Other', trackCount: 3 },
    ]);
    const { getByTestId, queryByTestId } = await renderWithProviders(<><SetupScreen /><SkipProbe /></>);
    await act(async () => {});
    expect(getByTestId('reviewed-note').props.children).toBe('1 song you’ve already kept is left out of new sifts.');
    await act(async () => {
      await fireEvent.press(getByTestId('source-playlist'));
    });
    await act(async () => {
      await fireEvent.press(getByTestId('playlist-row-p2'));
    });
    // Nothing kept from this one yet.
    expect(queryByTestId('include-sifted-switch')).toBeNull();
    await act(async () => {
      await fireEvent.press(getByTestId('source-playlist'));
    });
    await act(async () => {
      await fireEvent.press(getByTestId('playlist-row-p1'));
    });
    expect(getByTestId('reviewed-note').props.children).toBe('2 songs you’ve already kept are left out of new sifts.');
    await act(async () => {
      await fireEvent(getByTestId('include-sifted-switch'), 'valueChange', true);
    });
    await act(async () => {
      await fireEvent.press(getByTestId('setup-start-sifting'));
    });
    expect(getByTestId('probe-skip').props.children).toBe('loading:true');
  });

  test('the switch only counts for a source it shows for', async () => {
    await AsyncStorage.setItem('sift_reviewed_ledger', JSON.stringify({ 'apple-music:library': ['x'] }));
    mockProvider.loadPlaylists.mockResolvedValue([{ id: 'p2', name: 'Other', trackCount: 3 }]);
    const { getByTestId } = await renderWithProviders(<><SetupScreen /><SkipProbe /></>);
    await act(async () => {});
    await act(async () => {
      await fireEvent(getByTestId('include-sifted-switch'), 'valueChange', true);
    });
    await act(async () => {
      await fireEvent.press(getByTestId('source-playlist'));
    });
    await act(async () => {
      await fireEvent.press(getByTestId('playlist-row-p2'));
    });
    // Turned on for the library; this playlist has nothing to bring back.
    await act(async () => {
      await fireEvent.press(getByTestId('setup-start-sifting'));
    });
    expect(getByTestId('probe-skip').props.children).toBe('loading:false');
  });


  test('left off, a new library sift filters them out', async () => {
    await AsyncStorage.setItem('sift_reviewed_ledger', JSON.stringify({ 'apple-music:library': ['a'] }));
    const { getByTestId } = await renderWithProviders(<><SetupScreen /><SkipProbe /></>);
    await act(async () => {});
    expect(getByTestId('reviewed-note').props.children).toBe('1 song you’ve already kept is left out of new sifts.');
    await act(async () => {
      await fireEvent.press(getByTestId('setup-start-sifting'));
    });
    expect(getByTestId('probe-skip').props.children).toBe('loading:false');
  });
});

describe('SetupScreen: Start Over and songs sifted before (#143)', () => {
  const AsyncStorage = require('@react-native-async-storage/async-storage').default;
  afterEach(async () => {
    await AsyncStorage.clear();
  });

  function BackedOut({ playlist = false }: { playlist?: boolean }) {
    const { dispatch, decide, state } = useSift();
    // One-shot: decide's identity changes with state, and a re-run would
    // undo the Start Over under test.
    const ran = React.useRef(false);
    React.useEffect(() => {
      if (ran.current) return;
      ran.current = true;
      if (playlist) {
        dispatch({ type: 'SET_SOURCE', source: { type: 'playlist', playlist: { id: 'p1', name: 'Mix', trackCount: 3 } } });
      }
      dispatch({ type: 'LOAD_TRACKS', tracks: [mockTrackA, mockTrackB, mockTrackC] });
      decide('keep');
      dispatch({ type: 'SET_PHASE', phase: 'setup' });
    }, [dispatch, decide, playlist]);
    return (
      <>
        <SetupScreen />
        <Text testID="probe-skip">{`${state.phase}:${state.skipFiltering}`}</Text>
      </>
    );
  }

  test.each([
    [false, 'loading:false'],
    [true, 'loading:true'],
  ])('a playlist Start Over follows the switch too, not "- Sifted" (on: %s)', async (on, expected) => {
    jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.style === 'destructive')?.onPress?.();
    });
    const { InteractionManager } = require('react-native');
    jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation((cb: unknown) => {
      (cb as () => void)();
      return { then: () => undefined, done: () => undefined, cancel: () => undefined };
    });
    mockProvider.loadPlaylists.mockClear();
    await AsyncStorage.setItem('sift_reviewed_ledger', JSON.stringify({ 'apple-music:playlist:p1': ['x'] }));
    // Its "- Sifted" was looked for once already (services/SiftedImport).
    await AsyncStorage.setItem('sift_sifted_imported', JSON.stringify(['apple-music:playlist:p1']));
    const { getByTestId } = await renderWithProviders(<BackedOut playlist />);
    await act(async () => {});
    if (on) {
      await act(async () => {
        await fireEvent(getByTestId('include-sifted-switch'), 'valueChange', true);
      });
    }
    await act(async () => {
      await fireEvent.press(getByTestId('setup-start-over'));
    });
    await act(async () => {});
    expect(getByTestId('probe-skip').props.children).toBe(expected);
    expect(clearHistoryForSource).toHaveBeenCalledWith('p1');
    expect(mockProvider.loadPlaylists).not.toHaveBeenCalled();
    jest.restoreAllMocks();
  });

  test.each([
    [false, 'loading:false'],
    [true, 'loading:true'],
  ])('a library Start Over follows the switch (on: %s)', async (on, expected) => {
    jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.style === 'destructive')?.onPress?.();
    });
    const { InteractionManager } = require('react-native');
    jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation((cb: unknown) => {
      (cb as () => void)();
      return { then: () => undefined, done: () => undefined, cancel: () => undefined };
    });
    await AsyncStorage.setItem('sift_reviewed_ledger', JSON.stringify({ 'apple-music:library': ['x'] }));
    const { getByTestId } = await renderWithProviders(<BackedOut />);
    await act(async () => {});
    // Shown beside the resume block too: it decides what Start Over loads.
    if (on) {
      await act(async () => {
        await fireEvent(getByTestId('include-sifted-switch'), 'valueChange', true);
      });
    }
    await act(async () => {
      await fireEvent.press(getByTestId('setup-start-over'));
    });
    await act(async () => {});
    expect(getByTestId('probe-skip').props.children).toBe(expected);
    jest.restoreAllMocks();
  });
});

describe('LoadingScreen', () => {
  test('renders brand text', async () => {
    const { getByTestId } = await renderWithProviders(<LoadingScreen />);
    expect(getByTestId('loading-brand').props.children).toBe('sift.');
  });

  test('renders loading message', async () => {
    const { getByTestId } = await renderWithProviders(<LoadingScreen />);
    expect(getByTestId('loading-message')).toBeTruthy();
  });

  test('calls loadLibrary on mount', async () => {
    await renderWithProviders(<LoadingScreen />);
    // loadLibrary triggers isAuthorized → loadLibrary chain
    expect(mockProvider.isAuthorized).toHaveBeenCalled();
  });

  test('the bar is a progress bar VoiceOver reads, and each step is announced (#174)', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions').mockImplementation(() => {});
    let api!: ReturnType<typeof useSift>;
    const Probe = () => {
      api = useSift();
      return <LoadingScreen />;
    };
    const { getByTestId } = await renderWithProviders(<Probe />);
    await act(async () => {
      api.dispatch({ type: 'SET_LOAD_PROGRESS', progress: 0.3, message: 'Fetching tracks\u2026' });
    });
    const bar = getByTestId('loading-progress');
    expect(bar.props.accessibilityRole).toBe('progressbar');
    expect(bar.props.accessibilityLabel).toBe('Loading');
    expect(bar.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 30 });
    expect(announce).toHaveBeenCalledWith('Fetching tracks\u2026', { queue: true });
    // Past the end, the bar stops at full.
    await act(async () => {
      api.dispatch({ type: 'SET_LOAD_PROGRESS', progress: 1.4 });
    });
    expect(getByTestId('loading-progress').props.accessibilityValue).toEqual({ min: 0, max: 100, now: 100 });
    // A step with no words says nothing.
    announce.mockClear();
    await act(async () => {
      api.dispatch({ type: 'SET_LOAD_PROGRESS', progress: 0.5, message: '' });
    });
    expect(announce).not.toHaveBeenCalled();
    announce.mockRestore();
  });
});

// Mock Clipboard on react-native's Clipboard export
import { Clipboard } from 'react-native';
const mockClipboardSetString = jest.fn();
Clipboard.setString = mockClipboardSetString;

describe('DoneScreen', () => {
  const tracks = [mockTrackA, mockTrackB, mockTrackC];

  test('renders done title when all tracks sifted', async () => {
    const { getByTestId } = await renderWithProviders(<DoneScreen />, { initialTracks: tracks });
    expect(getByTestId('done-title')).toBeTruthy();
  });

  test('renders summary counts', async () => {
    const { getByTestId } = await renderWithProviders(<DoneScreen />, { initialTracks: tracks });
    expect(getByTestId('summary-count-kept')).toBeTruthy();
    expect(getByTestId('summary-count-removed')).toBeTruthy();
    expect(getByTestId('summary-count-skipped')).toBeTruthy();
  });

  test('renders Start Over button when done', async () => {
    const { getByText } = await renderWithProviders(<DoneScreen />, { initialTracks: tracks });
    expect(getByText('Start Over')).toBeTruthy();
  });

  test('pressing Start Over calls startFresh', async () => {
    const { getByText } = await renderWithProviders(<DoneScreen />, { initialTracks: tracks });
    await act(async () => {
      await fireEvent.press(getByText('Start Over'));
    });
    // Should not throw
  });

  test('Start Over on a library source with no decisions does not ask for confirmation', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { getByText } = await renderWithProviders(<DoneScreen />, { initialTracks: tracks });
    await act(async () => {
      await fireEvent.press(getByText('Start Over'));
    });
    expect(alertSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  test('Start Over on a library source with decisions asks first (#137)', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const DecidedOnce = () => {
      const { decide, state } = useSift();
      const decided = React.useRef(false);
      React.useEffect(() => {
        if (decided.current) return;
        decided.current = true;
        decide('keep');
      }, [decide]);
      return state.kept.length > 0 ? <DoneScreen /> : null;
    };
    const { getByText } = await renderWithProviders(<DecidedOnce />, { initialTracks: tracks });
    await act(async () => {
      await fireEvent.press(getByText('Start Over'));
    });
    expect(alertSpy).toHaveBeenCalledWith(
      'Start Over?',
      expect.stringContaining('You made 1 decision (1 kept, 0 removed, 0 skipped) in your sift of your library.'),
      expect.arrayContaining([
        expect.objectContaining({ text: 'Cancel', style: 'cancel' }),
        expect.objectContaining({ text: 'Discard and Start Over', style: 'destructive' }),
      ]),
    );
    alertSpy.mockRestore();
  });

  function PlaylistDecided({ decisions }: { decisions: ('keep' | 'remove' | 'skip')[] }) {
    const { decide, dispatch } = useSift();
    const ran = React.useRef(false);
    React.useEffect(() => {
      if (ran.current) return;
      ran.current = true;
      dispatch({
        type: 'SET_SOURCE',
        source: { type: 'playlist', playlist: { id: 'p1', name: 'Mix', trackCount: 3 } },
      });
      decisions.forEach((d) => decide(d));
    }, [decide, dispatch, decisions]);
    return <DoneScreen />;
  }

  test('Start Over on a playlist source with decisions asks first; collected removals stay, so nothing about history', async () => {
    (clearHistoryForSource as jest.Mock).mockClear();
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { getByText } = await renderWithProviders(<PlaylistDecided decisions={['keep']} />, { initialTracks: tracks });
    await act(async () => {});
    await act(async () => {
      await fireEvent.press(getByText('Start Over'));
    });
    expect(alertSpy).toHaveBeenCalledWith(
      'Start Over?',
      'You made 1 decision (1 kept, 0 removed, 0 skipped) in your sift of "Mix". '
        + 'Starting over clears this summary and its Restore buttons. '
        + 'You won’t be able to resume it.',
      [
        { text: 'Cancel', style: 'cancel' },
        expect.objectContaining({ text: 'Discard and Start Over', style: 'destructive' }),
      ],
    );
    expect(clearHistoryForSource).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  test('confirmed, a playlist Start Over clears its removal history, leaves "- Sifted" alone, and resets', async () => {
    (clearHistoryForSource as jest.Mock).mockClear();
    (clearSession as jest.Mock).mockClear();
    mockProvider.removeFromPlaylist.mockClear();
    mockProvider.loadPlaylists.mockClear();
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { getByText } = await renderWithProviders(<PlaylistDecided decisions={['keep']} />, { initialTracks: tracks });
    await act(async () => {});
    await act(async () => {
      await fireEvent.press(getByText('Start Over'));
    });
    const buttons = (alertSpy.mock.calls[0][2] ?? []) as { style?: string; onPress?: () => void }[];
    await act(async () => {
      buttons.find((b) => b.style === 'destructive')?.onPress?.();
    });
    expect(clearHistoryForSource).toHaveBeenCalledWith('p1');
    // resetToSetup ran — the saved session is gone.
    expect(clearSession).toHaveBeenCalled();
    expect(mockProvider.loadPlaylists).not.toHaveBeenCalled();
    expect(mockProvider.removeFromPlaylist).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  test('a playlist Start Over with no decisions still asks, saying removed songs stay collected', async () => {
    (clearHistoryForSource as jest.Mock).mockClear();
    (clearSession as jest.Mock).mockClear();
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { getByText } = await renderWithProviders(<PlaylistDecided decisions={[]} />, { initialTracks: tracks });
    await act(async () => {});
    await act(async () => {
      await fireEvent.press(getByText('Start Over'));
    });
    expect(alertSpy).toHaveBeenCalledWith(
      'Start Over?',
      'This starts "Mix" over. Songs you removed stay in "Sift \u2014 Removed".',
      [
        { text: 'Cancel', style: 'cancel' },
        expect.objectContaining({ text: 'Start Over', style: 'destructive' }),
      ],
    );
    expect(clearHistoryForSource).not.toHaveBeenCalled();
    const buttons = (alertSpy.mock.calls[0][2] ?? []) as { style?: string; onPress?: () => void }[];
    await act(async () => {
      buttons.find((b) => b.style === 'destructive')?.onPress?.();
    });
    expect(clearHistoryForSource).toHaveBeenCalledWith('p1');
    expect(clearSession).toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  test('Start Over does not reset when the removal history can\'t be cleared, and can be tried again', async () => {
    (clearSession as jest.Mock).mockClear();
    (clearHistoryForSource as jest.Mock).mockClear().mockResolvedValueOnce(false);
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { getByText, getByTestId } = await renderWithProviders(<PlaylistDecided decisions={['skip']} />, { initialTracks: tracks });
    await act(async () => {});
    await act(async () => {
      await fireEvent.press(getByText('Start Over'));
    });
    const buttons = (alertSpy.mock.calls[0][2] ?? []) as { style?: string; onPress?: () => void }[];
    await act(async () => {
      buttons.find((b) => b.style === 'destructive')?.onPress?.();
    });
    expect(getByTestId('start-over-error').props.children).toBe('Could not clear the removal history. Try again.');
    expect(clearSession).not.toHaveBeenCalled();
    expect(getByTestId('done-start-over').props.accessibilityState?.disabled).toBe(false);
    alertSpy.mockRestore();
  });


  test('shows removed tracks section after removing tracks', async () => {
    const DecideThenDone = () => {
      const { decide, state } = useSift();
      React.useEffect(() => { decide('remove'); }, [decide]);
      if (state.removed.length === 0) return null;
      return <DoneScreen />;
    };
    const { getByText } = await renderWithProviders(<DecideThenDone />, { initialTracks: tracks });
    expect(getByText('Tracks Removed')).toBeTruthy();
    expect(getByText('Copy List')).toBeTruthy();
  });

  test('copy list button copies removed tracks', async () => {
    const DecideThenDone = () => {
      const { decide, state } = useSift();
      React.useEffect(() => { decide('remove'); }, [decide]);
      if (state.removed.length === 0) return null;
      return <DoneScreen />;
    };
    const { getByText } = await renderWithProviders(<DecideThenDone />, { initialTracks: tracks });
    await fireEvent.press(getByText('Copy List'));
    expect(mockClipboardSetString).toHaveBeenCalled();
    expect(getByText('Copied!')).toBeTruthy();
  });

  test('copy toast reset timer is cleared on unmount', async () => {
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
      const { getByText, unmount } = await renderWithProviders(<DecideThenDone />, { initialTracks: tracks });
      // Spy on the timer pair rather than counting pending timers — the
      // press also schedules framework-internal timers, so identify the
      // toast timer by its unique 2000ms delay and assert that exact
      // handle is what unmount clears.
      const setSpy = jest.spyOn(globalThis, 'setTimeout');
      const clearSpy = jest.spyOn(globalThis, 'clearTimeout');
      try {
        await fireEvent.press(getByText('Copy List'));
        const toastCallIndex = setSpy.mock.calls.findIndex((call) => call[1] === 2000);
        expect(toastCallIndex).toBeGreaterThanOrEqual(0);
        const toastHandle = setSpy.mock.results[toastCallIndex].value;
        await unmount();
        expect(clearSpy).toHaveBeenCalledWith(toastHandle);
      } finally {
        setSpy.mockRestore();
        clearSpy.mockRestore();
      }
    } finally {
      jest.useRealTimers();
    }
  });

  test('Start Over is disabled while a restore is in flight', async () => {
    // A restore's history change and Start Over's clearHistoryForSource
    // mutate the same history file; a restore also changes "Sift — Removed"
    // remotely. Letting Start Over run mid-restore would let the queued
    // restore change what the clear just settled.
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    let resolveRestore: (() => void) | undefined;
    mockProvider.restoreRemoved.mockImplementationOnce(
      () => new Promise<number>((res) => { resolveRestore = () => res(1); }),
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
    const { getByTestId } = await renderWithProviders(
      <WithRemoved />,
      { initialTracks: tracks },
    );
    await act(async () => {});

    await act(async () => {
      await fireEvent.press(getByTestId('done-start-over'));
    });
    // Sanity: with nothing in flight the confirmation opens normally.
    expect(alertSpy).toHaveBeenCalledTimes(1);
    alertSpy.mockClear();

    // Kick off a restore; it parks on taking the song out of "Sift — Removed".
    await act(async () => {
      // Not awaited, as in v13: the handler deliberately parks on a promise
      // this test settles later, so awaiting the press here never settles
      // inside this act() and the test times out.
      void fireEvent.press(getByTestId(`restore-track-${mockTrackA.id}`));
    });
    expect(resolveRestore).toBeDefined();

    // While the restore is in flight, Start Over is disabled and pressing
    // it must not even open the destructive confirmation.
    expect(getByTestId('done-start-over').props.accessibilityState?.disabled).toBe(true);
    await act(async () => {
      await fireEvent.press(getByTestId('done-start-over'));
    });
    expect(alertSpy).not.toHaveBeenCalled();

    // Once the restore settles, Start Over unblocks.
    await act(async () => {
      resolveRestore?.();
    });
    expect(getByTestId('done-start-over').props.accessibilityState?.disabled).toBe(false);
    alertSpy.mockRestore();
  });

  test('failed removals are listed and the blanket removed claim is replaced', async () => {
    // Done retries failed removals (#151): keep Track A's failing.
    mockProvider.removeFromLibrary.mockImplementation(async (ids: string[]) => {
      if (ids.includes(mockTrackA.id)) throw new Error('offline');
    });
    const WithRemovalErrors = () => {
      const { decide, dispatch, state } = useSift();
      React.useEffect(() => {
        decide('remove');
        dispatch({ type: 'ADD_REMOVAL_ERROR', error: mockTrackA.name, failedRemovalId: mockTrackA.id });
      }, [decide, dispatch]);
      if (state.removed.length === 0) return null;
      return <DoneScreen />;
    };
    const { getByTestId, getByText, queryByText } = await renderWithProviders(
      <WithRemovalErrors />,
      { initialTracks: tracks },
    );

    // The warning block names the track whose removal failed…
    expect(getByTestId('removal-errors')).toBeTruthy();
    expect(getByTestId('removal-error-0').props.children).toBe(mockTrackA.name);
    // …and the blanket "have been removed" claim gives way to real counts
    // (#141): this one removal failed, so none were moved.
    expect(queryByText('These tracks have been added to "Sift — Removed" in Music.')).toBeNull();
    // The effect above re-fires: three tracks get removed and the error for
    // Track A is recorded more than once. Only Track A's removal failed.
    expect(getByText('2 of 3 have been added to "Sift — Removed" in Music; 1 could not be.')).toBeTruthy();
    // Some landed, so Done says how to finish in Music.
    expect(getByTestId('delete-in-music-hint')).toBeTruthy();
    mockProvider.removeFromLibrary.mockReset().mockResolvedValue(undefined);
  });

});

describe('DoneScreen: Finish, Continue, Review skipped (#142)', () => {
  const tracks = [mockTrackA, mockTrackB, mockTrackC];

  // Applies the given decisions once, then shows Done beside probes of the
  // phase and the track list, as the router would.
  function DoneAfter({ decisions }: { decisions: ('keep' | 'remove' | 'skip')[] }) {
    const { decide, dispatch, state } = useSift();
    const applied = React.useRef(false);
    React.useEffect(() => {
      if (applied.current) return;
      applied.current = true;
      decisions.forEach((d) => decide(d));
      // As the Finish button would; a no-op once the last decision has
      // already ended the sift.
      dispatch({ type: 'FINISH' });
    }, [decide, dispatch, decisions]);
    return (
      <>
        <Text testID="probe-phase">{state.phase}</Text>
        <Text testID="probe-tracks">{state.tracks.map((t) => t.id).join(',')}</Text>
        <DoneScreen />
      </>
    );
  }

  test('a sift ended early says how far it got and offers Continue sifting', async () => {
    const { getByTestId, queryByTestId } = await renderWithProviders(
      <DoneAfter decisions={['keep']} />,
      { initialTracks: tracks },
    );
    await act(async () => {});
    expect(getByTestId('done-title').props.children).toBe('Finished for now.');
    expect(getByTestId('done-subtitle').props.children).toBe('You reviewed 1 of the 3 songs in this sift of your library. 2 not reviewed.');
    // Cards remain: Continue comes first, and Review skipped waits.
    expect(getByTestId('done-continue')).toBeTruthy();
    expect(queryByTestId('done-review-skipped')).toBeNull();
    expect(getByTestId('probe-phase').props.children).toBe('done');

    await act(async () => {
      await fireEvent.press(getByTestId('done-continue'));
    });
    expect(getByTestId('probe-phase').props.children).toBe('sifting');
  });

  test('Change a decision opens the list of this sift\'s decisions, changeable', async () => {
    const { getByTestId, getAllByTestId, queryByTestId } = await renderWithProviders(
      <DoneAfter decisions={['skip', 'skip']} />,
      { initialTracks: tracks },
    );
    await act(async () => {});
    const link = getByTestId('done-change-decisions');
    expect(link.props.accessibilityRole).toBe('button');
    await fireEvent.press(link);
    // The latest first.
    expect(getAllByTestId(/^decision-row-/).map((row) => row.props.testID)).toEqual(['decision-row-2', 'decision-row-1']);
    await act(async () => {
      await fireEvent.press(getByTestId('decision-keep-1'));
    });
    expect(getByTestId('summary-count-kept').props.children).toBe(1);
    await fireEvent.press(getByTestId('decisions-done'));
    expect(queryByTestId('decisions-sheet')).toBeNull();
  });


  test('no decisions, no link', async () => {
    const { queryByTestId } = await renderWithProviders(<DoneAfter decisions={[]} />, { initialTracks: tracks });
    await act(async () => {});
    expect(queryByTestId('done-change-decisions')).toBeNull();
  });

  test('a complete sift says so and offers no Continue', async () => {
    const { getByTestId, queryByTestId } = await renderWithProviders(
      <DoneAfter decisions={['keep', 'keep', 'keep']} />,
      { initialTracks: tracks },
    );
    await act(async () => {});
    expect(getByTestId('done-title').props.children).toBe('All done.');
    expect(getByTestId('done-subtitle').props.children).toBe('You reviewed every song in this sift of your library.');
    expect(queryByTestId('done-continue')).toBeNull();
  });

  test('Review N skipped starts a sift of just the skipped songs', async () => {
    const { getByTestId, getByText } = await renderWithProviders(
      <DoneAfter decisions={['skip', 'keep', 'skip']} />,
      { initialTracks: tracks },
    );
    await act(async () => {});
    expect(getByText('Review 2 skipped')).toBeTruthy();
    await act(async () => {
      await fireEvent.press(getByTestId('done-review-skipped'));
    });
    expect(getByTestId('probe-phase').props.children).toBe('sifting');
    expect(getByTestId('probe-tracks').props.children).toBe(`${mockTrackA.id},${mockTrackC.id}`);
  });

  test('Review skipped asks first when it would clear removals and their Restore buttons', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { getByTestId } = await renderWithProviders(
      <DoneAfter decisions={['remove', 'skip', 'keep']} />,
      { initialTracks: tracks },
    );
    await act(async () => {});
    await act(async () => {
      await fireEvent.press(getByTestId('done-review-skipped'));
    });
    expect(alertSpy).toHaveBeenCalledWith('Review skipped songs?', expect.stringContaining('Restore buttons'), expect.anything());
    // Not started until confirmed.
    expect(getByTestId('probe-phase').props.children).toBe('done');
    alertSpy.mockRestore();
  });

  test('Restore is a labeled button, not a bare "+"', async () => {
    const { getByTestId } = await renderWithProviders(
      <DoneAfter decisions={['remove', 'keep', 'keep']} />,
      { initialTracks: tracks },
    );
    await act(async () => {});
    const restore = getByTestId(`restore-track-${mockTrackA.id}`);
    expect(restore.props.accessibilityLabel).toBe(`Restore ${mockTrackA.name}`);
  });

  // A ledger with nothing an earlier test wrote: let its writes land, then clear.
  async function emptyLedger() {
    await unmarkReviewed('settle', 'nothing');
    await require('@react-native-async-storage/async-storage').default.clear();
  }

  test('a song restored here counts as kept, and later sifts leave it out like one', async () => {
    await emptyLedger();
    const { getByTestId } = await renderWithProviders(
      <DoneAfter decisions={['remove', 'skip', 'skip']} />,
      { initialTracks: tracks },
    );
    await act(async () => {});
    await act(async () => {
      await fireEvent.press(getByTestId(`restore-track-${mockTrackA.id}`));
    });
    await expect(loadReviewedIds('apple-music:library')).resolves.toEqual(new Set([mockTrackA.id]));
  });

  test('Restore does nothing while the decisions list is already restoring that song', async () => {
    // A Remove changed to Skip in the list restores the song first; a Restore
    // pressed meanwhile must not record it as kept over that change.
    await emptyLedger();
    let finish: ((out: number) => void) | undefined;
    mockProvider.restoreRemoved.mockImplementationOnce(() => new Promise<number>((resolve) => { finish = resolve; }));
    let restore: ((track: typeof mockTrackA) => Promise<boolean>) | undefined;
    function Grab() {
      restore = useMusicProvider().restoreTrack;
      return null;
    }
    const { getByTestId } = await renderWithProviders(
      <><DoneAfter decisions={['remove', 'skip', 'skip']} /><Grab /></>,
      { initialTracks: tracks },
    );
    await act(async () => {});
    const callsBefore = mockProvider.restoreRemoved.mock.calls.length;
    let running: Promise<boolean> | undefined;
    await act(async () => {
      running = restore?.(mockTrackA);
    });
    await act(async () => {
      await fireEvent.press(getByTestId(`restore-track-${mockTrackA.id}`));
    });
    await act(async () => {
      finish?.(1);
      await running;
    });
    expect(mockProvider.restoreRemoved.mock.calls.length - callsBefore).toBe(1);
    await expect(loadReviewedIds('apple-music:library')).resolves.toEqual(new Set());
  });

  test('a Restore that fails remembers nothing', async () => {
    await emptyLedger();
    mockProvider.restoreRemoved.mockRejectedValueOnce(new Error('offline'));
    const { getByTestId } = await renderWithProviders(
      <DoneAfter decisions={['remove', 'skip', 'skip']} />,
      { initialTracks: tracks },
    );
    await act(async () => {});
    await act(async () => {
      await fireEvent.press(getByTestId(`restore-track-${mockTrackA.id}`));
    });
    expect(getByTestId(`restore-track-${mockTrackA.id}`)).toBeTruthy();
    await expect(loadReviewedIds('apple-music:library')).resolves.toEqual(new Set());
  });

  test('with nothing removed, Done points at the next thing to do', async () => {
    const { getByTestId } = await renderWithProviders(
      <DoneAfter decisions={['keep']} />,
      { initialTracks: tracks },
    );
    await act(async () => {});
    expect(getByTestId('nothing-removed').props.children).toBe('Nothing removed yet. Continue sifting to keep going.');
  });
});

describe('DoneScreen: Save kept songs as a playlist', () => {
  const AsyncStorage = require('@react-native-async-storage/async-storage').default;
  const { resetKeptSaves } = require('../../src/hooks/useMusicProvider');
  const tracks = [mockTrackA, mockTrackB, mockTrackC];
  const mix = { type: 'playlist' as const, playlist: { id: 'p1', name: 'Mix', trackCount: 3 } };

  /** "Mix" (p1) holds the sift's songs; "- Sifted" playlists hold their own. */
  const holding = (sifted: Record<string, typeof tracks> = {}) => {
    mockProvider.loadPlaylistTracks.mockReset().mockImplementation(async (id: string) => (id === 'p1' ? tracks : sifted[id] ?? []));
  };

  beforeEach(async () => {
    // An empty ledger, and nothing a test before left queued or made.
    await unmarkReviewed('settle', 'nothing');
    await AsyncStorage.clear();
    resetKeptSaves();
    mockProvider.createPlaylist.mockReset().mockResolvedValue('new-playlist');
    mockProvider.addToPlaylist.mockReset().mockResolvedValue(undefined);
    mockProvider.loadPlaylists.mockReset().mockResolvedValue([]);
    holding();
  });

  afterAll(() => {
    mockProvider.loadPlaylistTracks.mockReset().mockResolvedValue([]);
  });

  /** A loaded sift of "Mix" with these decisions, ended at Done. */
  function MixDone({ decisions, source = mix }: { decisions: ('keep' | 'remove' | 'skip')[]; source?: typeof mix | { type: 'library' } }) {
    const { decide, dispatch, state } = useSift();
    const ran = React.useRef(false);
    React.useEffect(() => {
      if (ran.current) return;
      ran.current = true;
      dispatch({ type: 'SET_SOURCE', source });
      dispatch({ type: 'LOAD_TRACKS', tracks });
      decisions.forEach((d) => decide(d));
      dispatch({ type: 'FINISH' });
    }, [decide, dispatch, decisions, source]);
    return (
      <>
        <Text testID="probe-phase">{state.phase}</Text>
        {state.phase === 'done' ? <DoneScreen /> : null}
      </>
    );
  }

  const renderMix = async (decisions: ('keep' | 'remove' | 'skip')[], source?: typeof mix | { type: 'library' }) => {
    const view = await renderWithProviders(<MixDone decisions={decisions} source={source} />);
    await act(async () => {});
    return view;
  };

  /** A write the test lets finish. */
  function gate() {
    let resolve!: () => void;
    const promise = new Promise<undefined>((res) => { resolve = () => res(undefined); });
    return { promise, resolve };
  }

  test('a playlist sift with a keep offers the button; nothing is written until it\'s pressed', async () => {
    const { getByTestId, getByText } = await renderMix(['keep']);
    const button = getByTestId('save-kept-playlist');
    expect(button.props.accessibilityRole).toBe('button');
    expect(getByText('Save kept songs as a playlist')).toBeTruthy();
    expect(button.props.accessibilityState?.disabled).toBe(false);
    expect(mockProvider.createPlaylist).not.toHaveBeenCalled();
    expect(mockProvider.addToPlaylist).not.toHaveBeenCalled();
  });

  test('a library sift has no such button', async () => {
    const { queryByTestId } = await renderMix(['keep'], { type: 'library' });
    expect(queryByTestId('save-kept-playlist')).toBeNull();
  });

  test('nothing kept, now or before: no button', async () => {
    const { queryByTestId } = await renderMix(['skip', 'remove']);
    expect(queryByTestId('save-kept-playlist')).toBeNull();
  });

  test('keeps from an earlier sift of the playlist are enough', async () => {
    await AsyncStorage.setItem('sift_reviewed_ledger', JSON.stringify({ 'apple-music:playlist:p1': ['old'] }));
    const { getByTestId } = await renderMix(['skip']);
    expect(getByTestId('save-kept-playlist')).toBeTruthy();
  });

  test('pressed: Saving… while it runs, then what it saved, and the button steps aside', async () => {
    // A keep from an earlier sift whose song has since left "Mix".
    await AsyncStorage.setItem('sift_reviewed_ledger', JSON.stringify({ 'apple-music:playlist:p1': ['old'] }));
    const add = gate();
    mockProvider.addToPlaylist.mockImplementationOnce(() => add.promise);
    const { getByTestId, getByText, queryByTestId } = await renderMix(['keep']);
    await act(async () => {
      await fireEvent.press(getByTestId('save-kept-playlist'));
    });
    expect(getByText('Saving…')).toBeTruthy();
    expect(getByTestId('save-kept-playlist').props.accessibilityState?.disabled).toBe(true);
    // A second press while it runs saves nothing more.
    await act(async () => {
      await fireEvent.press(getByTestId('save-kept-playlist'));
    });
    expect(mockProvider.createPlaylist).toHaveBeenCalledTimes(1);
    expect(mockProvider.createPlaylist).toHaveBeenCalledWith('Mix - Sifted');
    expect(mockProvider.addToPlaylist).toHaveBeenCalledWith('new-playlist', [mockTrackA.id]);
    await act(async () => {
      add.resolve();
    });
    expect(getByTestId('save-kept-status').props.children).toBe(
      'Saved 1 song to "Mix - Sifted". 1 kept song no longer in "Mix" was left out.',
    );
    expect(queryByTestId('save-kept-playlist')).toBeNull();
  });

  test('all already there: says so', async () => {
    mockProvider.loadPlaylists.mockResolvedValue([{ id: 's1', name: 'Mix - Sifted', trackCount: 1 }]);
    holding({ s1: [mockTrackA] });
    const { getByTestId } = await renderMix(['keep']);
    await act(async () => {
      await fireEvent.press(getByTestId('save-kept-playlist'));
    });
    expect(getByTestId('save-kept-status').props.children).toBe('All kept songs are already in "Mix - Sifted".');
    expect(mockProvider.addToPlaylist).not.toHaveBeenCalled();
    expect(mockProvider.createPlaylist).not.toHaveBeenCalled();
  });

  test('a failed save says why, and the button becomes Retry, which saves', async () => {
    mockProvider.addToPlaylist.mockRejectedValueOnce(new Error('Simulated add failure'));
    const { getByTestId, getByText, queryByTestId } = await renderMix(['keep']);
    await act(async () => {
      await fireEvent.press(getByTestId('save-kept-playlist'));
    });
    expect(getByTestId('save-kept-status').props.children).toBe('Couldn’t save to "Mix - Sifted": Simulated add failure');
    expect(getByText('Retry')).toBeTruthy();
    expect(getByTestId('save-kept-playlist').props.accessibilityState?.disabled).toBe(false);
    await act(async () => {
      await fireEvent.press(getByTestId('save-kept-playlist'));
    });
    // The playlist the first save made is the one Retry adds to.
    expect(mockProvider.createPlaylist).toHaveBeenCalledTimes(1);
    expect(mockProvider.addToPlaylist).toHaveBeenCalledTimes(2);
    expect(getByTestId('save-kept-status').props.children).toBe('Saved 1 song to "Mix - Sifted".');
    expect(queryByTestId('save-kept-playlist')).toBeNull();
  });

  test('songs Music refused show as a failure with Retry, not as "couldn\'t be added"', async () => {
    const { AddShortfallError } = require('../../src/utils/musicKit');
    mockProvider.addToPlaylist.mockRejectedValueOnce(new AddShortfallError({ added: 0, unresolved: 0, failed: 1 }));
    const { getByTestId, getByText } = await renderMix(['keep']);
    await act(async () => {
      await fireEvent.press(getByTestId('save-kept-playlist'));
    });
    expect(getByTestId('save-kept-status').props.children).toBe(
      'Couldn\u2019t save to "Mix - Sifted": 0 songs added; 1 song failed and can be tried again.',
    );
    expect(getByText('Retry')).toBeTruthy();
    await act(async () => {
      await fireEvent.press(getByTestId('save-kept-playlist'));
    });
    expect(getByTestId('save-kept-status').props.children).toBe('Saved 1 song to "Mix - Sifted".');
  });

  test('songs with nothing to add are counted, and the save still counts as done', async () => {
    const { AddShortfallError } = require('../../src/utils/musicKit');
    mockProvider.addToPlaylist.mockRejectedValueOnce(new AddShortfallError({ added: 0, unresolved: 1, failed: 0 }));
    const { getByTestId, queryByTestId } = await renderMix(['keep']);
    await act(async () => {
      await fireEvent.press(getByTestId('save-kept-playlist'));
    });
    expect(getByTestId('save-kept-status').props.children).toBe(
      'Nothing new could be saved to "Mix - Sifted". 1 song couldn\u2019t be added.',
    );
    expect(queryByTestId('save-kept-playlist')).toBeNull();
  });

  test('a failure that isn\'t an Error still reads', async () => {
    mockProvider.createPlaylist.mockRejectedValueOnce('nope');
    const { getByTestId } = await renderMix(['keep']);
    await act(async () => {
      await fireEvent.press(getByTestId('save-kept-playlist'));
    });
    expect(getByTestId('save-kept-status').props.children).toBe('Couldn’t save to "Mix - Sifted": Something went wrong.');
  });

  test('after a save, a decision changed to Keep brings the button back', async () => {
    const { getByTestId, queryByTestId } = await renderMix(['keep', 'skip']);
    await act(async () => {
      await fireEvent.press(getByTestId('save-kept-playlist'));
    });
    expect(queryByTestId('save-kept-playlist')).toBeNull();
    await act(async () => {
      await fireEvent.press(getByTestId('done-change-decisions'));
    });
    await act(async () => {
      await fireEvent.press(getByTestId(`decision-keep-${mockTrackB.id}`));
    });
    expect(getByTestId('save-kept-playlist')).toBeTruthy();
  });

  test('decisions can\'t change, nor the sift go on, while a save runs; they can again after', async () => {
    const add = gate();
    mockProvider.addToPlaylist.mockImplementationOnce(() => add.promise);
    const { getByTestId } = await renderMix(['keep']);
    await act(async () => {
      await fireEvent.press(getByTestId('save-kept-playlist'));
    });
    expect(getByTestId('done-change-decisions').props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    expect(getByTestId('done-continue').props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    await act(async () => {
      await fireEvent.press(getByTestId('done-continue'));
    });
    expect(getByTestId('probe-phase').props.children).toBe('done');
    await act(async () => {
      add.resolve();
    });
    expect(getByTestId('done-change-decisions').props.accessibilityState).toEqual(expect.objectContaining({ disabled: false }));
    expect(getByTestId('done-continue').props.accessibilityState).toEqual(expect.objectContaining({ disabled: false }));
  });

  test('leaving Done mid-save is fine: the save finishes on its own', async () => {
    const add = gate();
    mockProvider.addToPlaylist.mockImplementationOnce(() => add.promise);
    const { getByTestId, unmount } = await renderMix(['keep']);
    await act(async () => {
      await fireEvent.press(getByTestId('save-kept-playlist'));
    });
    await unmount();
    await act(async () => {
      add.resolve();
    });
    expect(mockProvider.addToPlaylist).toHaveBeenCalledTimes(1);
  });
});


describe('PlaylistPicker', () => {
  const mockPlaylists = [
    { id: 'p1', name: 'Chill Vibes', trackCount: 12 },
    { id: 'p2', name: 'Workout Mix', trackCount: 25 },
  ];

  test('renders loading state', async () => {
    const { getByTestId } = await renderWithProviders(
      <PlaylistPicker playlists={[]} loading={true} onSelect={jest.fn()} onCancel={jest.fn()} />,
    );
    expect(getByTestId('playlist-picker-loading')).toBeTruthy();
  });

  test('renders empty state when no playlists', async () => {
    const { getByTestId } = await renderWithProviders(
      <PlaylistPicker playlists={[]} loading={false} onSelect={jest.fn()} onCancel={jest.fn()} />,
    );
    expect(getByTestId('playlist-picker-empty')).toBeTruthy();
  });

  test('renders playlist rows', async () => {
    const { getByTestId, getByText } = await renderWithProviders(
      <PlaylistPicker playlists={mockPlaylists} loading={false} onSelect={jest.fn()} onCancel={jest.fn()} />,
    );
    expect(getByTestId('playlist-picker-list')).toBeTruthy();
    expect(getByText('Chill Vibes')).toBeTruthy();
    expect(getByText('12 tracks')).toBeTruthy();
    expect(getByText('Workout Mix')).toBeTruthy();
    expect(getByText('25 tracks')).toBeTruthy();
  });

  test('tapping a row calls onSelect with the playlist', async () => {
    const onSelect = jest.fn();
    const { getByTestId } = await renderWithProviders(
      <PlaylistPicker playlists={mockPlaylists} loading={false} onSelect={onSelect} onCancel={jest.fn()} />,
    );
    await fireEvent.press(getByTestId('playlist-row-p1'));
    expect(onSelect).toHaveBeenCalledWith(mockPlaylists[0]);
  });

  test('tapping cancel calls onCancel', async () => {
    const onCancel = jest.fn();
    const { getByTestId } = await renderWithProviders(
      <PlaylistPicker playlists={mockPlaylists} loading={false} onSelect={jest.fn()} onCancel={onCancel} />,
    );
    await fireEvent.press(getByTestId('playlist-picker-cancel'));
    expect(onCancel).toHaveBeenCalled();
  });

  test('renders singular "track" for count of 1', async () => {
    const single = [{ id: 'p1', name: 'Solo', trackCount: 1 }];
    const { getByText } = await renderWithProviders(
      <PlaylistPicker playlists={single} loading={false} onSelect={jest.fn()} onCancel={jest.fn()} />,
    );
    expect(getByText('1 track')).toBeTruthy();
  });
});

describe('SettingsScreen', () => {
  test('renders Settings header', async () => {
    const { getByText } = await renderWithProviders(<SettingsScreen />);
    expect(getByText('Settings')).toBeTruthy();
  });

  test('renders version text', async () => {
    const { getByText } = await renderWithProviders(<SettingsScreen />);
    expect(getByText('Version 1.0.0')).toBeTruthy();
  });

  test('once access is refused, says how to turn it on and opens Settings', async () => {
    const { Linking } = require('react-native');
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    mockProvider.isAuthorized.mockResolvedValueOnce(false);
    mockProvider.requestAuthorization.mockResolvedValueOnce(false);
    const { getByTestId, queryByTestId } = await renderWithProviders(<SettingsScreen />);
    expect(queryByTestId('open-settings-button')).toBeNull();
    await act(async () => {
      await fireEvent.press(getByTestId('check-connection-button'));
    });
    expect(getByTestId('connection-help').props.children).toBe(
      'Turn on Media & Apple Music for Sift in Settings, then check again.',
    );
    const button = getByTestId('open-settings-button');
    expect(button.props.accessibilityRole).toBe('button');
    await fireEvent.press(button);
    expect(openSettings).toHaveBeenCalledTimes(1);
    openSettings.mockRestore();
  });

  test('renders connection status', async () => {
    const { getByTestId } = await renderWithProviders(<SettingsScreen />);
    expect(getByTestId('connection-status-label')).toBeTruthy();
    expect(getByTestId('connection-status-indicator')).toBeTruthy();
  });

  test('check connection reports Connected without prompting when already authorized', async () => {
    mockProvider.isAuthorized.mockResolvedValueOnce(true);
    mockProvider.requestAuthorization.mockClear();
    const { getByTestId } = await renderWithProviders(<SettingsScreen />);

    await act(async () => {
      await fireEvent.press(getByTestId('check-connection-button'));
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
    const { getByTestId } = await renderWithProviders(<SettingsScreen />);

    await act(async () => {
      await fireEvent.press(getByTestId('check-connection-button'));
    });

    await waitFor(() => {
      expect(getByTestId('connection-status-label').props.children).toBe('Connected');
    });
    expect(mockProvider.requestAuthorization).toHaveBeenCalled();
  });

  test('check connection prompts and reports Not connected when authorization is denied', async () => {
    mockProvider.isAuthorized.mockResolvedValueOnce(false);
    mockProvider.requestAuthorization.mockResolvedValueOnce(false);
    const { getByTestId } = await renderWithProviders(<SettingsScreen />);

    await act(async () => {
      await fireEvent.press(getByTestId('check-connection-button'));
    });

    await waitFor(() => {
      expect(getByTestId('connection-status-label').props.children).toBe('Not connected');
    });
  });

  test('renders provider display name', async () => {
    const { getByText } = await renderWithProviders(<SettingsScreen />);
    expect(getByText('Apple Music')).toBeTruthy();
  });

  test('"Start at chorus" switch starts off and turns the setting on and off', async () => {
    function Probe() {
      const { state } = useSift();
      return <Text testID="start-at-chorus-value">{String(state.startAtChorus)}</Text>;
    }
    const { getByTestId, getByText } = await renderWithProviders(
      <>
        <SettingsScreen />
        <Probe />
      </>,
    );
    expect(getByText('Start at chorus')).toBeTruthy();
    const toggle = getByTestId('start-at-chorus-switch');
    expect(toggle.props.value).toBe(false);

    await fireEvent(toggle, 'valueChange', true);
    expect(getByTestId('start-at-chorus-value').props.children).toBe('true');
    expect(getByTestId('start-at-chorus-switch').props.value).toBe(true);

    await fireEvent(getByTestId('start-at-chorus-switch'), 'valueChange', false);
    expect(getByTestId('start-at-chorus-value').props.children).toBe('false');
  });

});

describe('VoiceOver scan (#146)', () => {
  test('the wordmark reads as the app\'s name, a heading, not "sift period"', async () => {
    // Xcode's accessibility audit flagged "sift." as a label that isn't
    // human-readable.
    const { getByTestId } = await renderWithProviders(<SetupScreen />);
    const brand = getByTestId('setup-brand');
    expect(brand.props.accessibilityLabel).toBe('Sift');
    expect(brand.props.accessibilityRole).toBe('header');
    expect(brand.props.children).toBe('sift.');
  });

  test('Setup, with a playlist picked and the resume block showing', async () => {
    const Backed = () => {
      const { dispatch, decide } = useSift();
      const ran = React.useRef(false);
      React.useEffect(() => {
        if (ran.current) return;
        ran.current = true;
        dispatch({ type: 'LOAD_TRACKS', tracks: [mockTrackA, mockTrackB] });
        decide('keep');
        dispatch({ type: 'SET_PHASE', phase: 'setup' });
      }, [dispatch, decide]);
      return <SetupScreen />;
    };
    const { toJSON } = await renderWithProviders(<Backed />);
    await act(async () => {});
    expect(a11yViolations(toJSON())).toEqual([]);
  });

  test('Setup, with a playlist picked: its Change button (#174)', async () => {
    const Picked = () => {
      const { dispatch } = useSift();
      React.useEffect(() => {
        dispatch({ type: 'SET_SOURCE', source: { type: 'playlist', playlist: { id: 'p1', name: 'Road Trip', trackCount: 3 } } });
      }, [dispatch]);
      return <SetupScreen />;
    };
    const { toJSON, getByTestId } = await renderWithProviders(<Picked />);
    await act(async () => {});
    expect(getByTestId('setup-change-playlist').props.accessibilityRole).toBe('button');
    expect(a11yViolations(toJSON())).toEqual([]);
  });

  test('Loading', async () => {
    const { toJSON } = await renderWithProviders(<LoadingScreen />);
    expect(a11yViolations(toJSON())).toEqual([]);
  });

  test('Done, with a removed song to restore and cards left', async () => {
    const WithRemoved = () => {
      const { decide, dispatch } = useSift();
      const ran = React.useRef(false);
      React.useEffect(() => {
        if (ran.current) return;
        ran.current = true;
        decide('remove');
        decide('skip');
        dispatch({ type: 'FINISH' });
      }, [decide, dispatch]);
      return <DoneScreen />;
    };
    const { toJSON } = await renderWithProviders(<WithRemoved />, { initialTracks: [mockTrackA, mockTrackB, mockTrackC] });
    await act(async () => {});
    expect(a11yViolations(toJSON())).toEqual([]);
  });

  test('Done of a playlist sift, with its kept songs saved', async () => {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    function Kept() {
      const { decide, dispatch, state } = useSift();
      const ran = React.useRef(false);
      React.useEffect(() => {
        if (ran.current) return;
        ran.current = true;
        dispatch({ type: 'SET_SOURCE', source: { type: 'playlist', playlist: { id: 'p1', name: 'Mix', trackCount: 3 } } });
        decide('keep');
        dispatch({ type: 'FINISH' });
      }, [decide, dispatch]);
      return state.phase === 'done' ? <DoneScreen /> : null;
    }
    mockProvider.loadPlaylists.mockResolvedValue([]);
    const { getByTestId, toJSON } = await renderWithProviders(<Kept />, { initialTracks: [mockTrackA, mockTrackB, mockTrackC] });
    await act(async () => {});
    expect(a11yViolations(toJSON())).toEqual([]);
    await act(async () => {
      await fireEvent.press(getByTestId('save-kept-playlist'));
    });
    expect(getByTestId('save-kept-status')).toBeTruthy();
    expect(a11yViolations(toJSON())).toEqual([]);
    await AsyncStorage.clear();
  });

  test('the source segments say which is selected', async () => {
    const { getByTestId } = await renderWithProviders(<SetupScreen />);
    await act(async () => {});
    expect(getByTestId('source-library').props.accessibilityState).toMatchObject({ selected: true });
    expect(getByTestId('source-playlist').props.accessibilityState).toMatchObject({ selected: false });
  });

  test('Settings', async () => {
    const { toJSON } = await renderWithProviders(<SettingsScreen />);
    await act(async () => {});
    expect(a11yViolations(toJSON())).toEqual([]);
  });

  test('the playlist picker', async () => {
    const { toJSON } = await renderWithProviders(
      <PlaylistPicker playlists={[{ id: 'p1', name: 'Chill Vibes', trackCount: 12 }]} loading={false} onSelect={jest.fn()} onCancel={jest.fn()} />,
    );
    expect(a11yViolations(toJSON())).toEqual([]);
  });
});
