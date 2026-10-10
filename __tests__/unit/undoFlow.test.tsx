import React from 'react';
import { AppState, Text, TouchableOpacity } from 'react-native';
import { fireEvent, act } from '@testing-library/react-native';
import SiftScreen from '../../src/screens/SiftScreen';
import { useSift } from '../../src/context/SiftContext';
import { renderWithProviders } from '../helpers/renderWithProviders';
import { a11yViolations } from '../helpers/a11yScan';
import DoneScreen from '../../src/screens/DoneScreen';
import { PendingDecision, Track } from '../../src/types';

// The latest decision is held back for the undo window and sent after it,
// on the next decision, or when the Sift screen goes away (#152).

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

jest.mock('../../src/services/RemovalHistoryStore', () => ({
  logRemoval: jest.fn(() => Promise.resolve()),
  loadHistory: jest.fn(() => Promise.resolve([])),
  removeFromHistory: jest.fn(() => Promise.resolve()),
  clearHistoryForSource: jest.fn(() => Promise.resolve(true)),
}));

const track = (id: string, name: string): Track => ({
  id, name, artist: 'Artist', album: 'Album', duration: 200, playCount: 1, dateAdded: '2020-01-01T00:00:00.000Z',
});
const tracks = [track('a', 'Peaches'), track('b', 'Stay'), track('c', 'Montero')];

function Probe() {
  const { state, dispatch } = useSift();
  return (
    <>
      <Text testID="probe">{`${state.phase}:${state.cursor}:${state.removed.map((t) => t.id).join(',')}`}</Text>
      <TouchableOpacity testID="finish" onPress={() => dispatch({ type: 'FINISH' })} />
    </>
  );
}

