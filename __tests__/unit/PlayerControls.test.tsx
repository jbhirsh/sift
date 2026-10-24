import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { Track } from '../../src/types';

jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: jest.fn().mockReturnValue('light'),
}));

jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));
jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));

jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: {
    View: 'View',
    createAnimatedComponent: (comp: unknown) => comp,
  },
  useSharedValue: (val: number) => {
    // Mirrors Reanimated's SharedValue surface: .value plus get()/set().
    const sv = {
      value: val,
      get: () => sv.value,
      set: (v: number) => {
        sv.value = v;
      },
    };
    return sv;
  },
  useAnimatedStyle: (fn: () => unknown) => fn(),
  runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
}));

// Capture gesture callbacks
type GestureCallback = (event: Record<string, unknown>) => void;
let tapOnEnd: GestureCallback | undefined;
let panOnUpdate: GestureCallback | undefined;
let panOnFinalize: GestureCallback | undefined;

jest.mock('react-native-gesture-handler', () => ({
  GestureDetector: ({ children }: { children: React.ReactNode }) => children,
  Gesture: {
    Tap: () => ({
      onEnd: (fn: GestureCallback) => {
        tapOnEnd = fn;
        return {};
      },
    }),
    Pan: () => ({
      onUpdate: (fn: GestureCallback) => {
        panOnUpdate = fn;
        return {
          onFinalize: (fn: GestureCallback) => {
            panOnFinalize = fn;
            return {};
          },
        };
      },
    }),
    Race: () => ({}),
  },
}));

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

const mockPlay = jest.fn().mockResolvedValue(undefined);
const mockPause = jest.fn().mockResolvedValue(undefined);
const mockToggle = jest.fn().mockResolvedValue(undefined);
const mockSeek = jest.fn();
const mockSkipBackward = jest.fn();
const mockSkipForward = jest.fn();

jest.mock('../../src/hooks/useMusicProvider', () => ({
  useMusicProvider: () => ({
    play: mockPlay,
    pause: mockPause,
    togglePlayPause: mockToggle,
    seek: mockSeek,
    skipBackward: mockSkipBackward,
    skipForward: mockSkipForward,
  }),
}));

const mockTrack: Track = {
  id: '1',
  name: 'Track A',
  artist: 'Artist A',
  album: 'Album A',
  duration: 200,
  playCount: 10,
  dateAdded: '2020-01-01T00:00:00.000Z',
};

const mockState = {
  isPlaying: false,
  playbackPosition: 30,
  tracks: [mockTrack],
  cursor: 0,
  phase: 'sifting' as const,
  provider: 'apple-music' as const,
  kept: [] as Track[],
  removed: [] as Track[],
  skipped: [] as Track[],
  sortOrder: 'least-played' as const,
  loadProgress: 1,
  loadMessage: '',
  loadError: null,
  playbackFailedId: null as string | null,
  songCacheWarming: false,
  songCacheGeneration: 0,
};

jest.mock('../../src/context/SiftContext', () => ({
  useSift: () => ({
    state: mockState,
    currentTrack: mockTrack,
  }),
}));

jest.mock('../../src/theme/ThemeContext', () => ({
  useTheme: () => ({
    isDark: false,
    colors: {
      text: '#000',
      textSecondary: '#666',
      textTertiary: '#999',
      accent: '#007AFF',
      quaternary: 'rgba(0,0,0,0.04)',
      background: '#FFF',
      surface: '#F2F2F7',
      separator: 'rgba(0,0,0,0.1)',
    },
    glass: { tint: 'light', borderColor: 'rgba(255,255,255,0.5)' },
    gradientColors: () => ['#F2F2F7', '#FFFFFF'] as [string, string],
  }),
}));

import PlayerControls from '../../src/components/PlayerControls';

