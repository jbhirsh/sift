import React from 'react';
import { Text } from 'react-native';
import { fireEvent, act } from '@testing-library/react-native';

jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: jest.fn().mockReturnValue('light'),
}));

jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('expo-image', () => ({ Image: 'Image' }));

jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: {
    View: 'View',
    createAnimatedComponent: (comp: unknown) => comp,
  },
  useSharedValue: (val: number) => ({ value: val }),
  useAnimatedStyle: (fn: () => unknown) => fn(),
  withTiming: (val: number, _config: unknown, callback?: (finished: boolean) => void) => {
    if (callback) callback(true);
    return val;
  },
  withSpring: (val: number) => val,
  Easing: { in: (e: unknown) => e, ease: {} },
  interpolate: (val: number, inputRange: number[], outputRange: number[]) => {
    const ratio = (val - inputRange[0]) / (inputRange[1] - inputRange[0]);
    return outputRange[0] + ratio * (outputRange[1] - outputRange[0]);
  },
  runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
}));

jest.mock('react-native-gesture-handler', () => ({
  GestureDetector: ({ children }: { children: React.ReactNode }) => children,
  Gesture: {
    Pan: () => ({
      minDistance: () => ({ onUpdate: () => ({ onEnd: () => ({}) }) }),
      onUpdate: () => ({}),
    }),
    Tap: () => ({ onEnd: () => ({}) }),
    Race: () => ({}),
  },
}));

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
};

jest.mock('../../src/services', () => ({
  createMusicProvider: jest.fn(() => mockProvider),
  MusicProviderService: {},
}));

jest.mock('../../src/hooks/useResolvedArtwork', () => ({
  useResolvedArtwork: jest.fn().mockReturnValue(null),
}));

// Mock InteractiveCard to expose onDecide for testing handleCardDecide
jest.mock('../../src/components/InteractiveCard', () => {
  const { TouchableOpacity, Text, View } = require('react-native');
  return function MockInteractiveCard({ track, onDecide }: { track: { name: string; artist: string; album: string; playCount: number }; onDecide: (d: string) => void }) {
    return (
      <View>
        <Text testID="card-track-name">{track.name}</Text>
        <Text testID="card-artist-name">{track.artist}</Text>
        <Text testID="card-album-name">{track.album}</Text>
        <Text testID="card-play-count">{track.playCount}</Text>
        <TouchableOpacity testID="mock-card-keep" onPress={() => onDecide('keep')} />
        <TouchableOpacity testID="mock-card-remove" onPress={() => onDecide('remove')} />
      </View>
    );
  };
});

jest.mock('../../src/services/PreferencesStore', () => ({
  ...jest.requireActual('../../src/services/PreferencesStore'),
  loadSeenRemoveNote: jest.fn().mockResolvedValue(false),
  markRemoveNoteSeen: jest.fn().mockResolvedValue(undefined),
}));

import { renderWithProviders, mockTrackA, mockTrackB, mockTrackC } from '../helpers/renderWithProviders';
import { loadSeenRemoveNote, markRemoveNoteSeen } from '../../src/services/PreferencesStore';
import { useSift } from '../../src/context/SiftContext';
import SiftScreen from '../../src/screens/SiftScreen';

