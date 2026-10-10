import React from 'react';
import { TouchableOpacity } from 'react-native';
import { fireEvent, act } from '@testing-library/react-native';
import SiftScreen from '../../src/screens/SiftScreen';
import { useSift } from '../../src/context/SiftContext';
import { renderWithProviders } from '../helpers/renderWithProviders';
import { Track } from '../../src/types';

// The Sift screen and its player controls each call useMusicProvider. Each
// call used to own a provider instance and a poller; with the real mock
// provider (one player per instance), the screen's idle instance reported 0
// and overwrote the position, so the clock stuck at 0:00 and E2E flow 12
// failed. Now they share one provider and one poller (#144).

jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: jest.fn(() => 'light'),
}));
jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: 'View', createAnimatedComponent: (comp: unknown) => comp },
  useSharedValue: (val: number) => ({ value: val, set(v: number) { this.value = v; } }),
  useAnimatedStyle: (fn: () => unknown) => fn(),
  withTiming: (val: number, _config: unknown, callback?: (finished: boolean) => void) => {
    if (callback) callback(true);
    return val;
  },
  withSpring: (val: number) => val,
  Easing: { in: (e: unknown) => e, ease: {} },
  interpolate: () => 0,
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
// The real mock provider, a new instance per call, as in the E2E build.
jest.mock('../../src/services', () => {
  const { MockMusicProvider } = jest.requireActual('../../src/services/MockMusicProvider');
  return { createMusicProvider: jest.fn(() => new MockMusicProvider()) };
});
jest.mock('../../src/services/SessionStore', () => ({
  hasSession: jest.fn().mockResolvedValue(false),
  saveSession: jest.fn().mockResolvedValue(undefined),
  loadSession: jest.fn().mockResolvedValue(null),
  clearSession: jest.fn().mockResolvedValue(undefined),
}));

const track = (id: string, name: string): Track => ({
  id, name, artist: 'Artist', album: 'Album', duration: 200, playCount: 1, dateAdded: '2020-01-01T00:00:00.000Z',
});

function ChorusOn() {
  const { setStartAtChorus } = useSift();
  return <TouchableOpacity testID="chorus-on" onPress={() => setStartAtChorus(true)} />;
}

const toSeconds = (clock: string) => {
  const [m, s] = clock.split(':').map(Number);
  return m * 60 + s;
};

describe('playback position with one shared provider', () => {
  let fetchBefore: typeof globalThis.fetch;
  beforeEach(() => {
    jest.useFakeTimers();
    fetchBefore = globalThis.fetch;
    // No LRCLIB in tests: the chorus falls back to its estimate.
    globalThis.fetch = jest.fn(() => Promise.reject(new Error('offline')));
  });
  afterEach(() => {
    globalThis.fetch = fetchBefore;
    jest.useRealTimers();
  });

  test('the clock follows the playing song, at its chorus after a skip', async () => {
    const { getByTestId, getByLabelText } = await renderWithProviders(
      <><SiftScreen /><ChorusOn /></>,
      { initialTracks: [track('a', 'Peaches'), track('b', 'drivers license'), track('c', 'Montero')] },
    );
    const elapsed = () => toSeconds(String(getByTestId('elapsed-time').props.children));
    const advance = async (ms: number) => {
      await act(async () => {
        jest.advanceTimersByTime(ms);
      });
    };

    await advance(3000);
    expect(elapsed()).toBeGreaterThanOrEqual(2);

    await fireEvent.press(getByTestId('chorus-on'));
    await fireEvent.press(getByLabelText('Skip'));
    // The chorus estimate (20% of 200 s) lands within CHORUS_WAIT_MS.
    await advance(3000);
    expect(elapsed()).toBeGreaterThanOrEqual(13);
  });

  test('one provider for every screen, and a skip ahead holds while playing (#144)', async () => {
    const { createMusicProvider } = jest.requireMock('../../src/services');
    (createMusicProvider as jest.Mock).mockClear();
    const { getByTestId, getByLabelText } = await renderWithProviders(
      <SiftScreen />,
      { initialTracks: [track('a', 'Peaches'), track('b', 'drivers license')] },
    );
    const elapsed = () => toSeconds(String(getByTestId('elapsed-time').props.children));
    const advance = async (ms: number) => {
      await act(async () => {
        jest.advanceTimersByTime(ms);
      });
    };
    await advance(2000);
    const before = elapsed();
    await fireEvent.press(getByLabelText('Forward 15 seconds'));
    // Several polls later the position is still past the jump: no other
    // instance reports its own idle player over it.
    await advance(2000);
    expect(elapsed()).toBeGreaterThanOrEqual(before + 15);
    expect(createMusicProvider).toHaveBeenCalledTimes(1);
  });
});