describe('PlayerControls', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    tapOnEnd = undefined;
    panOnUpdate = undefined;
    mockState.isPlaying = false;
    mockState.playbackPosition = 30;
    mockState.playbackFailedId = null;
    mockState.songCacheWarming = false;
    mockState.songCacheGeneration = 0;
  });

  describe("a song that won't play", () => {
    test('says so in place of the seek bar, offers Try Again, and tells VoiceOver', async () => {
      const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
      mockState.playbackPosition = 0;
      mockState.playbackFailedId = '1';
      const { getByTestId, getByText, queryByTestId } = await render(<PlayerControls />);
      expect(getByTestId('playback-failed')).toBeTruthy();
      expect(getByText('Can\u2019t play this song.')).toBeTruthy();
      expect(queryByTestId('seek-bar')).toBeNull();
      expect(announce).toHaveBeenCalledWith('Can\u2019t play this song.');
      mockPlay.mockClear();
      const retry = getByTestId('playback-retry');
      expect(retry.props.accessibilityRole).toBe('button');
      await fireEvent.press(retry);
      expect(mockPlay).toHaveBeenCalledWith('1');
      announce.mockRestore();
    });

    test('not while a resume is still caching songs, or for another card', async () => {
      mockState.playbackFailedId = '1';
      mockState.songCacheWarming = true;
      const { queryByTestId, rerender } = await render(<PlayerControls />);
      expect(queryByTestId('playback-failed')).toBeNull();
      expect(queryByTestId('seek-bar')).toBeTruthy();
      mockState.songCacheWarming = false;
      mockState.playbackFailedId = 'another';
      await rerender(<PlayerControls />);
      expect(queryByTestId('playback-failed')).toBeNull();
    });
  });

  describe('when a cache warm-up finishes', () => {
    test('a card that never started plays', async () => {
      mockState.playbackPosition = 0;
      const { rerender } = await render(<PlayerControls />);
      mockPlay.mockClear();
      mockState.songCacheGeneration = 1;
      await rerender(<PlayerControls />);
      expect(mockPlay).toHaveBeenCalledWith('1');
    });

    test('one already playing, or moved on from 0:00, is left alone', async () => {
      mockState.playbackPosition = 0;
      mockState.isPlaying = true;
      const { rerender } = await render(<PlayerControls />);
      mockPlay.mockClear();
      mockState.songCacheGeneration = 1;
      await rerender(<PlayerControls />);
      mockState.isPlaying = false;
      mockState.playbackPosition = 12;
      mockState.songCacheGeneration = 2;
      await rerender(<PlayerControls />);
      expect(mockPlay).not.toHaveBeenCalled();
    });

    test('nothing happens without a new warm-up', async () => {
      mockState.playbackPosition = 0;
      const { rerender } = await render(<PlayerControls />);
      mockPlay.mockClear();
      await rerender(<PlayerControls />);
      expect(mockPlay).not.toHaveBeenCalled();
    });
  });

  test('renders elapsed and duration time', async () => {
    const { getByTestId } = await render(<PlayerControls />);
    expect(getByTestId('elapsed-time')).toBeTruthy();
    expect(getByTestId('duration-time')).toBeTruthy();
  });

  test('VoiceOver: play/pause says which, and the seek bar is adjustable by 15 s (#146)', async () => {
    mockState.isPlaying = true;
    const { getByTestId, getByLabelText } = await render(<PlayerControls />);
    expect(getByTestId('play-pause-button').props.accessibilityLabel).toBe('Pause');
    expect(getByLabelText('Back 15 seconds')).toBeTruthy();
    expect(getByLabelText('Forward 15 seconds')).toBeTruthy();
    const bar = getByTestId('seek-bar');
    expect(bar.props.accessibilityRole).toBe('adjustable');
    expect(bar.props.accessibilityValue.text).toBe('0:30 of 3:20');
    await fireEvent(bar, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(mockSkipForward).toHaveBeenCalled();
    await fireEvent(bar, 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    expect(mockSkipBackward).toHaveBeenCalled();
  });

  test('renders play/pause button', async () => {
    const { getByTestId } = await render(<PlayerControls />);
    expect(getByTestId('play-pause-button')).toBeTruthy();
  });

  test('pressing play/pause calls play when not playing and position is 0', async () => {
    mockState.playbackPosition = 0;
    mockState.isPlaying = false;
    const { getByTestId } = await render(<PlayerControls />);
    await fireEvent.press(getByTestId('play-pause-button'));
    expect(mockPlay).toHaveBeenCalledWith('1');
  });

  test('pressing play/pause calls togglePlayPause when already started', async () => {
    mockState.playbackPosition = 30;
    mockState.isPlaying = false;
    const { getByTestId } = await render(<PlayerControls />);
    await fireEvent.press(getByTestId('play-pause-button'));
    expect(mockToggle).toHaveBeenCalled();
  });

  test('pressing play/pause calls togglePlayPause when isPlaying is true', async () => {
    mockState.playbackPosition = 30;
    mockState.isPlaying = true;
    const { getByTestId } = await render(<PlayerControls />);
    await fireEvent.press(getByTestId('play-pause-button'));
    expect(mockToggle).toHaveBeenCalled();
  });

  test('auto-plays track on mount', async () => {
    mockState.playbackPosition = 0;
    await render(<PlayerControls />);
    expect(mockPlay).toHaveBeenCalledWith('1');
  });

  test('pauses playback on unmount', async () => {
    const { unmount } = await render(<PlayerControls />);
    await unmount();
    expect(mockPause).toHaveBeenCalled();
  });

  test('tap gesture with zero slider width does not seek', async () => {
    await render(<PlayerControls />);
    expect(tapOnEnd).toBeDefined();
    tapOnEnd?.({ x: 100 });
    expect(mockSeek).not.toHaveBeenCalled();
  });

  test('pan gesture with zero slider width does not seek', async () => {
    await render(<PlayerControls />);
    expect(panOnUpdate).toBeDefined();
    panOnUpdate?.({ x: 50 });
    expect(mockSeek).not.toHaveBeenCalled();
  });

  test('tap gesture seeks to position after layout', async () => {
    const { container } = await render(<PlayerControls />);
    // Find slider container and trigger layout to set sliderWidth > 0
    const views = container.queryAll((v) => v.type === 'View');
    // The slider container is the View with onLayout prop
    const sliderContainer = views.find((v: { props: { onLayout?: unknown } }) => v.props.onLayout);
    if (sliderContainer) {
      await fireEvent(sliderContainer, 'layout', {
        nativeEvent: { layout: { width: 300, height: 30, x: 0, y: 0 } },
      });
    }
    expect(tapOnEnd).toBeDefined();
    tapOnEnd?.({ x: 150 });
    expect(mockSeek).toHaveBeenCalled();
  });

  test('pan gesture seeks to position after layout', async () => {
    const { container } = await render(<PlayerControls />);
    const views = container.queryAll((v) => v.type === 'View');
    const sliderContainer = views.find((v: { props: { onLayout?: unknown } }) => v.props.onLayout);
    if (sliderContainer) {
      await fireEvent(sliderContainer, 'layout', {
        nativeEvent: { layout: { width: 300, height: 30, x: 0, y: 0 } },
      });
    }
    expect(panOnUpdate).toBeDefined();
    panOnUpdate?.({ x: 100 });
    expect(mockSeek).toHaveBeenCalled();
  });

  test("a GIF recording's drawn ring follows a scrub and lets go with it; nothing otherwise", async () => {
    // The gesture's worklets take the switch as it was when it was built.
    await render(<PlayerControls />);
    panOnUpdate?.({ x: 100, absoluteX: 120, absoluteY: 600 });
    panOnFinalize?.({ absoluteX: 130, absoluteY: 601 });
    expect(mockFollowTouch).not.toHaveBeenCalled();
    expect(mockLiftTouch).not.toHaveBeenCalled();
    mockShowTouches = true;
    try {
      await render(<PlayerControls />);
      panOnUpdate?.({ x: 100, absoluteX: 120, absoluteY: 600 });
      panOnFinalize?.({ absoluteX: 130, absoluteY: 601 });
      expect(mockFollowTouch.mock.calls).toEqual([[120, 600]]);
      expect(mockLiftTouch.mock.calls).toEqual([[130, 601]]);
    } finally {
      mockShowTouches = false;
    }
  });
});
