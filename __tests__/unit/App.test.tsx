import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: jest.fn().mockReturnValue('light'),
}));

jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('expo-status-bar', () => ({ StatusBar: 'StatusBar' }));

jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: {
    View: 'View',
    createAnimatedComponent: (comp: unknown) => comp,
  },
  useSharedValue: (val: number) => ({ value: val }),
  useAnimatedStyle: (fn: () => unknown) => fn(),
  withTiming: (val: number) => val,
  withSpring: (val: number) => val,
  Easing: { in: (e: unknown) => e, ease: {} },
  interpolate: () => 0,
  runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
}));

jest.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: ({ children }: { children: React.ReactNode }) => children,
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
  init: jest.fn(),
  wrap: jest.fn((component: unknown) => component),
  setTag: jest.fn(),
  setContext: jest.fn(),
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
  reactNativeTracingIntegration: jest.fn(),
  mobileReplayIntegration: jest.fn(),
}));

jest.mock('../../src/services/SessionStore', () => ({
  hasSession: jest.fn().mockResolvedValue(false),
  saveSession: jest.fn().mockResolvedValue(undefined),
  loadSession: jest.fn().mockResolvedValue(null),
  clearSession: jest.fn().mockResolvedValue(undefined),
}));

const mockProviderInstance = {
  requestAuthorization: jest.fn().mockResolvedValue(true),
  isAuthorized: jest.fn().mockResolvedValue(true),
  loadLibrary: jest.fn().mockResolvedValue([
    { id: '1', name: 'A', artist: 'B', album: 'C', duration: 100, playCount: 1, dateAdded: '2020-01-01' },
    { id: '2', name: 'D', artist: 'E', album: 'F', duration: 120, playCount: 2, dateAdded: '2020-01-02' },
  ]),
  play: jest.fn().mockResolvedValue(undefined),
  pause: jest.fn().mockResolvedValue(undefined),
  resume: jest.fn().mockResolvedValue(undefined),
  seek: jest.fn(),
  getPlaybackState: jest.fn().mockReturnValue({ position: 0, isPlaying: false }),
  createPlaylist: jest.fn().mockResolvedValue(undefined),
};

jest.mock('../../src/services', () => ({
  createMusicProvider: jest.fn(() => mockProviderInstance),
}));

jest.mock('../../src/hooks/useResolvedArtwork', () => ({
  useResolvedArtwork: jest.fn().mockReturnValue(null),
}));

import App from '../../src/App';

const mockInsets = { top: 0, bottom: 0, left: 0, right: 0 };
const mockFrame = { x: 0, y: 0, width: 390, height: 844 };

function renderApp() {
  return render(
    <SafeAreaProvider initialMetrics={{ insets: mockInsets, frame: mockFrame }}>
      <App />
    </SafeAreaProvider>
  );
}

describe('App', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProviderInstance.loadLibrary.mockResolvedValue([
      { id: '1', name: 'A', artist: 'B', album: 'C', duration: 100, playCount: 1, dateAdded: '2020-01-01' },
      { id: '2', name: 'D', artist: 'E', album: 'F', duration: 120, playCount: 2, dateAdded: '2020-01-02' },
    ]);
  });

  test('renders SetupScreen initially', () => {
    const { getByTestId } = renderApp();
    expect(getByTestId('setup-brand')).toBeTruthy();
  });

  test('does not show settings button on setup phase', () => {
    const { queryByTestId } = renderApp();
    expect(queryByTestId('settings-button')).toBeNull();
  });

  test('renders without crashing', () => {
    const { toJSON } = renderApp();
    expect(toJSON()).toBeTruthy();
  });

  test('shows settings button after leaving setup phase', async () => {
    const { getByText, getByTestId, queryByTestId } = renderApp();
    expect(queryByTestId('settings-button')).toBeNull();

    await act(async () => {
      fireEvent.press(getByText('Start Sifting'));
    });
    await act(async () => {});

    // Settings button visible in sifting (loading is transient with instant mock)
    expect(getByTestId('settings-button')).toBeTruthy();
  });

  test('transitions to sifting phase after loading', async () => {
    const { getByText, getByTestId } = renderApp();

    await act(async () => {
      fireEvent.press(getByText('Start Sifting'));
    });
    await act(async () => {});

    expect(getByTestId('remaining-count')).toBeTruthy();
    expect(getByTestId('settings-button')).toBeTruthy();
  });

  test('settings button opens modal', async () => {
    const { getByText, getByTestId } = renderApp();

    await act(async () => {
      fireEvent.press(getByText('Start Sifting'));
    });
    await act(async () => {});

    fireEvent.press(getByTestId('settings-button'));
    expect(getByTestId('settings-modal').props.visible).toBe(true);
  });

  test('modal onRequestClose closes the modal', async () => {
    const { getByText, getByTestId, queryByTestId } = renderApp();

    await act(async () => {
      fireEvent.press(getByText('Start Sifting'));
    });
    await act(async () => {});

    // Open modal
    await act(async () => {
      fireEvent.press(getByTestId('settings-button'));
    });
    const modal = getByTestId('settings-modal');
    expect(modal.props.visible).toBe(true);

    // Close via onRequestClose — modal disappears from tree when visible=false
    await act(async () => {
      modal.props.onRequestClose();
    });
    expect(queryByTestId('settings-modal')).toBeNull();
  });

  test('transitions to done phase when all tracks sifted', async () => {
    const { getByText, getByLabelText } = renderApp();

    await act(async () => {
      fireEvent.press(getByText('Start Sifting'));
    });
    await act(async () => {});

    fireEvent.press(getByLabelText('Skip'));
    fireEvent.press(getByLabelText('Skip'));

    expect(getByText('Start Over')).toBeTruthy();
  });

  test('transitions to paused phase when stop is pressed', async () => {
    const { getByText, getByTestId } = renderApp();

    await act(async () => {
      fireEvent.press(getByText('Start Sifting'));
    });
    await act(async () => {});

    fireEvent.press(getByTestId('stop-button'));

    expect(getByText('Resume Session')).toBeTruthy();
  });
});