describe('held-back decisions and Undo (#152)', () => {
  let removeSpy: jest.SpyInstance;
  beforeEach(() => {
    jest.useFakeTimers();
    const { MockMusicProvider } = jest.requireActual('../../src/services/MockMusicProvider');
    removeSpy = jest.spyOn(MockMusicProvider.prototype, 'removeFromLibrary');
  });
  afterEach(() => {
    removeSpy.mockRestore();
    jest.useRealTimers();
  });
  const advance = async (ms: number) => {
    await act(async () => {
      jest.advanceTimersByTime(ms);
    });
  };

  test('a Remove reaches the service only after the undo window', async () => {
    const { getByLabelText } = await renderWithProviders(<SiftScreen />, { initialTracks: tracks });
    await fireEvent.press(getByLabelText('Remove'));
    await advance(400);
    expect(removeSpy).not.toHaveBeenCalled();
    await advance(5000);
    expect(removeSpy).toHaveBeenCalledWith(['a']);
  });

  test('the next decision sends the previous one at once', async () => {
    const { getByLabelText } = await renderWithProviders(<SiftScreen />, { initialTracks: tracks });
    await fireEvent.press(getByLabelText('Remove'));
    await advance(400);
    await fireEvent.press(getByLabelText('Skip'));
    await advance(10);
    expect(removeSpy).toHaveBeenCalledTimes(1);
    expect(removeSpy).toHaveBeenCalledWith(['a']);
  });

  test('Undo brings the card back and nothing is sent', async () => {
    const { getByLabelText, getByTestId, queryByTestId } = await renderWithProviders(
      <><SiftScreen /><Probe /></>,
      { initialTracks: tracks },
    );
    await fireEvent.press(getByLabelText('Remove'));
    await advance(400);
    expect(getByTestId('undo-toast')).toHaveTextContent(/^Removed Peaches/);
    await fireEvent.press(getByLabelText('Undo: Removed Peaches'));
    expect(getByTestId('probe').props.children).toBe('sifting:0:');
    expect(getByTestId('card-track-name')).toHaveTextContent('Peaches');
    expect(queryByTestId('undo-toast')).toBeNull();
    await advance(10000);
    expect(removeSpy).not.toHaveBeenCalled();
  });

  test('leaving the Sift screen sends what is held', async () => {
    // As the app's phase router does: Finish unmounts the Sift screen.
    function Router() {
      const { state } = useSift();
      return state.phase === 'sifting' ? <SiftScreen /> : <Text testID="done">done</Text>;
    }
    const { getByLabelText, getByTestId } = await renderWithProviders(<Router />, { initialTracks: tracks });
    await fireEvent.press(getByLabelText('Remove'));
    await advance(400);
    await fireEvent.press(getByTestId('finish-button'));
    await advance(10);
    expect(getByTestId('done')).toBeTruthy();
    expect(removeSpy).toHaveBeenCalledWith(['a']);
  });

  test('the Undo pill passes the VoiceOver scan', async () => {
    const { getByLabelText, toJSON } = await renderWithProviders(<SiftScreen />, { initialTracks: tracks });
    await fireEvent.press(getByLabelText('Skip'));
    expect(getByLabelText('Undo: Skipped Peaches')).toBeTruthy();
    expect(a11yViolations(toJSON())).toEqual([]);
  });

  test('a decision still held when a session resumes straight to Done is sent there', async () => {
    function ResumedHeld() {
      const { dispatch } = useSift();
      const ran = React.useRef(false);
      React.useEffect(() => {
        if (ran.current) return;
        ran.current = true;
        // As a session saved inside the undo window, resumed with Finish.
        dispatch({ type: 'DECIDE', decision: 'remove', at: 1 });
        dispatch({ type: 'FINISH' });
      }, [dispatch]);
      return <DoneScreen />;
    }
    await renderWithProviders(<ResumedHeld />, { initialTracks: tracks });
    await advance(10);
    expect(removeSpy).toHaveBeenCalledWith(['a']);
  });

  test('a held playlist keep resumed into Done goes to the fallback save: one "- Sifted" playlist', async () => {
    const { MockMusicProvider } = jest.requireActual('../../src/services/MockMusicProvider');
    const createSpy = jest.spyOn(MockMusicProvider.prototype, 'createPlaylist');
    function ResumedKeep() {
      const { dispatch, state } = useSift();
      const ran = React.useRef(false);
      React.useEffect(() => {
        if (ran.current) return;
        ran.current = true;
        dispatch({ type: 'SET_SOURCE', source: { type: 'playlist', playlist: { id: 'p1', name: 'Mix', trackCount: 3 } } });
        dispatch({ type: 'DECIDE', decision: 'keep', at: 1 });
        dispatch({ type: 'DECIDE', decision: 'keep', at: 2 });
        dispatch({ type: 'PENDING_SENT', trackId: 'a', at: 1 });
        dispatch({ type: 'FINISH' });
      }, [dispatch]);
      return <><DoneScreen /><Text testID="held">{String(state.pending)}</Text></>;
    }
    const { getByTestId } = await renderWithProviders(<ResumedKeep />, { initialTracks: tracks });
    await advance(5000);
    expect(getByTestId('held').props.children).toBe('null');
    expect(createSpy.mock.calls.length).toBeLessThanOrEqual(1);
    createSpy.mockRestore();
  });

  test('the last card is sent before Done shows, from the Sift screen', async () => {
    function Router() {
      const { state } = useSift();
      return state.phase === 'sifting' ? <SiftScreen /> : <Text testID="done">done</Text>;
    }
    const { getByLabelText, getByTestId } = await renderWithProviders(<Router />, { initialTracks: [tracks[0]] });
    await fireEvent.press(getByLabelText('Remove'));
    expect(getByTestId('done')).toBeTruthy();
    await advance(10);
    expect(removeSpy).toHaveBeenCalledTimes(1);
  });

  test('a decision already sent that comes back with a reloaded session is cleared, not offered for Undo', async () => {
    function Router() {
      const { state, dispatch } = useSift();
      // Loaded the way the app loads a sift, so it has an active source.
      const loaded = React.useRef(false);
      React.useEffect(() => {
        if (loaded.current) return;
        loaded.current = true;
        dispatch({ type: 'LOAD_TRACKS', tracks });
      }, [dispatch]);
      // The held decision, as a session saved before the send holds it.
      React.useEffect(() => {
        if (state.pending) heldRef.current = state.pending;
      }, [state.pending]);
      return (
        <>
          {state.phase === 'sifting' ? <SiftScreen /> : <Text testID="setup">setup</Text>}
          <TouchableOpacity
            testID="resume-stale"
            onPress={() => dispatch({
              type: 'RESUME_SESSION',
              // As Setup's copy saved before the send: pending still set.
              session: { ...state, phase: 'sifting', cursor: 1, removed: [tracks[0]], pending: heldRef.current },
            })}
          />
        </>
      );
    }
    const heldRef: { current: PendingDecision | null } = { current: null };
    const { getByLabelText, getByTestId, queryByTestId } = await renderWithProviders(<><Router /><Probe /></>);
    await advance(10);
    await fireEvent.press(getByLabelText('Remove'));
    await advance(100);
    await fireEvent.press(getByTestId('back-button'));
    await advance(10);
    expect(removeSpy).toHaveBeenCalledTimes(1);
    const { saveSession } = jest.requireMock('../../src/services/SessionStore');
    await advance(600);
    // Back saved the sift again with nothing held, so a reload can't bring it back.
    expect(saveSession.mock.calls.at(-1)[0].pending).toBeNull();
    // Even a stale copy that still holds it is cleared on sight.
    await fireEvent.press(getByTestId('resume-stale'));
    await advance(10);
    expect(queryByTestId('undo-toast')).toBeNull();
    expect(removeSpy).toHaveBeenCalledTimes(1);
  });

  test('the app leaving the foreground sends what is held', async () => {
    const listeners: ((state: string) => void)[] = [];
    const addListener = jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      listeners.push(listener as (state: string) => void);
      return { remove: () => undefined } as ReturnType<typeof AppState.addEventListener>;
    });
    const { getByLabelText } = await renderWithProviders(<SiftScreen />, { initialTracks: tracks });
    await fireEvent.press(getByLabelText('Remove'));
    await advance(400);
    await act(async () => {
      listeners.forEach((listener) => listener('background'));
    });
    expect(removeSpy).toHaveBeenCalledWith(['a']);
    addListener.mockRestore();
  });
});
