import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Track } from '../../src/types';

jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: jest.fn().mockReturnValue('light'),
}));

jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('expo-image', () => ({ Image: 'Image' }));

const mockWithSpring = jest.fn((val: number, _config?: unknown) => val);

jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: {
    View: 'View',
    createAnimatedComponent: (comp: unknown) => comp,
  },
  useSharedValue: (val: number) => ({ value: val }),
  useAnimatedStyle: (fn: () => unknown) => fn(),
  withSpring: (val: number, config?: unknown) => mockWithSpring(val, config),
  interpolate: (val: number, inputRange: number[], outputRange: number[]) => {
    const ratio = (val - inputRange[0]) / (inputRange[1] - inputRange[0]);
    return outputRange[0] + ratio * (outputRange[1] - outputRange[0]);
  },
  runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
}));

// Capture gesture callbacks so we can invoke them in tests. The builder takes
// its calls in any order, as Gesture.Pan()'s does.
type GestureCallback = (event: Record<string, unknown>, success?: boolean) => void;
let panOnBegin: GestureCallback | undefined;
let panOnStart: GestureCallback | undefined;
let panOnUpdate: GestureCallback | undefined;
let panOnEnd: GestureCallback | undefined;
let panOnFinalize: GestureCallback | undefined;
let panEnabled: boolean | undefined;

jest.mock('react-native-gesture-handler', () => {
  const pan = {
    minDistance: () => pan,
    enabled: (enabled: boolean) => {
      panEnabled = enabled;
      return pan;
    },
    onBegin: (fn: GestureCallback) => {
      panOnBegin = fn;
      return pan;
    },
    onStart: (fn: GestureCallback) => {
      panOnStart = fn;
      return pan;
    },
    onUpdate: (fn: GestureCallback) => {
      panOnUpdate = fn;
      return pan;
    },
    onEnd: (fn: GestureCallback) => {
      panOnEnd = fn;
      return pan;
    },
    onFinalize: (fn: GestureCallback) => {
      panOnFinalize = fn;
      return pan;
    },
  };
  return {
    GestureDetector: ({ children }: { children: React.ReactNode }) => children,
    Gesture: { Pan: () => pan },
  };
});

// Whether this is the E2E build, which writes trace lines: a switch here.
let mockTracing = false;
const mockTrace = jest.fn();
jest.mock('../../src/services/trace', () =>
  Object.defineProperties(
    {},
    {
      tracing: { get: () => mockTracing },
      trace: { value: (event: string, data?: unknown) => mockTrace(event, data) },
    },
  ),
);

jest.mock('../../src/services/haptics', () => ({ thresholdHaptic: jest.fn() }));

// Whether a PR GIF recording draws touches: a switch here.
let mockShowTouches = false;
const mockFollowTouch = jest.fn();
const mockLiftTouch = jest.fn();
jest.mock('../../src/services/touchOverlay', () =>
  Object.defineProperties(
    {},
    {
      showTouches: { get: () => mockShowTouches },
      followTouch: { value: (x: number, y: number) => mockFollowTouch(x, y) },
      liftTouch: { value: (x: number, y: number) => mockLiftTouch(x, y) },
    },
  ),
);

jest.mock('../../src/hooks/useResolvedArtwork', () => ({
  useResolvedArtwork: jest.fn().mockReturnValue('https://example.com/art.jpg'),
}));

import { useResolvedArtwork } from '../../src/hooks/useResolvedArtwork';
import InteractiveCard from '../../src/components/InteractiveCard';
import { ThemeProvider } from '../../src/theme/ThemeContext';
import { a11yViolations } from '../helpers/a11yScan';

const mockTrack: Track = {
  id: '1',
  name: 'Test Track',
  artist: 'Test Artist',
  album: 'Test Album',
  duration: 200,
  playCount: 42,
  dateAdded: '2020-01-15T12:00:00.000Z',
  artworkURL: 'https://example.com/art.jpg',
};

