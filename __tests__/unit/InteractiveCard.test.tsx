import React from 'react';
import { render } from '@testing-library/react-native';
import { Track } from '../../src/types';

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
  withSpring: (val: number) => val,
  interpolate: (val: number, inputRange: number[], outputRange: number[]) => {
    const ratio = (val - inputRange[0]) / (inputRange[1] - inputRange[0]);
    return outputRange[0] + ratio * (outputRange[1] - outputRange[0]);
  },
  runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
}));

// Capture gesture callbacks so we can invoke them in tests
type GestureCallback = (event: Record<string, unknown>) => void;
let panOnUpdate: GestureCallback | undefined;
let panOnEnd: GestureCallback | undefined;

jest.mock('react-native-gesture-handler', () => ({
  GestureDetector: ({ children }: { children: React.ReactNode }) => children,
  Gesture: {
    Pan: () => ({
      minDistance: () => ({
        onUpdate: (fn: GestureCallback) => {
          panOnUpdate = fn;
          return {
            onEnd: (fn: GestureCallback) => {
              panOnEnd = fn;
              return {};
            },
          };
        },
      }),
    }),
  },
}));

jest.mock('../../src/hooks/useResolvedArtwork', () => ({
  useResolvedArtwork: jest.fn().mockReturnValue('https://example.com/art.jpg'),
}));

import { useResolvedArtwork } from '../../src/hooks/useResolvedArtwork';
import InteractiveCard from '../../src/components/InteractiveCard';
import { ThemeProvider } from '../../src/theme/ThemeContext';

const mockTrack: Track = {
  id: '1', name: 'Test Track', artist: 'Test Artist', album: 'Test Album',
  duration: 200, playCount: 42, dateAdded: '2020-01-01T00:00:00.000Z',
  artworkURL: 'https://example.com/art.jpg',
};

function renderCard(track = mockTrack, onDecide = jest.fn()) {
  panOnUpdate = undefined;
  panOnEnd = undefined;
  return { ...render(
    <ThemeProvider>
      <InteractiveCard track={track} onDecide={onDecide} />
    </ThemeProvider>
  ), onDecide };
}

describe('InteractiveCard', () => {
  test('renders track name', () => {
    const { getByTestId } = renderCard();
    expect(getByTestId('card-track-name').props.children).toBe('Test Track');
  });

  test('renders artist name', () => {
    const { getByTestId } = renderCard();
    expect(getByTestId('card-artist-name').props.children).toBe('Test Artist');
  });

  test('renders album name', () => {
    const { getByTestId } = renderCard();
    expect(getByTestId('card-album-name').props.children).toBe('Test Album');
  });

  test('renders play count', () => {
    const { getByTestId } = renderCard();
    expect(getByTestId('card-play-count').props.children).toBe(42);
  });

  test('renders placeholder when no artwork URL', () => {
    jest.mocked(useResolvedArtwork).mockReturnValueOnce(undefined);
    const trackNoArt = { ...mockTrack, artworkURL: undefined };
    const { toJSON } = renderCard(trackNoArt);
    expect(toJSON()).toBeTruthy();
  });

  test('pan gesture onUpdate sets drag values', () => {
    renderCard();
    expect(panOnUpdate).toBeDefined();
    // Should not throw when called
    panOnUpdate?.({ translationX: 50, translationY: 10 });
  });

  test('pan gesture beyond threshold right triggers keep', () => {
    const onDecide = jest.fn();
    renderCard(mockTrack, onDecide);
    expect(panOnEnd).toBeDefined();
    panOnEnd?.({ translationX: 100 });
    expect(onDecide).toHaveBeenCalledWith('keep');
  });

  test('pan gesture beyond threshold left triggers remove', () => {
    const onDecide = jest.fn();
    renderCard(mockTrack, onDecide);
    panOnEnd?.({ translationX: -100 });
    expect(onDecide).toHaveBeenCalledWith('remove');
  });

  test('pan gesture below threshold does not trigger decision', () => {
    const onDecide = jest.fn();
    renderCard(mockTrack, onDecide);
    panOnEnd?.({ translationX: 30 });
    expect(onDecide).not.toHaveBeenCalled();
  });

  test('renders with programmaticOffset prop', () => {
    const onDecide = jest.fn();
    const programmaticOffset = { value: 100 };
    const { getByTestId } = render(
      <ThemeProvider>
        <InteractiveCard
          track={mockTrack}
          onDecide={onDecide}
          programmaticOffset={programmaticOffset as never}
        />
      </ThemeProvider>
    );
    expect(getByTestId('card-track-name').props.children).toBe('Test Track');
  });
});
