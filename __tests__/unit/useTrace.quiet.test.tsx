import { act, renderHook } from '@testing-library/react-native';

// Every build but the E2E one: the tracer doesn't write lines.
const mockTrace = jest.fn();
jest.mock('../../src/services/trace', () => ({
  tracing: false,
  trace: (...args: unknown[]) => mockTrace(...args),
  traceTouch: jest.fn(),
  enterScreen: jest.fn(() => () => {}),
  currentScreen: () => 'none',
}));

import { touchTraceProps, useJsStallWatch } from '../../src/hooks/useTrace';

test('no touch handlers on the root at all', () => {
  expect(touchTraceProps).toEqual({});
});

test('the stall watch never starts', async () => {
  jest.useFakeTimers();
  try {
    await renderHook(() => useJsStallWatch());
    jest.setSystemTime(Date.now() + 16_000);
    await act(() => {
      jest.advanceTimersByTime(1_000);
    });
    expect(mockTrace).not.toHaveBeenCalled();
  } finally {
    jest.useRealTimers();
  }
});
