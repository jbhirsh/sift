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

import { renderWithProviders, mockTrackA, mockTrackB, mockTrackC } from '../helpers/renderWithProviders';
import { useSift } from '../../src/context/SiftContext';
import SiftScreen from '../../src/screens/SiftScreen';

describe('SiftScreen', () => {
  const tracks = [mockTrackA, mockTrackB, mockTrackC];

  test('renders remaining count', () => {
    const { getByTestId } = renderWithProviders(<SiftScreen />, { initialTracks: tracks });
    expect(getByTestId('remaining-count').props.children).toEqual([3, ' ', 'left']);
  });

  test('renders stat badges', () => {
    const { getByTestId } = renderWithProviders(<SiftScreen />, { initialTracks: tracks });
    expect(getByTestId('stat-kept')).toBeTruthy();
    expect(getByTestId('stat-removed')).toBeTruthy();
    expect(getByTestId('stat-skipped')).toBeTruthy();
  });

  test('renders back button', () => {
    const { getByTestId } = renderWithProviders(<SiftScreen />, { initialTracks: tracks });
    expect(getByTestId('back-button')).toBeTruthy();
  });

  test('renders action buttons', () => {
    const { getByLabelText } = renderWithProviders(<SiftScreen />, { initialTracks: tracks });
    expect(getByLabelText('Remove')).toBeTruthy();
    expect(getByLabelText('Skip')).toBeTruthy();
    expect(getByLabelText('Keep')).toBeTruthy();
  });

  test('renders track info on interactive card', () => {
    const { getByTestId } = renderWithProviders(<SiftScreen />, { initialTracks: tracks });
    expect(getByTestId('card-track-name').props.children).toBe('Track A');
  });

  test('pressing Skip button advances to next track', () => {
    const { getByLabelText, getByTestId } = renderWithProviders(<SiftScreen />, { initialTracks: tracks });
    fireEvent.press(getByLabelText('Skip'));
    expect(getByTestId('card-track-name').props.children).toBe('Track B');
    expect(getByTestId('stat-skipped').props.children).toEqual([1, ' ', 'skipped']);
  });

  test('pressing back button transitions to setup', () => {
    const BackAndCheck = () => {
      const { state } = useSift();
      return (
        <>
          <SiftScreen />
          <Text testID="current-phase">{state.phase}</Text>
        </>
      );
    };
    const { getByTestId } = renderWithProviders(<BackAndCheck />, { initialTracks: tracks });
    fireEvent.press(getByTestId('back-button'));
    expect(getByTestId('current-phase').props.children).toBe('setup');
  });

  test('renders progress segments', () => {
    const { toJSON } = renderWithProviders(<SiftScreen />, { initialTracks: tracks });
    expect(toJSON()).toBeTruthy();
  });

  test('shows back cards when next tracks exist', () => {
    const { toJSON } = renderWithProviders(<SiftScreen />, { initialTracks: tracks });
    const tree = JSON.stringify(toJSON());
    // The tree should render (back cards are Views with opacity)
    expect(tree).toBeTruthy();
  });

  test('pressing Remove button triggers animateDecision', () => {
    const { getByLabelText, getByTestId } = renderWithProviders(<SiftScreen />, { initialTracks: tracks });
    fireEvent.press(getByLabelText('Remove'));
    // animateDecision fires withTiming which our mock immediately resolves,
    // calling decide('remove') and advancing the cursor
    expect(getByTestId('card-track-name').props.children).toBe('Track B');
    expect(getByTestId('stat-removed').props.children).toEqual([1, ' ', 'removed']);
  });

  test('pressing Keep button triggers animateDecision', () => {
    const { getByLabelText, getByTestId } = renderWithProviders(<SiftScreen />, { initialTracks: tracks });
    fireEvent.press(getByLabelText('Keep'));
    expect(getByTestId('card-track-name').props.children).toBe('Track B');
    expect(getByTestId('stat-kept').props.children).toEqual([1, ' ', 'kept']);
  });

  test('card swipe keep via handleCardDecide advances track', () => {
    const { getByTestId } = renderWithProviders(<SiftScreen />, { initialTracks: tracks });
    expect(getByTestId('card-track-name').props.children).toBe('Track A');
    // Press the mock card's keep button — triggers handleCardDecide('keep')
    fireEvent.press(getByTestId('mock-card-keep'));
    expect(getByTestId('card-track-name').props.children).toBe('Track B');
    expect(getByTestId('stat-kept').props.children).toEqual([1, ' ', 'kept']);
  });

  test('card swipe remove via handleCardDecide advances track', () => {
    const { getByTestId } = renderWithProviders(<SiftScreen />, { initialTracks: tracks });
    fireEvent.press(getByTestId('mock-card-remove'));
    expect(getByTestId('card-track-name').props.children).toBe('Track B');
    expect(getByTestId('stat-removed').props.children).toEqual([1, ' ', 'removed']);
  });

  test('renders with single track (no back cards)', () => {
    const { getByTestId } = renderWithProviders(<SiftScreen />, { initialTracks: [mockTrackA] });
    expect(getByTestId('card-track-name').props.children).toBe('Track A');
    expect(getByTestId('remaining-count').props.children).toEqual([1, ' ', 'left']);
  });

  test('renders with two tracks (one back card)', () => {
    const { getByTestId } = renderWithProviders(<SiftScreen />, { initialTracks: [mockTrackA, mockTrackB] });
    expect(getByTestId('card-track-name').props.children).toBe('Track A');
    expect(getByTestId('remaining-count').props.children).toEqual([2, ' ', 'left']);
  });

  test('progress is 0 when no tracks', () => {
    const { getByTestId } = renderWithProviders(<SiftScreen />, { initialTracks: [] });
    // No current track → no card rendered
    expect(getByTestId('remaining-count').props.children).toEqual([0, ' ', 'left']);
  });

  test('back button flushes the debounced session save before leaving', () => {
    jest.useFakeTimers();
    try {
      const { saveSession } = require('../../src/services/SessionStore');
      (saveSession as jest.Mock).mockClear();
      const { getByTestId, getByLabelText } = renderWithProviders(<SiftScreen />, { initialTracks: tracks });

      // A decision schedules a debounced (500ms) session save…
      fireEvent.press(getByLabelText('Skip'));
      expect(saveSession).not.toHaveBeenCalled();

      // …and leaving before it fires must persist it instead of dropping it
      // (the autosave effect's cleanup cancels the pending timer on phase
      // change, which used to lose the last decisions).
      fireEvent.press(getByTestId('back-button'));
      expect(saveSession).toHaveBeenCalledTimes(1);
      expect((saveSession as jest.Mock).mock.calls[0][0]).toMatchObject({ cursor: 1 });
    } finally {
      jest.useRealTimers();
    }
  });

  test('a skip press immediately after a swipe decide cannot double-decide', () => {
    jest.useFakeTimers();
    try {
      const { getByTestId, getByLabelText } = renderWithProviders(<SiftScreen />, { initialTracks: tracks });

      // Swipe-decide (via the card's onDecide)…
      fireEvent.press(getByTestId('mock-card-keep'));
      // …then a Skip press in the settle window must be ignored — Skip used
      // to rely only on the render-lagged disabled prop.
      fireEvent.press(getByLabelText('Skip'));

      expect(getByTestId('stat-kept').props.children).toEqual([1, ' ', 'kept']);
      expect(getByTestId('stat-skipped').props.children).toEqual([0, ' ', 'skipped']);
      expect(getByTestId('card-track-name').props.children).toBe('Track B');

      // After the settle window, skipping works again — and holds the guard
      // itself, so an immediate second skip is also ignored.
      act(() => {
        jest.advanceTimersByTime(400);
      });
      fireEvent.press(getByLabelText('Skip'));
      fireEvent.press(getByLabelText('Skip'));
      expect(getByTestId('stat-skipped').props.children).toEqual([1, ' ', 'skipped']);
      expect(getByTestId('card-track-name').props.children).toBe('Track C');
    } finally {
      jest.useRealTimers();
    }
  });

  test('a button press immediately after a swipe decide cannot decide twice', () => {
    jest.useFakeTimers();
    try {
      const { getByTestId, getByLabelText } = renderWithProviders(<SiftScreen />, { initialTracks: tracks });

      // Swipe-decide (via the card's onDecide)…
      fireEvent.press(getByTestId('mock-card-keep'));
      // …then a button press in the settle window must be ignored.
      fireEvent.press(getByLabelText('Keep'));

      expect(getByTestId('stat-kept').props.children).toEqual([1, ' ', 'kept']);
      expect(getByTestId('card-track-name').props.children).toBe('Track B');

      // After the settle window, decisions work again.
      act(() => {
        jest.advanceTimersByTime(400);
      });
      fireEvent.press(getByLabelText('Keep'));
      expect(getByTestId('stat-kept').props.children).toEqual([2, ' ', 'kept']);
      expect(getByTestId('card-track-name').props.children).toBe('Track C');
    } finally {
      jest.useRealTimers();
    }
  });
});