async function renderCard(track = mockTrack, onDecide = jest.fn(), playsKnown?: boolean) {
  panOnUpdate = undefined;
  panOnEnd = undefined;
  return {
    ...(await render(
      <ThemeProvider>
        <InteractiveCard track={track} onDecide={onDecide} playsKnown={playsKnown} />
      </ThemeProvider>,
    )),
    onDecide,
  };
}

describe('InteractiveCard', () => {
  test('renders track name', async () => {
    const { getByTestId } = await renderCard();
    expect(getByTestId('card-track-name')).toHaveTextContent('Test Track');
  });

  test('renders artist name', async () => {
    const { getByTestId } = await renderCard();
    expect(getByTestId('card-artist-name').props.children).toBe('Test Artist');
  });

  test('renders album name', async () => {
    const { getByTestId } = await renderCard();
    expect(getByTestId('card-album-name').props.children).toBe('Test Album');
  });

  test('renders the play count and add date as one meta line', async () => {
    const { getByTestId } = await renderCard();
    expect(getByTestId('card-play-count').props.children).toBe(
      'Played 42\u00D7 \u00B7 Added Jan 2020',
    );
    expect(getByTestId('card-play-count').props.accessibilityLabel).toBe(
      'Played 42 times, added January 2020',
    );
  });

  test('a provider without play counts shows only the add date', async () => {
    const { getByTestId } = await renderCard({ ...mockTrack, playCount: 0 }, jest.fn(), false);
    expect(getByTestId('card-play-count').props.children).toBe('Added Jan 2020');
  });

  test('hides the meta line when nothing is known', async () => {
    const { queryByTestId } = await renderCard({ ...mockTrack, playCount: 0, dateAdded: '' });
    expect(queryByTestId('card-play-count')).toBeNull();
  });

  test('the artwork is an image VoiceOver reads, so text on a cover is covered', async () => {
    const { getByLabelText } = await renderCard();
    const art = getByLabelText('Album art, Test Album');
    expect(art.props.accessible).toBe(true);
    expect(art.props.accessibilityRole).toBe('image');
    expect(art.props.accessibilityElementsHidden).toBeUndefined();
  });

  test('artwork of a song with no album is just "Album art"', async () => {
    const { getByLabelText } = await renderCard({ ...mockTrack, album: '' });
    expect(getByLabelText('Album art').props.accessibilityRole).toBe('image');
  });

  test('renders placeholder when no artwork URL', async () => {
    jest.mocked(useResolvedArtwork).mockReturnValueOnce(undefined);
    const trackNoArt = { ...mockTrack, artworkURL: undefined };
    const { toJSON } = await renderCard(trackNoArt);
    expect(toJSON()).toBeTruthy();
  });

  test('pan gesture onUpdate sets drag values', async () => {
    await renderCard();
    expect(panOnUpdate).toBeDefined();
    // Should not throw when called
    panOnUpdate?.({ translationX: 50, translationY: 10 });
  });

  test("a GIF recording's drawn ring follows the swipe and lets go with it; nothing otherwise", async () => {
    // The gesture's worklets take the switch as it was when it was built.
    await renderCard();
    panOnUpdate?.({ translationX: 50, translationY: 10, absoluteX: 250, absoluteY: 410 });
    panOnFinalize?.({ absoluteX: 260, absoluteY: 412 });
    expect(mockFollowTouch).not.toHaveBeenCalled();
    expect(mockLiftTouch).not.toHaveBeenCalled();
    mockShowTouches = true;
    try {
      await renderCard();
      panOnUpdate?.({ translationX: 50, translationY: 10, absoluteX: 250, absoluteY: 410 });
      panOnFinalize?.({ absoluteX: 260, absoluteY: 412 });
      expect(mockFollowTouch.mock.calls).toEqual([[250, 410]]);
      expect(mockLiftTouch.mock.calls).toEqual([[260, 412]]);
    } finally {
      mockShowTouches = false;
    }
  });

  test('pan gesture beyond threshold right triggers keep', async () => {
    const onDecide = jest.fn();
    await renderCard(mockTrack, onDecide);
    expect(panOnEnd).toBeDefined();
    panOnEnd?.({ translationX: 100 });
    expect(onDecide).toHaveBeenCalledWith('keep');
  });

  test('pan gesture beyond threshold left triggers remove', async () => {
    const onDecide = jest.fn();
    await renderCard(mockTrack, onDecide);
    panOnEnd?.({ translationX: -100 });
    expect(onDecide).toHaveBeenCalledWith('remove');
  });

  test('a swipe turned away (a decision already under way) springs the card back', async () => {
    const onDecide = jest.fn(() => false);
    await renderCard(mockTrack, onDecide);
    mockWithSpring.mockClear();
    panOnEnd?.({ translationX: 100 });
    expect(onDecide).toHaveBeenCalledWith('keep');
    expect(mockWithSpring.mock.calls.map(([to]) => to)).toEqual([0, 0]);
  });

  test('a swipe that decides leaves the card where it was let go, to fly off from there', async () => {
    const onDecide = jest.fn(() => true);
    await renderCard(mockTrack, onDecide);
    mockWithSpring.mockClear();
    panOnEnd?.({ translationX: -100 });
    expect(onDecide).toHaveBeenCalledWith('remove');
    expect(mockWithSpring).not.toHaveBeenCalled();
  });

  test('pan gesture below threshold does not trigger decision', async () => {
    const onDecide = jest.fn();
    await renderCard(mockTrack, onDecide);
    panOnEnd?.({ translationX: 30 });
    expect(onDecide).not.toHaveBeenCalled();
  });

  test("a quick flick decides short of the threshold; a slow one doesn't", async () => {
    const onDecide = jest.fn();
    await renderCard(mockTrack, onDecide);
    panOnEnd?.({ translationX: 40, velocityX: 1200 });
    expect(onDecide).toHaveBeenLastCalledWith('keep');
    panOnEnd?.({ translationX: -40, velocityX: -1200 });
    expect(onDecide).toHaveBeenLastCalledWith('remove');
    onDecide.mockClear();
    panOnEnd?.({ translationX: 40, velocityX: 200 });
    expect(onDecide).not.toHaveBeenCalled();
  });

  test('the E2E build traces what the pan saw: began, took over, how it ended', async () => {
    mockTracing = true;
    mockTrace.mockClear();
    try {
      const onDecide = jest.fn();
      await renderCard(mockTrack, onDecide);
      panOnBegin?.({ absoluteX: 201.4 });
      panOnStart?.({ translationX: 12.6 });
      panOnEnd?.({ translationX: 160.2, velocityX: 402.7 }, true);
      panOnFinalize?.({ absoluteX: 361, absoluteY: 569 }, true);
      expect(mockTrace.mock.calls).toEqual([
        ['pan-begin', { x: 201 }],
        ['pan-start', { dx: 13 }],
        ['pan-end', { dx: 160, vx: 403, ok: true, decision: 'keep' }],
        ['pan-finalize', { ok: true }],
      ]);
      expect(onDecide).toHaveBeenCalledWith('keep');
      // A pan that ends short decides nothing, and says so.
      mockTrace.mockClear();
      panOnEnd?.({ translationX: 13, velocityX: 0 }, false);
      expect(mockTrace).toHaveBeenCalledWith('pan-end', {
        dx: 13,
        vx: 0,
        ok: false,
        decision: 'none',
      });
    } finally {
      mockTracing = false;
    }
  });

  test('a build without the trace writes no pan lines', async () => {
    mockTrace.mockClear();
    await renderCard();
    panOnBegin?.({ absoluteX: 200 });
    panOnStart?.({ translationX: 12 });
    panOnEnd?.({ translationX: 160, velocityX: 400 }, true);
    panOnFinalize?.({ absoluteX: 360, absoluteY: 569 }, true);
    expect(mockTrace).not.toHaveBeenCalled();
  });

  test('crossing the threshold ticks once each way', async () => {
    const { thresholdHaptic } = jest.requireMock('../../src/services/haptics');
    (thresholdHaptic as jest.Mock).mockClear();
    await renderCard();
    panOnUpdate?.({ translationX: 40, translationY: 0 });
    expect(thresholdHaptic).not.toHaveBeenCalled();
    panOnUpdate?.({ translationX: 90, translationY: 0 });
    panOnUpdate?.({ translationX: 120, translationY: 0 });
    expect(thresholdHaptic).toHaveBeenCalledTimes(1);
    panOnUpdate?.({ translationX: 60, translationY: 0 });
    expect(thresholdHaptic).toHaveBeenCalledTimes(2);
    panOnUpdate?.({ translationX: -90, translationY: 0 });
    expect(thresholdHaptic).toHaveBeenCalledTimes(3);
    // Letting go resets it: the next drag ticks again.
    panOnEnd?.({ translationX: 0 });
    panOnUpdate?.({ translationX: 90, translationY: 0 });
    expect(thresholdHaptic).toHaveBeenCalledTimes(4);
  });

  test("can't be dragged while a decision is under way", async () => {
    await renderCard();
    expect(panEnabled).toBe(true);
    await render(
      <ThemeProvider>
        <InteractiveCard track={mockTrack} onDecide={jest.fn()} disabled />
      </ThemeProvider>,
    );
    expect(panEnabled).toBe(false);
  });

  test('passes its artwork retry key on', async () => {
    jest.mocked(useResolvedArtwork).mockClear();
    await render(
      <ThemeProvider>
        <InteractiveCard track={mockTrack} onDecide={jest.fn()} artworkRetryKey={3} />
      </ThemeProvider>,
    );
    expect(useResolvedArtwork).toHaveBeenCalledWith('1', mockTrack.artworkURL, 3);
    jest.mocked(useResolvedArtwork).mockClear();
    await renderCard();
    expect(useResolvedArtwork).toHaveBeenCalledWith('1', mockTrack.artworkURL, 0);
  });

  test('renders with programmaticOffset prop', async () => {
    const onDecide = jest.fn();
    const programmaticOffset = { value: 100 };
    const { getByTestId } = await render(
      <ThemeProvider>
        <InteractiveCard
          track={mockTrack}
          onDecide={onDecide}
          programmaticOffset={programmaticOffset as never}
        />
      </ThemeProvider>,
    );
    expect(getByTestId('card-track-name')).toHaveTextContent('Test Track');
  });
});

