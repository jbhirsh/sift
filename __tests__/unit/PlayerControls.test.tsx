import React from 'react';
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
    const sv = { value: val, get: () => sv.value, set: (v: number) => { sv.value = v; } };
    return sv;
  },
  useAnimatedStyle: (fn: () => unknown) => fn(),
  runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
}));

// Capture gesture callbacks
type GestureCallback = (event: Record<string, unknown>) => void;
let tapOnEnd: GestureCallback | undefined;
let panOnUpdate: GestureCallback | undefined;

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
        return {};
      },
    }),
    Race: () => ({}),
  },
}));

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
  id: '1', name: 'Track A', artist: 'Artist A', album: 'Album A',
  duration: 200, playCount: 10, dateAdded: '2020-01-01T00:00:00.000Z',
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
  removalPlaylistCreated: false,
  removalPlaylistError: null,
  isCreatingPlaylist: false,
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
      text: '#000', textSecondary: '#666', textTertiary: '#999',
      accent: '#007AFF', quaternary: 'rgba(0,0,0,0.04)',
      background: '#FFF', surface: '#F2F2F7', separator: 'rgba(0,0,0,0.1)',
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
  });

  test('renders elapsed and duration time', async () => {
    const { getByTestId } = await render(<PlayerControls />);
    expect(getByTestId('elapsed-time')).toBeTruthy();
    expect(getByTestId('duration-time')).toBeTruthy();
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
    const sliderContainer = views.find(
      (v: { props: { onLayout?: unknown } }) => v.props.onLayout,
    );
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
    const sliderContainer = views.find(
      (v: { props: { onLayout?: unknown } }) => v.props.onLayout,
    );
    if (sliderContainer) {
      await fireEvent(sliderContainer, 'layout', {
        nativeEvent: { layout: { width: 300, height: 30, x: 0, y: 0 } },
      });
    }
    expect(panOnUpdate).toBeDefined();
    panOnUpdate?.({ x: 100 });
    expect(mockSeek).toHaveBeenCalled();
  });
});
