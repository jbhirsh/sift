import React from 'react';
import * as ReactNative from 'react-native';
import { Text } from 'react-native';
import { act, render } from '@testing-library/react-native';

// Whether this launch asked for a reset, and the reset itself: switches here.
let mockResetRequested = false;
let finishReset: () => void = () => {};
let failReset: (err: Error) => void = () => {};
const mockReset = jest.fn(
  () =>
    new Promise<void>((resolve, reject) => {
      finishReset = resolve;
      failReset = reject;
    }),
);
const mockTrace = jest.fn();
jest.mock('../../src/services/e2eReset', () =>
  Object.defineProperties(
    {},
    {
      resetRequested: { get: () => mockResetRequested },
      resetAppData: { value: () => mockReset() },
    },
  ),
);
jest.mock('../../src/services/trace', () => ({
  trace: (...args: unknown[]) => mockTrace(...args),
}));

let ResetGate: typeof import('../../src/components/ResetGate').default;

const app = () => (
  <ResetGate>
    <Text>the app</Text>
  </ResetGate>
);

beforeEach(() => {
  // A fresh module each test: the gate resets once per launch.
  jest.isolateModules(() => {
    // The same React as the renderer, not a second copy.
    jest.doMock('react', () => React);
    jest.doMock('react-native', () => ReactNative);
    ResetGate = jest.requireActual<typeof import('../../src/components/ResetGate')>(
      '../../src/components/ResetGate',
    ).default;
  });
  mockResetRequested = false;
  mockReset.mockClear();
  mockTrace.mockClear();
});

test('a launch that asked for no reset renders straight away and clears nothing', async () => {
  const screen = await render(app());
  expect(screen.getByText('the app')).toBeTruthy();
  expect(mockReset).not.toHaveBeenCalled();
});

test('a reset launch shows nothing until the reset has cleared everything, then the app', async () => {
  mockResetRequested = true;
  const screen = await render(app());
  expect(screen.queryByText('the app')).toBeNull();
  expect(mockReset).toHaveBeenCalledTimes(1);
  await act(async () => finishReset());
  expect(screen.getByText('the app')).toBeTruthy();
});

test('a reset that fails shows why instead of starting on half-cleared data', async () => {
  mockResetRequested = true;
  const screen = await render(app());
  await act(async () => failReset(new Error('disk full')));
  expect(screen.queryByText('the app')).toBeNull();
  expect(screen.getByTestId('reset-failed').props.children).toEqual([
    'The E2E reset failed: ',
    'Error: disk full',
  ]);
  expect(mockTrace).toHaveBeenCalledWith('reset-failed', { error: 'Error: disk full' });
});

test('a launch resets once, even if the gate mounts again', async () => {
  mockResetRequested = true;
  const first = await render(app());
  await act(async () => finishReset());
  await first.unmount();
  const second = await render(app());
  expect(second.getByText('the app')).toBeTruthy();
  expect(mockReset).toHaveBeenCalledTimes(1);
});
