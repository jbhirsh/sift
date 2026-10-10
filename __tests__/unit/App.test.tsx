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
import * as Sentry from '@sentry/react-native';
import { scrubBreadcrumb, scrubEvent } from '../../src/utils/sentryScrub';
import { a11yViolations } from '../helpers/a11yScan';

// Captured at import, before any beforeEach clears the mock: App configures
// Sentry once, at module load.
const sentryConfig = (Sentry.init as jest.Mock).mock.calls[0]?.[0];
const replayCallsAtImport = (Sentry.mobileReplayIntegration as jest.Mock).mock.calls.length;

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

  test('Sentry collects only what crash diagnosis needs and scrubs names (#147)', () => {
    expect(sentryConfig).toMatchObject({
      sendDefaultPii: false,
      beforeBreadcrumb: scrubBreadcrumb,
      beforeSend: scrubEvent,
      beforeSendTransaction: scrubEvent,
    });
    expect(sentryConfig.tracesSampleRate).toBeLessThanOrEqual(0.05);
    // No session replay, profiling or log capture.
    expect(sentryConfig).not.toHaveProperty('replaysSessionSampleRate');
    expect(sentryConfig).not.toHaveProperty('replaysOnErrorSampleRate');
    expect(sentryConfig).not.toHaveProperty('profilesSampleRate');
    expect(sentryConfig).not.toHaveProperty('enableLogs');
    expect(replayCallsAtImport).toBe(0);
    expect(sentryConfig.integrations).toHaveLength(1);
    // No trace headers to other services, and no native network breadcrumbs
    // (native crash reports skip the scrubber).
    expect(sentryConfig.tracePropagationTargets).toEqual([]);
    expect(sentryConfig.enableNetworkBreadcrumbs).toBe(false);
  });

  test('renders SetupScreen initially', async () => {
    const { getByTestId } = await renderApp();
    expect(getByTestId('setup-brand')).toBeTruthy();
  });

  test('shows the settings button on the setup phase (#138)', async () => {
    const { getByTestId } = await renderApp();
    expect(getByTestId('settings-button')).toBeTruthy();
  });

  test('settings opens from setup and its Done button closes it', async () => {
    const { getByTestId, queryByTestId } = await renderApp();
    await act(async () => {
      await fireEvent.press(getByTestId('settings-button'));
    });
    expect(getByTestId('settings-modal').props.visible).toBe(true);
    await act(async () => {
      await fireEvent.press(getByTestId('settings-done-button'));
    });
    expect(queryByTestId('settings-done-button')).toBeNull();
  });

  test('renders without crashing', async () => {
    const { toJSON } = await renderApp();
    expect(toJSON()).toBeTruthy();
  });

  test('keeps the settings button after leaving setup phase', async () => {
    const { getByText, getByTestId } = await renderApp();

    await act(async () => {
      await fireEvent.press(getByText('Start Sifting'));
    });
    await act(async () => {});

    // Settings button visible in sifting (loading is transient with instant mock)
    expect(getByTestId('settings-button')).toBeTruthy();
  });

  test('transitions to sifting phase after loading', async () => {
    const { getByText, getByTestId } = await renderApp();

    await act(async () => {
      await fireEvent.press(getByText('Start Sifting'));
    });
    await act(async () => {});

    expect(getByTestId('remaining-count')).toBeTruthy();
    expect(getByTestId('settings-button')).toBeTruthy();
  });

  test('settings button opens modal', async () => {
    const { getByText, getByTestId } = await renderApp();

    await act(async () => {
      await fireEvent.press(getByText('Start Sifting'));
    });
    await act(async () => {});

    await fireEvent.press(getByTestId('settings-button'));
    expect(getByTestId('settings-modal').props.visible).toBe(true);
  });

  test('modal onRequestClose closes the modal', async () => {
    const { getByText, getByTestId, queryByTestId } = await renderApp();

    await act(async () => {
      await fireEvent.press(getByText('Start Sifting'));
    });
    await act(async () => {});

    // Open modal
    await act(async () => {
      await fireEvent.press(getByTestId('settings-button'));
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
    jest.useFakeTimers();
    try {
      const { getByText, getByLabelText } = await renderApp();

      await act(async () => {
        await fireEvent.press(getByText('Start Sifting'));
      });
      await act(async () => {});

      // Skip decisions hold the double-decide guard for a 300ms settle
      // window, so advance past it between presses.
      await fireEvent.press(getByLabelText('Skip'));
      await act(() => {
        jest.advanceTimersByTime(400);
      });
      await fireEvent.press(getByLabelText('Skip'));

      expect(getByText('Start Over')).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  test('back button returns to setup', async () => {
    const { getByText, getByTestId } = await renderApp();

    await act(async () => {
      await fireEvent.press(getByText('Start Sifting'));
    });
    await act(async () => {});

    await fireEvent.press(getByTestId('back-button'));

    expect(getByText('Resume Sifting')).toBeTruthy();
  });
});

describe('VoiceOver scan (#146)', () => {
  test('the app shell on Setup, settings gear included', async () => {
    const { toJSON } = await renderApp();
    expect(a11yViolations(toJSON())).toEqual([]);
  });
});
