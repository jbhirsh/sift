import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Track } from '../../src/types';

jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: jest.fn().mockReturnValue('light'),
}));

jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));
jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));

jest.mock('react-native-reanimated', () => {
  const View = require('react-native').View;
  return {
    __esModule: true,
    default: {
      View,
      createAnimatedComponent: (comp: unknown) => comp,
    },
    useSharedValue: (val: number) => ({ value: val }),
    useAnimatedStyle: (fn: () => unknown) => fn(),
    runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
  };
});

jest.mock('react-native-gesture-handler', () => {
  const View = require('react-native').View;
  return {
    GestureDetector: ({ children }: { children: React.ReactNode }) => children,
    Gesture: {
      Tap: () => ({ onEnd: () => ({}) }),
      Pan: () => ({ onUpdate: () => ({}) }),
      Race: () => ({}),
    },
  };
});

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
  hasSavedSession: false,
  removalPlaylistCreated: false,
  removalPlaylistError: null,
  isCreatingPlaylist: false,
  connectionStatus: 'unknown' as const,
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
  });

  test('renders elapsed and duration time', () => {
    const { getByTestId } = render(<PlayerControls />);
    expect(getByTestId('elapsed-time')).toBeTruthy();
    expect(getByTestId('duration-time')).toBeTruthy();
  });

  test('renders play/pause button', () => {
    const { getByTestId } = render(<PlayerControls />);
    expect(getByTestId('play-pause-button')).toBeTruthy();
  });

  test('pressing play/pause calls play when not playing and position is 0', () => {
    mockState.playbackPosition = 0;
    mockState.isPlaying = false;
    const { getByTestId } = render(<PlayerControls />);
    fireEvent.press(getByTestId('play-pause-button'));
    expect(mockPlay).toHaveBeenCalledWith('1');
  });

  test('pressing play/pause calls togglePlayPause when already started', () => {
    mockState.playbackPosition = 30;
    mockState.isPlaying = false;
    const { getByTestId } = render(<PlayerControls />);
    fireEvent.press(getByTestId('play-pause-button'));
    expect(mockToggle).toHaveBeenCalled();
  });

  test('auto-plays track on mount', () => {
    mockState.playbackPosition = 0;
    render(<PlayerControls />);
    expect(mockPlay).toHaveBeenCalledWith('1');
  });
});
