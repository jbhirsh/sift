import React from 'react';
import { Text, View } from 'react-native';
import { act, fireEvent, render, renderHook } from '@testing-library/react-native';

// The E2E build's tracer, recorded rather than written.
const mockTrace = jest.fn();
const mockTraceTouch = jest.fn();
const mockLeave = jest.fn();
const mockEnterScreen = jest.fn((_name: string) => mockLeave);
jest.mock('../../src/services/trace', () => ({
  tracing: true,
  trace: (...args: unknown[]) => mockTrace(...args),
  traceTouch: (...args: unknown[]) => mockTraceTouch(...args),
  enterScreen: (name: string) => mockEnterScreen(name),
  currentScreen: () => 'sift',
}));

import { touchTraceProps, useJsStallWatch, useTraceScreen } from '../../src/hooks/useTrace';

beforeEach(() => {
  mockTrace.mockClear();
  mockTraceTouch.mockClear();
  mockLeave.mockClear();
  mockEnterScreen.mockClear();
});

describe('useTraceScreen', () => {
  test('says when a screen comes up and goes down, and marks it on top meanwhile', async () => {
    const { unmount, rerender } = await renderHook(() => useTraceScreen('settings'));
    // When React started drawing it, then when it's on screen; a re-render says nothing.
    await rerender({});
    expect(mockTrace.mock.calls).toEqual([
      ['screen', { name: 'settings', at: 'render' }],
      ['screen', { name: 'settings', at: 'up' }],
    ]);
    expect(mockEnterScreen).toHaveBeenCalledWith('settings');
    expect(mockLeave).not.toHaveBeenCalled();
    await unmount();
    expect(mockLeave).toHaveBeenCalledTimes(1);
    expect(mockTrace).toHaveBeenLastCalledWith('screen', { name: 'settings', at: 'down' });
  });

  test('a new name is a new screen', async () => {
    const { rerender } = await renderHook(({ name }: { name: string }) => useTraceScreen(name), {
      initialProps: { name: 'setup' },
    });
    await rerender({ name: 'loading' });
    expect(mockTrace.mock.calls).toEqual([
      ['screen', { name: 'setup', at: 'render' }],
      ['screen', { name: 'setup', at: 'up' }],
      ['screen', { name: 'setup', at: 'down' }],
      ['screen', { name: 'loading', at: 'up' }],
    ]);
    expect(mockEnterScreen.mock.calls).toEqual([['setup'], ['loading']]);
  });
});

describe('touchTraceProps', () => {
  test('records every phase of a touch under the root, with where and when', async () => {
    const { getByTestId } = await render(
      <View testID="root" {...touchTraceProps}>
        <Text>Skip</Text>
      </View>,
    );
    const root = getByTestId('root');
    const nativeEvent = { pageX: 200, pageY: 798, timestamp: 1234 };
    await fireEvent(root, 'touchStartCapture', { nativeEvent });
    await fireEvent(root, 'touchEndCapture', { nativeEvent: { ...nativeEvent, timestamp: 1350 } });
    await fireEvent(root, 'touchCancelCapture', { nativeEvent });
    expect(mockTraceTouch.mock.calls).toEqual([
      ['start', 200, 798, 1234],
      ['end', 200, 798, 1350],
      ['cancel', 200, 798, 1234],
    ]);
  });
});

describe('useJsStallWatch', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('quiet while the ticks come on time', async () => {
    await renderHook(() => useJsStallWatch());
    await act(() => {
      jest.advanceTimersByTime(10_000);
    });
    expect(mockTrace).not.toHaveBeenCalled();
  });

  test('a stall says how long, once, then goes quiet again', async () => {
    await renderHook(() => useJsStallWatch());
    await act(() => {
      jest.advanceTimersByTime(250);
    });
    // The thread stalls: the clock moves 16 s before the next tick runs.
    jest.setSystemTime(Date.now() + 16_000);
    await act(() => {
      jest.advanceTimersByTime(250);
    });
    expect(mockTrace).toHaveBeenCalledTimes(1);
    expect(mockTrace).toHaveBeenCalledWith('js-stall', { gap: 16_250, screen: 'sift' });
    await act(() => {
      jest.advanceTimersByTime(5_000);
    });
    expect(mockTrace).toHaveBeenCalledTimes(1);
  });

  test('stops ticking when the app goes', async () => {
    const { unmount } = await renderHook(() => useJsStallWatch());
    await unmount();
    jest.setSystemTime(Date.now() + 16_000);
    await act(() => {
      jest.advanceTimersByTime(1_000);
    });
    expect(mockTrace).not.toHaveBeenCalled();
  });
});
