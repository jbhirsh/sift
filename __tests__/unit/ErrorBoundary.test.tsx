import React, { useState } from 'react';
import { Pressable, Text } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { ErrorBoundary } from '../../src/components/ErrorBoundary';
import { ThemeProvider } from '../../src/theme/ThemeContext';
import { SiftProvider, useSift } from '../../src/context/SiftContext';

jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: jest.fn().mockReturnValue('light'),
}));

jest.mock('@sentry/react-native', () => ({
  captureException: jest.fn(),
  setTag: jest.fn(),
  setContext: jest.fn(),
  addBreadcrumb: jest.fn(),
}));

jest.mock('../../src/services/SessionStore', () => ({
  saveSession: jest.fn(),
  clearSession: jest.fn(),
}));

const Sentry = jest.requireMock('@sentry/react-native');

let shouldThrow = false;
let mounts = 0;

function Bomb() {
  // Counts mounts (not renders) so a test can tell a remount from a re-render.
  useState(() => {
    mounts += 1;
    return null;
  });
  if (shouldThrow) throw new Error('render exploded');
  return <Text>healthy</Text>;
}

/** Reads and changes Sift state, and can be told to crash on next render. */
function SiftProbe() {
  const { state, dispatch } = useSift();
  if (shouldThrow) throw new Error('render exploded');
  return (
    <>
      <Text testID="provider">{state.provider}</Text>
      <Pressable
        testID="pick-spotify"
        onPress={() => dispatch({ type: 'SET_PROVIDER', provider: 'spotify' })}
      />
    </>
  );
}

function renderInBoundary(children: React.ReactNode) {
  return render(
    <ThemeProvider>
      <ErrorBoundary>{children}</ErrorBoundary>
    </ThemeProvider>,
  );
}

let consoleError: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  shouldThrow = false;
  mounts = 0;
  // React logs every caught render error; keep the test output readable.
  consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
});

describe('ErrorBoundary', () => {
  test('renders its children when nothing throws', async () => {
    const { getByText, queryByTestId } = await renderInBoundary(<Bomb />);

    expect(getByText('healthy')).toBeTruthy();
    expect(queryByTestId('error-fallback')).toBeNull();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  test('shows the fallback and reports to Sentry when a child throws', async () => {
    shouldThrow = true;
    const { getByText, getByTestId } = await renderInBoundary(<Bomb />);

    expect(getByTestId('error-fallback')).toBeTruthy();
    expect(getByText('Something went wrong')).toBeTruthy();
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'render exploded' }),
      {
        tags: { flow: 'render' },
        contexts: { react: { componentStack: expect.any(String) } },
      },
    );
  });

  test('Restart remounts the children', async () => {
    shouldThrow = true;
    const { getByText, getByTestId, queryByTestId } = await renderInBoundary(<Bomb />);
    const mountsBeforeRestart = mounts;

    shouldThrow = false;
    await fireEvent.press(getByTestId('error-restart'));

    expect(getByText('healthy')).toBeTruthy();
    expect(queryByTestId('error-fallback')).toBeNull();
    expect(mounts).toBe(mountsBeforeRestart + 1);
  });

  test('Restart starts Sift over with fresh state', async () => {
    const { getByTestId } = await renderInBoundary(
      <SiftProvider>
        <SiftProbe />
      </SiftProvider>,
    );
    const initialProvider = getByTestId('provider').props.children;
    await fireEvent.press(getByTestId('pick-spotify'));
    expect(getByTestId('provider')).toHaveTextContent('spotify');
    expect(initialProvider).not.toBe('spotify');

    // Crash on the next render…
    shouldThrow = true;
    await fireEvent.press(getByTestId('pick-spotify'));
    expect(getByTestId('error-fallback')).toBeTruthy();

    // …and Restart brings back a fresh provider, not the crashed state.
    shouldThrow = false;
    await fireEvent.press(getByTestId('error-restart'));
    expect(getByTestId('provider')).toHaveTextContent(initialProvider);
  });
});
