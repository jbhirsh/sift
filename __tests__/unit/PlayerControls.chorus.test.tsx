import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { Track } from '../../src/types';

jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: jest.fn().mockReturnValue('light'),
}));
jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));
jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: 'View', createAnimatedComponent: (comp: unknown) => comp },
  useSharedValue: (val: number) => {
    const sv = { value: val, get: () => sv.value, set: (v: number) => { sv.value = v; } };
    return sv;
  },
  useAnimatedStyle: (fn: () => unknown) => fn(),
  runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
}));
jest.mock('react-native-gesture-handler', () => ({
  GestureDetector: ({ children }: { children: React.ReactNode }) => children,
  Gesture: {
    Tap: () => ({ onEnd: () => ({}) }),
    Pan: () => ({ onUpdate: () => ({}) }),
    Race: () => ({}),
  },
}));

const mockPlay = jest.fn().mockResolvedValue(undefined);
const mockPreviewOffset = jest.fn();
jest.mock('../../src/hooks/useMusicProvider', () => ({
  useMusicProvider: () => ({
    play: mockPlay,
    pause: jest.fn().mockResolvedValue(undefined),
    togglePlayPause: jest.fn(),
    seek: jest.fn(),
    skipBackward: jest.fn(),
    skipForward: jest.fn(),
    previewOffset: mockPreviewOffset,
  }),
}));

const mockChorus = { enabled: true, startPositionFor: jest.fn() };
const mockUseChorusStart = jest.fn((_previewOffset?: unknown) => mockChorus);
jest.mock('../../src/hooks/useChorusStart', () => ({
  useChorusStart: (previewOffset: unknown) => mockUseChorusStart(previewOffset),
}));

const trackA: Track = {
  id: 'a', name: 'Track A', artist: 'Artist', album: 'Album',
  duration: 200, playCount: 0, dateAdded: '',
};
const trackB: Track = { ...trackA, id: 'b', name: 'Track B' };

const mockSift = {
  state: { isPlaying: false, playbackPosition: 0 },
  currentTrack: trackA as Track,
};
jest.mock('../../src/context/SiftContext', () => ({
  useSift: () => mockSift,
}));
jest.mock('../../src/theme/ThemeContext', () => ({
  useTheme: () => ({
    colors: { text: '#000', textSecondary: '#666', textTertiary: '#999', accent: '#007AFF', quaternary: 'rgba(0,0,0,0.04)' },
    glass: { tint: 'light', borderColor: 'rgba(255,255,255,0.5)' },
  }),
}));

import PlayerControls from '../../src/components/PlayerControls';

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockChorus.enabled = true;
  mockSift.currentTrack = trackA;
  mockSift.state = { isPlaying: false, playbackPosition: 0 };
});

describe('PlayerControls with "Start at chorus"', () => {
  it('passes the provider preview lookup to the chorus hook', async () => {
    mockChorus.startPositionFor.mockResolvedValue(42);
    await render(<PlayerControls />);
    expect(mockUseChorusStart).toHaveBeenCalledWith(mockPreviewOffset);
  });

  it('starts the current track at its chorus', async () => {
    mockChorus.startPositionFor.mockResolvedValue(42.5);
    await render(<PlayerControls />);
    await act(async () => {});
    expect(mockChorus.startPositionFor).toHaveBeenCalledWith(trackA);
    expect(mockPlay).toHaveBeenCalledTimes(1);
    expect(mockPlay).toHaveBeenCalledWith('a', 42.5);
  });

  it('starts at 0:00 without asking for a chorus when the setting is off', async () => {
    mockChorus.enabled = false;
    await render(<PlayerControls />);
    expect(mockChorus.startPositionFor).not.toHaveBeenCalled();
    expect(mockPlay).toHaveBeenCalledWith('a');
  });

  it('drops a chorus that resolves after the card was swiped away', async () => {
    const slow = deferred<number>();
    mockChorus.startPositionFor.mockImplementation((t: Track) => (t.id === 'a' ? slow.promise : Promise.resolve(30)));
    const { rerender } = await render(<PlayerControls />);
    mockSift.currentTrack = trackB;
    await rerender(<PlayerControls />);
    await act(async () => {});
    await act(async () => slow.resolve(55));
    expect(mockPlay).toHaveBeenCalledTimes(1);
    expect(mockPlay).toHaveBeenCalledWith('b', 30);
  });

  it('does not start playback after the player is gone', async () => {
    const slow = deferred<number>();
    mockChorus.startPositionFor.mockReturnValue(slow.promise);
    const { unmount } = await render(<PlayerControls />);
    await unmount();
    await act(async () => slow.resolve(55));
    expect(mockPlay).not.toHaveBeenCalled();
  });

  it('play on a track that never started starts it at its chorus', async () => {
    const never = deferred<number>();
    mockChorus.startPositionFor.mockReturnValueOnce(never.promise).mockResolvedValueOnce(42);
    const { getByTestId } = await render(<PlayerControls />);
    await fireEvent.press(getByTestId('play-pause-button'));
    await act(async () => {});
    expect(mockPlay).toHaveBeenCalledWith('a', 42);
  });
});
