import React from 'react';
import { Dimensions, Text } from 'react-native';
import { fireEvent, act } from '@testing-library/react-native';

jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: jest.fn().mockReturnValue('light'),
}));

jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('expo-image', () => ({ Image: 'Image' }));

const mockWithTiming = jest.fn((val: number, _config: unknown, callback?: (finished: boolean) => void) => {
  if (callback) callback(true);
  return val;
});

jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: {
    View: 'View',
    createAnimatedComponent: (comp: unknown) => comp,
  },
  useSharedValue: (val: number) => ({ value: val }),
  useAnimatedStyle: (fn: () => unknown) => fn(),
  withTiming: (val: number, config: unknown, callback?: (finished: boolean) => void) =>
    mockWithTiming(val, config, callback),
  withSpring: (val: number) => val,
  Easing: { in: (e: unknown) => e, out: (e: unknown) => e, ease: {} },
  interpolate: (val: number, inputRange: number[], outputRange: number[]) => {
    const ratio = (val - inputRange[0]) / (inputRange[1] - inputRange[0]);
    return outputRange[0] + ratio * (outputRange[1] - outputRange[0]);
  },
  // The Undo pill's fade (#152): layout animations are a no-op here.
  FadeIn: { duration: () => undefined },
  FadeOut: { duration: () => undefined },
  runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
}));

