import React from 'react';
import { View } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';

// The E2E build, launched by a GIF recording that asked for touches.
const mockTraceTouch = jest.fn();
jest.mock('../../src/services/trace', () => ({
  tracing: true,
  trace: jest.fn(),
  traceTouch: (...args: unknown[]) => mockTraceTouch(...args),
  enterScreen: jest.fn(() => () => {}),
  currentScreen: () => 'sift',
}));
const mockMarks = { down: jest.fn(), move: jest.fn(), up: jest.fn() };
jest.mock('../../src/services/touchOverlay', () => ({
  showTouches: true,
  touchMarks: {
    down: (...args: unknown[]) => mockMarks.down(...args),
    move: (...args: unknown[]) => mockMarks.move(...args),
    up: (...args: unknown[]) => mockMarks.up(...args),
  },
}));

import { touchTraceProps } from '../../src/hooks/useTrace';

test("each phase of a touch feeds the drawn marks; a cancel lets go; moves aren't traced", async () => {
  const { getByTestId } = await render(<View testID="root" {...touchTraceProps} />);
  const root = getByTestId('root');
  const at = (pageX: number) => ({ nativeEvent: { pageX, pageY: 50, timestamp: 1 } });
  await fireEvent(root, 'touchStartCapture', at(10));
  await fireEvent(root, 'touchMoveCapture', at(20));
  await fireEvent(root, 'touchEndCapture', at(30));
  await fireEvent(root, 'touchStartCapture', at(40));
  await fireEvent(root, 'touchCancelCapture', at(45));
  const where = (mock: jest.Mock) => mock.mock.calls.map(([x, y]) => [x, y]);
  expect(where(mockMarks.down)).toEqual([
    [10, 50],
    [40, 50],
  ]);
  expect(where(mockMarks.move)).toEqual([[20, 50]]);
  expect(where(mockMarks.up)).toEqual([
    [30, 50],
    [45, 50],
  ]);
  expect(mockMarks.down.mock.calls[0][2]).toEqual(expect.any(Number));
  expect(mockTraceTouch.mock.calls.map(([phase]) => phase)).toEqual([
    'start',
    'end',
    'start',
    'cancel',
  ]);
});