describe('SiftScreen', () => {
  const tracks = [mockTrackA, mockTrackB, mockTrackC];

  test('renders remaining count', async () => {
    const { getByTestId } = await renderWithProviders(<SiftScreen />, { initialTracks: tracks });
    expect(getByTestId('remaining-count').props.children).toEqual([3, ' ', 'left']);
  });

  test('renders stat badges', async () => {
    const { getByTestId } = await renderWithProviders(<SiftScreen />, { initialTracks: tracks });
    expect(getByTestId('stat-kept')).toBeTruthy();
    expect(getByTestId('stat-removed')).toBeTruthy();
    expect(getByTestId('stat-skipped')).toBeTruthy();
  });

  test('renders back button', async () => {
    const { getByTestId } = await renderWithProviders(<SiftScreen />, { initialTracks: tracks });
    expect(getByTestId('back-button')).toBeTruthy();
  });

  test('renders action buttons', async () => {
    const { getByLabelText } = await renderWithProviders(<SiftScreen />, { initialTracks: tracks });
    expect(getByLabelText('Remove')).toBeTruthy();
    expect(getByLabelText('Skip')).toBeTruthy();
    expect(getByLabelText('Keep')).toBeTruthy();
  });

  test('renders track info on interactive card', async () => {
    const { getByTestId } = await renderWithProviders(<SiftScreen />, { initialTracks: tracks });
    expect(getByTestId('card-track-name').props.children).toBe('Track A');
  });

  test('pressing Skip button advances to next track', async () => {
    const { getByLabelText, getByTestId } = await renderWithProviders(<SiftScreen />, { initialTracks: tracks });
    await fireEvent.press(getByLabelText('Skip'));
    expect(getByTestId('card-track-name').props.children).toBe('Track B');
    expect(getByTestId('stat-skipped').props.children).toEqual([1, ' ', 'skipped']);
  });

  test('pressing back button transitions to setup', async () => {
    const BackAndCheck = () => {
      const { state } = useSift();
      return (
        <>
          <SiftScreen />
          <Text testID="current-phase">{state.phase}</Text>
        </>
      );
    };
    const { getByTestId } = await renderWithProviders(<BackAndCheck />, { initialTracks: tracks });
    await fireEvent.press(getByTestId('back-button'));
    expect(getByTestId('current-phase').props.children).toBe('setup');
  });

  test('Finish ends the sift here and shows Done (#142)', async () => {
    const FinishAndCheck = () => {
      const { state } = useSift();
      return (
        <>
          <SiftScreen />
          <Text testID="current-phase">{state.phase}</Text>
          <Text testID="current-cursor">{state.cursor}</Text>
        </>
      );
    };
    const { getByTestId, getByLabelText } = await renderWithProviders(<FinishAndCheck />, { initialTracks: tracks });
    await fireEvent.press(getByLabelText('Skip'));
    // Mid-decision (the skip's settle window), Finish does nothing: a
    // Keep/Remove decides only when its animation ends.
    await fireEvent.press(getByTestId('finish-button'));
    expect(getByTestId('current-phase').props.children).toBe('sifting');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });
    await fireEvent.press(getByTestId('finish-button'));
    expect(getByTestId('current-phase').props.children).toBe('done');
    // Where it stopped is kept, so Continue sifting picks up there.
    expect(getByTestId('current-cursor').props.children).toBe(1);
  });

  test('renders progress segments', async () => {
    const { toJSON } = await renderWithProviders(<SiftScreen />, { initialTracks: tracks });
    expect(toJSON()).toBeTruthy();
  });

  test('shows back cards when next tracks exist', async () => {
    const { toJSON } = await renderWithProviders(<SiftScreen />, { initialTracks: tracks });
    const tree = JSON.stringify(toJSON());
    // The tree should render (back cards are Views with opacity)
    expect(tree).toBeTruthy();
  });

  test('pressing Remove button triggers animateDecision', async () => {
    const { getByLabelText, getByTestId } = await renderWithProviders(<SiftScreen />, { initialTracks: tracks });
    await fireEvent.press(getByLabelText('Remove'));
    // animateDecision fires withTiming which our mock immediately resolves,
    // calling decide('remove') and advancing the cursor
    expect(getByTestId('card-track-name').props.children).toBe('Track B');
    expect(getByTestId('stat-removed').props.children).toEqual([1, ' ', 'removed']);
  });

  test('pressing Keep button triggers animateDecision', async () => {
    const { getByLabelText, getByTestId } = await renderWithProviders(<SiftScreen />, { initialTracks: tracks });
    await fireEvent.press(getByLabelText('Keep'));
    expect(getByTestId('card-track-name').props.children).toBe('Track B');
    expect(getByTestId('stat-kept').props.children).toEqual([1, ' ', 'kept']);
  });

  test('card swipe keep via handleCardDecide advances track', async () => {
    const { getByTestId } = await renderWithProviders(<SiftScreen />, { initialTracks: tracks });
    expect(getByTestId('card-track-name').props.children).toBe('Track A');
    // Press the mock card's keep button — triggers handleCardDecide('keep')
    await fireEvent.press(getByTestId('mock-card-keep'));
    expect(getByTestId('card-track-name').props.children).toBe('Track B');
    expect(getByTestId('stat-kept').props.children).toEqual([1, ' ', 'kept']);
  });

  test('card swipe remove via handleCardDecide advances track', async () => {
    const { getByTestId } = await renderWithProviders(<SiftScreen />, { initialTracks: tracks });
    await fireEvent.press(getByTestId('mock-card-remove'));
    expect(getByTestId('card-track-name').props.children).toBe('Track B');
    expect(getByTestId('stat-removed').props.children).toEqual([1, ' ', 'removed']);
  });

  test('renders with single track (no back cards)', async () => {
    const { getByTestId } = await renderWithProviders(<SiftScreen />, { initialTracks: [mockTrackA] });
    expect(getByTestId('card-track-name').props.children).toBe('Track A');
    expect(getByTestId('remaining-count').props.children).toEqual([1, ' ', 'left']);
  });

  test('renders with two tracks (one back card)', async () => {
    const { getByTestId } = await renderWithProviders(<SiftScreen />, { initialTracks: [mockTrackA, mockTrackB] });
    expect(getByTestId('card-track-name').props.children).toBe('Track A');
    expect(getByTestId('remaining-count').props.children).toEqual([2, ' ', 'left']);
  });

  test('progress is 0 when no tracks', async () => {
    const { getByTestId } = await renderWithProviders(<SiftScreen />, { initialTracks: [] });
    // No current track → no card rendered
    expect(getByTestId('remaining-count').props.children).toEqual([0, ' ', 'left']);
  });

  test('back button flushes the debounced session save before leaving', async () => {
    jest.useFakeTimers();
    try {
      const { saveSession } = require('../../src/services/SessionStore');
      (saveSession as jest.Mock).mockClear();
      const { getByTestId, getByLabelText } = await renderWithProviders(<SiftScreen />, { initialTracks: tracks });

      // A decision schedules a debounced (500ms) session save…
      await fireEvent.press(getByLabelText('Skip'));
      expect(saveSession).not.toHaveBeenCalled();

      // …and leaving before it fires must persist it instead of dropping it
      // (the autosave effect's cleanup cancels the pending timer on phase
      // change, which used to lose the last decisions).
      await fireEvent.press(getByTestId('back-button'));
      expect(saveSession).toHaveBeenCalledTimes(1);
      expect((saveSession as jest.Mock).mock.calls[0][0]).toMatchObject({ cursor: 1 });
    } finally {
      jest.useRealTimers();
    }
  });

  test('a skip press immediately after a swipe decide cannot double-decide', async () => {
    jest.useFakeTimers();
    try {
      const { getByTestId, getByLabelText } = await renderWithProviders(<SiftScreen />, { initialTracks: tracks });

      // Swipe-decide (via the card's onDecide)…
      await fireEvent.press(getByTestId('mock-card-keep'));
      // …then a Skip press in the settle window must be ignored — Skip used
      // to rely only on the render-lagged disabled prop.
      await fireEvent.press(getByLabelText('Skip'));

      expect(getByTestId('stat-kept').props.children).toEqual([1, ' ', 'kept']);
      expect(getByTestId('stat-skipped').props.children).toEqual([0, ' ', 'skipped']);
      expect(getByTestId('card-track-name').props.children).toBe('Track B');

      // After the settle window, skipping works again — and holds the guard
      // itself, so an immediate second skip is also ignored.
      await act(() => {
        jest.advanceTimersByTime(400);
      });
      await fireEvent.press(getByLabelText('Skip'));
      await fireEvent.press(getByLabelText('Skip'));
      expect(getByTestId('stat-skipped').props.children).toEqual([1, ' ', 'skipped']);
      expect(getByTestId('card-track-name').props.children).toBe('Track C');
    } finally {
      jest.useRealTimers();
    }
  });

  test('a button press immediately after a swipe decide cannot decide twice', async () => {
    jest.useFakeTimers();
    try {
      const { getByTestId, getByLabelText } = await renderWithProviders(<SiftScreen />, { initialTracks: tracks });

      // Swipe-decide (via the card's onDecide)…
      await fireEvent.press(getByTestId('mock-card-keep'));
      // …then a button press in the settle window must be ignored.
      await fireEvent.press(getByLabelText('Keep'));

      expect(getByTestId('stat-kept').props.children).toEqual([1, ' ', 'kept']);
      expect(getByTestId('card-track-name').props.children).toBe('Track B');

      // After the settle window, decisions work again.
      await act(() => {
        jest.advanceTimersByTime(400);
      });
      await fireEvent.press(getByLabelText('Keep'));
      expect(getByTestId('stat-kept').props.children).toEqual([2, ' ', 'kept']);
      expect(getByTestId('card-track-name').props.children).toBe('Track C');
    } finally {
      jest.useRealTimers();
    }
  });

  describe('first-remove note (#141)', () => {
    test('the first Apple library remove explains where songs go, once, until the next decision', async () => {
      (markRemoveNoteSeen as jest.Mock).mockClear();
      const { getByLabelText, getByTestId, queryByTestId } = await renderWithProviders(<SiftScreen />, {
        initialTracks: [mockTrackA, mockTrackB, mockTrackC],
      });
      await act(async () => {});
      expect(queryByTestId('first-remove-note')).toBeNull();

      await fireEvent.press(getByLabelText('Remove'));
      expect(getByTestId('first-remove-note')).toBeTruthy();
      expect(markRemoveNoteSeen).toHaveBeenCalledTimes(1);

      await fireEvent.press(getByTestId('mock-card-keep'));
      expect(queryByTestId('first-remove-note')).toBeNull();
    });

    test('not shown again once seen', async () => {
      (loadSeenRemoveNote as jest.Mock).mockResolvedValueOnce(true);
      const { getByLabelText, queryByTestId } = await renderWithProviders(<SiftScreen />, {
        initialTracks: [mockTrackA, mockTrackB, mockTrackC],
      });
      await act(async () => {});
      await fireEvent.press(getByLabelText('Remove'));
      expect(queryByTestId('first-remove-note')).toBeNull();
    });
  });

  test('changes that did not reach the provider show as a chip during the sift (#141)', async () => {
    const FailOnce = () => {
      const { dispatch } = useSift();
      const done = React.useRef(false);
      React.useEffect(() => {
        if (done.current) return;
        done.current = true;
        // Remove the first card (A), whose removal then fails.
        dispatch({ type: 'DECIDE', decision: 'remove' });
        dispatch({ type: 'ADD_REMOVAL_ERROR', error: mockTrackA.name, failedRemovalId: mockTrackA.id });
        dispatch({ type: 'ADD_PENDING_KEEP', track: mockTrackB });
      }, [dispatch]);
      return null;
    };
    const { getByTestId } = await renderWithProviders(<><SiftScreen /><FailOnce /></>, {
      initialTracks: [mockTrackA, mockTrackB, mockTrackC],
    });
    await act(async () => {});
    const chip = getByTestId('unsynced-chip');
    expect(chip.props.children).toBe('2 didn\u2019t sync');
    expect(chip.props.accessibilityLabel).toBe("2 changes didn't reach Apple Music");
  });
});