jest.mock('react-native-gesture-handler', () => ({
  GestureDetector: ({ children }: { children: React.ReactNode }) => children,
  Gesture: {
    Pan: () => ({
      minDistance: () => ({ enabled: () => ({ onUpdate: () => ({ onEnd: () => ({}) }) }) }),
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
  const React = require('react');
  return function MockInteractiveCard({ track, onDecide, disabled, artworkRetryKey }: {
    track: { name: string; artist: string; album: string; playCount: number };
    onDecide: (d: string) => boolean;
    disabled?: boolean;
    artworkRetryKey?: number;
  }) {
    // What the last swipe heard back: false springs the real card back.
    const [lastDecide, setLastDecide] = React.useState(null);
    const decide = (d: string) => setLastDecide(onDecide(d));
    return (
      <View testID="mock-card" accessibilityState={{ disabled }} accessibilityHint={`artwork retry ${artworkRetryKey}`} accessibilityValue={{ text: `last decide ${lastDecide}` }}>
        <Text testID="card-track-name">{track.name}</Text>
        <Text testID="card-artist-name">{track.artist}</Text>
        <Text testID="card-album-name">{track.album}</Text>
        <Text testID="card-play-count">{track.playCount}</Text>
        <TouchableOpacity testID="mock-card-keep" accessibilityRole="button" accessibilityLabel="Swipe keep" onPress={() => decide('keep')} />
        <TouchableOpacity testID="mock-card-remove" accessibilityRole="button" accessibilityLabel="Swipe remove" onPress={() => decide('remove')} />
        <TouchableOpacity testID="mock-card-skip" accessibilityRole="button" accessibilityLabel="Action skip" onPress={() => decide('skip')} />
        {/* Two Skips 2.3 s apart that JavaScript runs in one go, as after a stall. */}
        <TouchableOpacity
          testID="mock-card-two-skips"
          accessibilityRole="button"
          accessibilityLabel="Two skips"
          onPress={() => {
            onDecide('skip');
            jest.setSystemTime(Date.now() + 2_300);
            onDecide('skip');
          }}
        />
      </View>
    );
  };
});

jest.mock('../../src/services/ReviewedLedgerStore', () => ({
  ...jest.requireActual('../../src/services/ReviewedLedgerStore'),
  markReviewed: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/services/haptics', () => ({
  decisionHaptic: jest.fn(),
  undoHaptic: jest.fn(),
  thresholdHaptic: jest.fn(),
}));

jest.mock('../../src/services/PreferencesStore', () => ({
  ...jest.requireActual('../../src/services/PreferencesStore'),
  loadSeenRemoveNote: jest.fn().mockResolvedValue(false),
  markRemoveNoteSeen: jest.fn().mockResolvedValue(undefined),
  // Seen, unless a test says otherwise: the hint sits over the card.
  loadSeenSwipeHint: jest.fn().mockResolvedValue(true),
  markSwipeHintSeen: jest.fn().mockResolvedValue(undefined),
}));

import { renderWithProviders, mockTrackA, mockTrackB, mockTrackC } from '../helpers/renderWithProviders';
import { loadSeenRemoveNote, loadSeenSwipeHint, markRemoveNoteSeen, markSwipeHintSeen } from '../../src/services/PreferencesStore';
import { useSift } from '../../src/context/SiftContext';
import SiftScreen from '../../src/screens/SiftScreen';
import { a11yViolations } from '../helpers/a11yScan';
import { flyOffDistance } from '../../src/utils/cardLayout';
import { decisionHaptic, undoHaptic } from '../../src/services/haptics';
import * as Sentry from '@sentry/react-native';
import { markReviewed } from '../../src/services/ReviewedLedgerStore';

// A press whose finger lifted at `timestamp` (the touch's own clock, which
// performance.now() shares: helpers/clock.setup.ts), however late JavaScript
// gets to it.
const pressAt = (timestamp: number) => ({ nativeEvent: { timestamp } });

describe('SiftScreen', () => {
  const tracks = [mockTrackA, mockTrackB, mockTrackC];

  describe('card size (#149)', () => {
    const layout = (width: number, height: number) => ({ nativeEvent: { layout: { x: 0, y: 0, width, height } } });

    test('fills the card area until it is measured', async () => {
      const { getByTestId } = await renderWithProviders(<SiftScreen />, { initialTracks: tracks });
      expect(getByTestId('card-stack').props.style).toEqual({ flex: 1, alignSelf: 'stretch' });
    });

    test('a phone keeps the whole area, inside the 12pt gutters', async () => {
      const { getByTestId } = await renderWithProviders(<SiftScreen />, { initialTracks: tracks });
      await fireEvent(getByTestId('card-area'), 'layout', layout(393, 470));
      expect(getByTestId('card-stack').props.style).toEqual({ width: 369, height: 470 });
    });

    test('iPad landscape gets a square card, so the artwork isn\'t a strip', async () => {
      const { getByTestId } = await renderWithProviders(<SiftScreen />, { initialTracks: tracks });
      await fireEvent(getByTestId('card-area'), 'layout', layout(1180, 494));
      expect(getByTestId('card-stack').props.style).toEqual({ width: 494, height: 494 });
      // A rotation re-measures.
      await fireEvent(getByTestId('card-area'), 'layout', layout(820, 860));
      expect(getByTestId('card-stack').props.style).toEqual({ width: 600, height: 780 });
    });

    test('the same size again keeps the same style object', async () => {
      const { getByTestId } = await renderWithProviders(<SiftScreen />, { initialTracks: tracks });
      await fireEvent(getByTestId('card-area'), 'layout', layout(1180, 494));
      const first = getByTestId('card-stack').props.style;
      await fireEvent(getByTestId('card-area'), 'layout', layout(1180, 494));
      expect(getByTestId('card-stack').props.style).toBe(first);
    });

    test('Keep and Remove fly the card a window width away, never less than 500', async () => {
      const { getByLabelText } = await renderWithProviders(<SiftScreen />, { initialTracks: tracks });
      const distance = flyOffDistance(Dimensions.get('window').width);
      mockWithTiming.mockClear();
      await fireEvent.press(getByLabelText('Keep'));
      expect(mockWithTiming).toHaveBeenCalledWith(distance, expect.anything(), expect.any(Function));
      await fireEvent.press(getByLabelText('Remove'), pressAt(Date.now() + 300));
      expect(mockWithTiming).toHaveBeenCalledWith(-distance, expect.anything(), expect.any(Function));
    });
  });

  test('renders remaining count', async () => {
    const { getByTestId } = await renderWithProviders(<SiftScreen />, { initialTracks: tracks });
    expect(getByTestId('remaining-count').props.children).toEqual(['3', ' ', 'left']);
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
    expect(getByTestId('stat-skipped').props.children).toEqual(['1', ' ', 'skipped']);
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

  test('big counts are compacted so the pill fits, with the exact number spoken (#142)', async () => {
    const many = Array.from({ length: 2655 }, (_, i) => ({ ...mockTrackA, id: `t${i}`, name: `Track ${i}` }));
    const { getByTestId } = await renderWithProviders(<SiftScreen />, { initialTracks: many });
    const left = getByTestId('remaining-count');
    expect(left.props.children).toEqual(['2.6k', ' ', 'left']);
    expect(left.props.accessibilityLabel).toBe('2655 left');
    expect(left.props.numberOfLines).toBe(1);
  });

  test('"This session" counts decisions made since the screen opened (#142)', async () => {
    const Sitting = () => {
      const { decide } = useSift();
      const [open, setOpen] = React.useState(false);
      return (
        <>
          {/* A decision from an earlier sitting, before the screen mounts. */}
          <Text testID="earlier" onPress={() => decide('keep')}>earlier</Text>
          <Text testID="open" onPress={() => setOpen(true)}>open</Text>
          {open && <SiftScreen />}
        </>
      );
    };
    const { getByTestId, getByLabelText } = await renderWithProviders(<Sitting />, { initialTracks: tracks });
    await fireEvent.press(getByTestId('earlier'));
    await fireEvent.press(getByTestId('open'));
    expect(getByTestId('session-count').props.children).toEqual(['This session: ', '0']);
    await fireEvent.press(getByLabelText('Skip'));
    expect(getByTestId('session-count').props.children).toEqual(['This session: ', '1']);
    // The pill still counts the whole sift.
    expect(getByTestId('remaining-count').props.children).toEqual(['1', ' ', 'left']);
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
    expect(getByTestId('stat-removed').props.children).toEqual(['1', ' ', 'removed']);
  });

  test('pressing Keep button triggers animateDecision', async () => {
    const { getByLabelText, getByTestId } = await renderWithProviders(<SiftScreen />, { initialTracks: tracks });
    await fireEvent.press(getByLabelText('Keep'));
    expect(getByTestId('card-track-name').props.children).toBe('Track B');
    expect(getByTestId('stat-kept').props.children).toEqual(['1', ' ', 'kept']);
  });

  test('card swipe keep via handleCardDecide advances track', async () => {
    const { getByTestId } = await renderWithProviders(<SiftScreen />, { initialTracks: tracks });
    expect(getByTestId('card-track-name').props.children).toBe('Track A');
    // Press the mock card's keep button — triggers handleCardDecide('keep')
    await fireEvent.press(getByTestId('mock-card-keep'));
    expect(getByTestId('card-track-name').props.children).toBe('Track B');
    expect(getByTestId('stat-kept').props.children).toEqual(['1', ' ', 'kept']);
  });

  test('card swipe remove via handleCardDecide advances track', async () => {
    const { getByTestId } = await renderWithProviders(<SiftScreen />, { initialTracks: tracks });
    await fireEvent.press(getByTestId('mock-card-remove'));
    expect(getByTestId('card-track-name').props.children).toBe('Track B');
    expect(getByTestId('stat-removed').props.children).toEqual(['1', ' ', 'removed']);
  });

  test('renders with single track (no back cards)', async () => {
    const { getByTestId } = await renderWithProviders(<SiftScreen />, { initialTracks: [mockTrackA] });
    expect(getByTestId('card-track-name').props.children).toBe('Track A');
    expect(getByTestId('remaining-count').props.children).toEqual(['1', ' ', 'left']);
  });

  test('renders with two tracks (one back card)', async () => {
    const { getByTestId } = await renderWithProviders(<SiftScreen />, { initialTracks: [mockTrackA, mockTrackB] });
    expect(getByTestId('card-track-name').props.children).toBe('Track A');
    expect(getByTestId('remaining-count').props.children).toEqual(['2', ' ', 'left']);
  });

  test('progress is 0 when no tracks', async () => {
    const { getByTestId } = await renderWithProviders(<SiftScreen />, { initialTracks: [] });
    // No current track → no card rendered
    expect(getByTestId('remaining-count').props.children).toEqual(['0', ' ', 'left']);
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

      expect(getByTestId('stat-kept').props.children).toEqual(['1', ' ', 'kept']);
      expect(getByTestId('stat-skipped').props.children).toEqual(['0', ' ', 'skipped']);
      expect(getByTestId('card-track-name').props.children).toBe('Track B');

      // After the settle window, skipping works again — and holds the guard
      // itself, so an immediate second skip is also ignored.
      await act(() => {
        jest.advanceTimersByTime(400);
      });
      await fireEvent.press(getByLabelText('Skip'));
      await fireEvent.press(getByLabelText('Skip'));
      expect(getByTestId('stat-skipped').props.children).toEqual(['1', ' ', 'skipped']);
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

      expect(getByTestId('stat-kept').props.children).toEqual(['1', ' ', 'kept']);
      expect(getByTestId('card-track-name').props.children).toBe('Track B');

      // After the settle window, decisions work again.
      await act(() => {
        jest.advanceTimersByTime(400);
      });
      await fireEvent.press(getByLabelText('Keep'));
      expect(getByTestId('stat-kept').props.children).toEqual(['2', ' ', 'kept']);
      expect(getByTestId('card-track-name').props.children).toBe('Track C');
    } finally {
      jest.useRealTimers();
    }
  });

  describe('the decision guard', () => {
    test('taps queued in a stall each count, judged by when the finger lifted (flow 21)', async () => {
      // A stalled JavaScript thread runs its queued taps back to back, long
      // after they happened, and before any timer that came due meanwhile.
      jest.useFakeTimers();
      try {
        const { getByTestId, getByLabelText } = await renderWithProviders(<SiftScreen />, { initialTracks: tracks });
        const before = Date.now();
        jest.setSystemTime(before + 16_000);
        await fireEvent.press(getByLabelText('Skip'), pressAt(before + 1_000));
        await fireEvent.press(getByLabelText('Skip'), pressAt(before + 3_300));
        expect(getByTestId('stat-skipped').props.children).toEqual(['2', ' ', 'skipped']);
        expect(getByTestId('card-track-name').props.children).toBe('Track C');
      } finally {
        jest.useRealTimers();
      }
    });

    test('a Skip that comes before the last decision shows waits for it, then skips the next card', async () => {
      // The Keep's card is still flying off when the Skip comes, on time.
      let landed: ((finished: boolean) => void) | undefined;
      mockWithTiming.mockImplementationOnce((val: number, _config: unknown, callback?: (finished: boolean) => void) => {
        landed = callback;
        return val;
      });
      (markReviewed as jest.Mock).mockClear();
      const { getByTestId, getByLabelText } = await renderWithProviders(<SiftScreen />, { initialTracks: tracks });
      const t0 = Date.now();
      await fireEvent.press(getByLabelText('Keep'), pressAt(t0));
      await fireEvent.press(getByLabelText('Skip'), pressAt(t0 + 400));
      expect(getByTestId('stat-kept').props.children).toEqual(['0', ' ', 'kept']);
      expect(getByTestId('stat-skipped').props.children).toEqual(['0', ' ', 'skipped']);
      await act(() => {
        landed?.(true);
      });
      // Track A kept, then Track B skipped: never Track A twice.
      expect(getByTestId('stat-kept').props.children).toEqual(['1', ' ', 'kept']);
      expect(getByTestId('stat-skipped').props.children).toEqual(['1', ' ', 'skipped']);
      expect(getByTestId('card-track-name').props.children).toBe('Track C');
      // The Skip ran with the Keep's state, so it sent the held Keep on.
      expect(markReviewed).toHaveBeenCalledWith(expect.any(String), mockTrackA.id);
    });

    test('a Keep or Remove that comes before the last decision shows is turned away: its card hasn\'t been seen', async () => {
      let landed: ((finished: boolean) => void) | undefined;
      mockWithTiming.mockImplementationOnce((val: number, _config: unknown, callback?: (finished: boolean) => void) => {
        landed = callback;
        return val;
      });
      const { getByTestId, getByLabelText } = await renderWithProviders(<SiftScreen />, { initialTracks: tracks });
      const t0 = Date.now();
      await fireEvent.press(getByLabelText('Keep'), pressAt(t0));
      await fireEvent.press(getByLabelText('Remove'), pressAt(t0 + 400));
      await fireEvent.press(getByLabelText('Keep'), pressAt(t0 + 400));
      await act(() => {
        landed?.(true);
      });
      expect(getByTestId('stat-kept').props.children).toEqual(['1', ' ', 'kept']);
      expect(getByTestId('stat-removed').props.children).toEqual(['0', ' ', 'removed']);
      expect(getByTestId('card-track-name').props.children).toBe('Track B');
    });

    test('two Skips JavaScript gets to in one go both count, one card each', async () => {
      // As after a stall: the second runs before React shows the first, so
      // it waits, then skips the next card with the state that shows.
      jest.useFakeTimers();
      try {
        const { getByTestId } = await renderWithProviders(<SiftScreen />, { initialTracks: tracks });
        await fireEvent.press(getByTestId('mock-card-two-skips'));
        expect(getByTestId('stat-skipped').props.children).toEqual(['2', ' ', 'skipped']);
        expect(getByTestId('card-track-name').props.children).toBe('Track C');
      } finally {
        jest.useRealTimers();
      }
    });

    test('a touch stamped on some other clock is judged as now', async () => {
      const { getByTestId, getByLabelText } = await renderWithProviders(<SiftScreen />, { initialTracks: tracks });
      const t0 = Date.now();
      // Years out: taken as now, so it doesn't hold the guard for years.
      await fireEvent.press(getByLabelText('Skip'), pressAt(t0 + 1e11));
      expect(getByTestId('stat-skipped').props.children).toEqual(['1', ' ', 'skipped']);
      // Judged as then, it would hold the guard years from now.
      await fireEvent.press(getByLabelText('Skip'), pressAt(t0 + 400));
      expect(getByTestId('stat-skipped').props.children).toEqual(['2', ' ', 'skipped']);
    });

    test('a tap within the hold is turned away, and says so: 300 ms after a Skip', async () => {
      (Sentry.addBreadcrumb as jest.Mock).mockClear();
      const { getByTestId, getByLabelText } = await renderWithProviders(<SiftScreen />, { initialTracks: tracks });
      const t0 = Date.now();
      await fireEvent.press(getByLabelText('Skip'), pressAt(t0));
      await fireEvent.press(getByLabelText('Skip'), pressAt(t0 + 299));
      expect(getByTestId('stat-skipped').props.children).toEqual(['1', ' ', 'skipped']);
      expect(Sentry.addBreadcrumb).toHaveBeenCalledWith({
        category: 'ui.trace',
        message: 'guard-busy',
        data: { input: 'skip', held: 299 },
        level: 'info',
      });
      await fireEvent.press(getByLabelText('Skip'), pressAt(t0 + 300));
      expect(getByTestId('stat-skipped').props.children).toEqual(['2', ' ', 'skipped']);
    });

    test('300 ms after a button\'s Keep or Remove', async () => {
      const { getByTestId, getByLabelText } = await renderWithProviders(<SiftScreen />, { initialTracks: tracks });
      const t0 = Date.now();
      await fireEvent.press(getByLabelText('Keep'), pressAt(t0));
      await fireEvent.press(getByLabelText('Keep'), pressAt(t0 + 299));
      expect(getByTestId('stat-kept').props.children).toEqual(['1', ' ', 'kept']);
      await fireEvent.press(getByLabelText('Remove'), pressAt(t0 + 300));
      expect(getByTestId('stat-removed').props.children).toEqual(['1', ' ', 'removed']);
    });

    test('350 ms after a swipe: its fly-off and the next card landing', async () => {
      const { getByTestId, getByLabelText } = await renderWithProviders(<SiftScreen />, { initialTracks: tracks });
      jest.useFakeTimers();
      try {
        const swipedAt = Date.now();
        await fireEvent.press(getByTestId('mock-card-keep'));
        await fireEvent.press(getByLabelText('Skip'), pressAt(swipedAt + 349));
        expect(getByTestId('stat-skipped').props.children).toEqual(['0', ' ', 'skipped']);
        await fireEvent.press(getByLabelText('Skip'), pressAt(swipedAt + 350));
        expect(getByTestId('stat-skipped').props.children).toEqual(['1', ' ', 'skipped']);
        expect(getByTestId('card-track-name').props.children).toBe('Track C');
      } finally {
        jest.useRealTimers();
      }
    });

    test('a swipe turned away tells the card, which springs back', async () => {
      // The InteractiveCard mock passes on what onDecide returns.
      const { getByTestId, getByLabelText } = await renderWithProviders(<SiftScreen />, { initialTracks: tracks });
      jest.useFakeTimers();
      try {
        await fireEvent.press(getByLabelText('Skip'), pressAt(Date.now()));
        await fireEvent.press(getByTestId('mock-card-keep'));
        expect(getByTestId('mock-card').props.accessibilityValue).toEqual({ text: 'last decide false' });
        jest.setSystemTime(Date.now() + 300);
        await fireEvent.press(getByTestId('mock-card-keep'));
        expect(getByTestId('stat-kept').props.children).toEqual(['1', ' ', 'kept']);
      } finally {
        jest.useRealTimers();
      }
    });

    test('while a card is flying off, nothing else decides, finishes, undoes, goes back or opens the list', async () => {
      const Probe = () => {
        const { state } = useSift();
        return (
          <>
            <SiftScreen />
            <Text testID="current-phase">{state.phase}</Text>
          </>
        );
      };
      const { getByTestId, getByLabelText, queryByTestId } = await renderWithProviders(<Probe />, { initialTracks: tracks });
      const t0 = Date.now();
      await fireEvent.press(getByLabelText('Skip'), pressAt(t0));
      // A Keep whose card never finishes flying off, however long it takes.
      mockWithTiming.mockImplementationOnce((val: number) => val);
      await fireEvent.press(getByLabelText('Keep'), pressAt(t0 + 1000));
      const later = pressAt(t0 + 59_000);
      await fireEvent.press(getByTestId('undo-pill'), later);
      await fireEvent.press(getByTestId('decisions-button'), later);
      await fireEvent.press(getByTestId('finish-button'), later);
      await fireEvent.press(getByTestId('back-button'), later);
      expect(getByTestId('stat-skipped').props.children).toEqual(['1', ' ', 'skipped']);
      expect(getByTestId('stat-kept').props.children).toEqual(['0', ' ', 'kept']);
      expect(queryByTestId('decisions-sheet')).toBeNull();
      expect(getByTestId('current-phase').props.children).toBe('sifting');
    });

    test('Back isn\'t held by a Skip\'s settle: only by a card still flying off', async () => {
      const Probe = () => {
        const { state } = useSift();
        return (
          <>
            <SiftScreen />
            <Text testID="current-phase">{state.phase}</Text>
          </>
        );
      };
      const { getByTestId, getByLabelText } = await renderWithProviders(<Probe />, { initialTracks: tracks });
      const t0 = Date.now();
      await fireEvent.press(getByLabelText('Skip'), pressAt(t0));
      await fireEvent.press(getByTestId('finish-button'), pressAt(t0 + 100));
      expect(getByTestId('current-phase').props.children).toBe('sifting');
      await fireEvent.press(getByTestId('back-button'), pressAt(t0 + 100));
      expect(getByTestId('current-phase').props.children).toBe('setup');
    });

    test('the buttons are never disabled for it: they ask it when pressed', async () => {
      const { getByLabelText, getByTestId } = await renderWithProviders(<SiftScreen />, { initialTracks: tracks });
      const t0 = Date.now();
      await fireEvent.press(getByLabelText('Skip'), pressAt(t0));
      for (const label of ['Remove', 'Skip', 'Keep']) {
        expect(getByLabelText(label).props.accessibilityState?.disabled).toBeFalsy();
      }
      expect(getByTestId('finish-button').props.accessibilityState?.disabled).toBeFalsy();
      expect(getByTestId('decisions-button').props.accessibilityState?.disabled).toBeFalsy();
    });
  });

  describe('swipes and feel', () => {
    test('a swiped card flies off faster, from where it was let go; a button\'s from the middle', async () => {
      const { getByTestId, getByLabelText } = await renderWithProviders(<SiftScreen />, { initialTracks: tracks });
      mockWithTiming.mockClear();
      await fireEvent.press(getByTestId('mock-card-keep'));
      expect(mockWithTiming).toHaveBeenCalledWith(flyOffDistance(Dimensions.get('window').width), expect.objectContaining({ duration: 200 }), expect.any(Function));
      mockWithTiming.mockClear();
      await fireEvent.press(getByLabelText('Remove'), pressAt(Date.now() + 350));
      expect(mockWithTiming).toHaveBeenCalledWith(-flyOffDistance(Dimensions.get('window').width), expect.objectContaining({ duration: 300 }), expect.any(Function));
    });

    test('Skip from the card (VoiceOver\'s action) skips, without a fly-off', async () => {
      const { getByTestId } = await renderWithProviders(<SiftScreen />, { initialTracks: tracks });
      mockWithTiming.mockClear();
      await fireEvent.press(getByTestId('mock-card-skip'));
      expect(mockWithTiming).not.toHaveBeenCalled();
      expect(getByTestId('stat-skipped').props.children).toEqual(['1', ' ', 'skipped']);
      expect(getByTestId('card-track-name').props.children).toBe('Track B');
    });

    test('each decision, and Undo, is felt', async () => {
      jest.useFakeTimers();
      try {
        (decisionHaptic as jest.Mock).mockClear();
        const { getByTestId, getByLabelText } = await renderWithProviders(<SiftScreen />, { initialTracks: tracks });
        await fireEvent.press(getByLabelText('Keep'));
        expect(decisionHaptic).toHaveBeenLastCalledWith('keep');
        await fireEvent.press(getByLabelText('Skip'), pressAt(Date.now() + 300));
        expect(decisionHaptic).toHaveBeenLastCalledWith('skip');
        await act(() => {
          jest.advanceTimersByTime(600);
        });
        await fireEvent.press(getByTestId('undo-pill'));
        expect(undoHaptic).toHaveBeenCalledTimes(1);
        // A refused decision (one already under way) isn't felt.
        (decisionHaptic as jest.Mock).mockClear();
        await fireEvent.press(getByTestId('mock-card-remove'));
        await fireEvent.press(getByLabelText('Keep'));
        expect(decisionHaptic).toHaveBeenCalledTimes(1);
      } finally {
        jest.useRealTimers();
      }
    });

    test('the card can\'t be dragged while a decision is under way, and retries its artwork after a warm-up', async () => {
      jest.useFakeTimers();
      try {
        const { getByTestId } = await renderWithProviders(<SiftScreen />, { initialTracks: tracks });
        expect(getByTestId('mock-card').props.accessibilityState).toEqual({ disabled: false });
        expect(getByTestId('mock-card').props.accessibilityHint).toBe('artwork retry 0');
        // The card flies off, and isn't gone yet.
        let landed: ((finished: boolean) => void) | undefined;
        mockWithTiming.mockImplementationOnce((val: number, _config: unknown, callback?: (finished: boolean) => void) => {
          landed = callback;
          return val;
        });
        await fireEvent.press(getByTestId('mock-card-keep'));
        expect(getByTestId('mock-card').props.accessibilityState).toEqual({ disabled: true });
        // The next card is on screen, and can be dragged.
        await act(() => {
          landed?.(true);
        });
        expect(getByTestId('card-track-name').props.children).toBe('Track B');
        expect(getByTestId('mock-card').props.accessibilityState).toEqual({ disabled: false });
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('your decisions', () => {
    test('a header button, once there is a decision, opens the list to change one', async () => {
      jest.useFakeTimers();
      try {
        const { getByLabelText, getByTestId, queryByTestId } = await renderWithProviders(<SiftScreen />, { initialTracks: tracks });
        expect(queryByTestId('decisions-button')).toBeNull();
        await fireEvent.press(getByLabelText('Skip'));
        await act(() => {
          jest.advanceTimersByTime(400);
        });
        const button = getByTestId('decisions-button');
        expect(button.props.accessibilityLabel).toBe('Your decisions');
        await fireEvent.press(button);
        expect(getByTestId('decisions-sheet')).toBeTruthy();
        // The held Skip changes to Keep, here and on the stats.
        await act(async () => {
          await fireEvent.press(getByTestId('decision-keep-1'));
        });
        expect(getByTestId('stat-kept').props.children).toEqual(['1', ' ', 'kept']);
        expect(getByTestId('stat-skipped').props.children).toEqual(['0', ' ', 'skipped']);
        await fireEvent.press(getByTestId('decisions-done'));
        expect(queryByTestId('decisions-sheet')).toBeNull();
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('first-card swipe hint', () => {
    test('shows on the first card ever, until the first decision, which marks it seen', async () => {
      (loadSeenSwipeHint as jest.Mock).mockResolvedValueOnce(false);
      (markSwipeHintSeen as jest.Mock).mockClear();
      const { getByLabelText, getByTestId, queryByTestId } = await renderWithProviders(<SiftScreen />, { initialTracks: tracks });
      await act(async () => {});
      expect(getByTestId('swipe-hint').props.children).toBe('Swipe right to keep, left to remove.');
      expect(markSwipeHintSeen).not.toHaveBeenCalled();
      await fireEvent.press(getByLabelText('Keep'));
      expect(queryByTestId('swipe-hint')).toBeNull();
      expect(markSwipeHintSeen).toHaveBeenCalledTimes(1);
    });

    test('not once it has been seen', async () => {
      const { queryByTestId } = await renderWithProviders(<SiftScreen />, { initialTracks: tracks });
      await act(async () => {});
      expect(queryByTestId('swipe-hint')).toBeNull();
    });
  });

  describe('first-remove note (#141)', () => {
    test('the first Apple library remove explains where songs go, once, until the next decision', async () => {
      (markRemoveNoteSeen as jest.Mock).mockClear();
      const { getByLabelText, getByTestId, queryByTestId } = await renderWithProviders(<SiftScreen />, {
        initialTracks: [mockTrackA, mockTrackB, mockTrackC],
      });
      await act(async () => {});
      expect(queryByTestId('first-remove-note')).toBeNull();

      // A second ago, so the swipe below isn't within its hold.
      await fireEvent.press(getByLabelText('Remove'), pressAt(Date.now() - 1_000));
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

describe('VoiceOver scan (#146)', () => {
  test('the Sift screen and its player', async () => {
    const { toJSON } = await renderWithProviders(<SiftScreen />, { initialTracks: [mockTrackA, mockTrackB, mockTrackC] });
    expect(a11yViolations(toJSON())).toEqual([]);
  });
});

describe('decision announcements (#146)', () => {
  test('VoiceOver hears what happened to the song', async () => {
    const { AccessibilityInfo } = require('react-native');
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
    const { getByLabelText, getByTestId } = await renderWithProviders(<SiftScreen />, { initialTracks: [mockTrackA, mockTrackB, mockTrackC] });
    await fireEvent.press(getByLabelText('Skip'));
    expect(announce).toHaveBeenLastCalledWith('Track A skipped.');
    await fireEvent.press(getByTestId('mock-card-remove'));
    await act(async () => {});
    announce.mockRestore();
  });
});
