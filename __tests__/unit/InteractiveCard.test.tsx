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
import { a11yViolations } from '../helpers/a11yScan';

const mockTrack: Track = {
  id: '1', name: 'Test Track', artist: 'Test Artist', album: 'Test Album',
  duration: 200, playCount: 42, dateAdded: '2020-01-15T12:00:00.000Z',
  artworkURL: 'https://example.com/art.jpg',
};

async function renderCard(track = mockTrack, onDecide = jest.fn(), playsKnown?: boolean) {
  panOnUpdate = undefined;
  panOnEnd = undefined;
  return { ...(await render(
    <ThemeProvider>
      <InteractiveCard track={track} onDecide={onDecide} playsKnown={playsKnown} />
    </ThemeProvider>
  )), onDecide };
}

describe('InteractiveCard', () => {
  test('renders track name', async () => {
    const { getByTestId } = await renderCard();
    expect(getByTestId('card-track-name').props.children).toBe('Test Track');
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
    expect(getByTestId('card-play-count').props.children).toBe('Played 42\u00D7 \u00B7 Added Jan 2020');
    expect(getByTestId('card-play-count').props.accessibilityLabel).toBe('Played 42 times, added January 2020');
  });

  test('a provider without play counts shows only the add date', async () => {
    const { getByTestId } = await renderCard({ ...mockTrack, playCount: 0 }, jest.fn(), false);
    expect(getByTestId('card-play-count').props.children).toBe('Added Jan 2020');
  });

  test('hides the meta line when nothing is known', async () => {
    const { queryByTestId } = await renderCard({ ...mockTrack, playCount: 0, dateAdded: '' });
    expect(queryByTestId('card-play-count')).toBeNull();
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

  test('pan gesture below threshold does not trigger decision', async () => {
    const onDecide = jest.fn();
    await renderCard(mockTrack, onDecide);
    panOnEnd?.({ translationX: 30 });
    expect(onDecide).not.toHaveBeenCalled();
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
      </ThemeProvider>
    );
    expect(getByTestId('card-track-name').props.children).toBe('Test Track');
  });
});

describe('InteractiveCard VoiceOver (#146)', () => {
  test('Keep, Remove and Skip are actions on the song name', async () => {
    const { getByTestId, onDecide } = await renderCard();
    const name = getByTestId('card-track-name');
    expect(name.props.accessibilityActions.map((a: { name: string }) => a.name)).toEqual(['keep', 'remove', 'skip']);
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
