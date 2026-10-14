import React from 'react';
import { TouchableOpacity } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';

// The E2E build's tracer, recorded rather than written.
const mockTrace = jest.fn();
jest.mock('../../src/services/trace', () => ({
  tracing: true,
  trace: (...args: unknown[]) => mockTrace(...args),
  traceTouch: jest.fn(),
  enterScreen: jest.fn(() => () => {}),
  currentScreen: () => 'sift',
}));
jest.mock('../../src/services/SessionStore');
jest.mock('@sentry/react-native', () => ({
  setTag: jest.fn(),
  setContext: jest.fn(),
  addBreadcrumb: jest.fn(),
}));

import { SiftProvider, useSift } from '../../src/context/SiftContext';

const seenDispatches = new Set<unknown>();

function Buttons() {
  const { dispatch } = useSift();
  seenDispatches.add(dispatch);
  return (
    <>
      <TouchableOpacity testID="decide" onPress={() => dispatch({ type: 'DECIDE', decision: 'skip', at: 1 })} />
      <TouchableOpacity testID="tick" onPress={() => dispatch({ type: 'SET_PLAYBACK_POSITION', position: 12 })} />
      <TouchableOpacity testID="finish" onPress={() => dispatch({ type: 'FINISH' })} />
    </>
  );
}

const track = {
  id: '1', name: 'Track A', artist: 'Artist A', album: 'Album A',
  duration: 200, playCount: 10, dateAdded: '2020-01-01T00:00:00.000Z',
};

test('every action the app dispatches is a trace line, but for the poller\'s ticks', async () => {
  const { getByTestId } = await render(
    <SiftProvider initialTracks={[track]}>
      <Buttons />
    </SiftProvider>,
  );
  mockTrace.mockClear();
  await fireEvent.press(getByTestId('decide'));
  await fireEvent.press(getByTestId('tick'));
  await fireEvent.press(getByTestId('finish'));
  const actions = mockTrace.mock.calls.filter(([event]) => event === 'action').map(([, data]) => data);
  expect(actions).toEqual([{ type: 'DECIDE', decision: 'skip' }, { type: 'FINISH' }]);
  // The same dispatch across those renders, as React's own is.
  expect(seenDispatches.size).toBe(1);
});