describe('InteractiveCard VoiceOver (#146)', () => {
  test('Keep, Remove and Skip are actions on the song name', async () => {
    const { getByTestId, onDecide } = await renderCard();
    const name = getByTestId('card-track-name');
    expect(name.props.accessibilityActions.map((a: { name: string }) => a.name)).toEqual([
      'keep',
      'remove',
      'skip',
    ]);
    await fireEvent(name, 'accessibilityAction', { nativeEvent: { actionName: 'remove' } });
    expect(onDecide).toHaveBeenLastCalledWith('remove');
    await fireEvent(name, 'accessibilityAction', { nativeEvent: { actionName: 'skip' } });
    expect(onDecide).toHaveBeenLastCalledWith('skip');
    await fireEvent(name, 'accessibilityAction', { nativeEvent: { actionName: 'magicTap' } });
    expect(onDecide).toHaveBeenCalledTimes(2);
  });

  test('the invisible KEEP and REMOVE stamps are hidden from VoiceOver', async () => {
    const { toJSON } = await renderCard();
    // The scanner skips hidden subtrees, so their text never shows up in it;
    // check the stamps directly too.
    expect(a11yViolations(toJSON())).toEqual([]);
    const { queryByText } = await renderCard();
    expect(queryByText('KEEP')).toBeNull();
    expect(queryByText('REMOVE')).toBeNull();
    expect(queryByText('KEEP', { includeHiddenElements: true })).toBeTruthy();
  });
});
