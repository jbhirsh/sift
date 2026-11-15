import React from 'react';
import { Text } from 'react-native';
import { act, render } from '@testing-library/react-native';
import { isMarked, mark, subscribeMarks, unmark } from '../../src/services/e2eMarks';
import { useE2eMark } from '../../src/hooks/useE2eMark';
import E2eMarker from '../../src/components/E2eMarker';

// The E2E build traces; the store build doesn't. Each test picks.
let mockTracing = true;
jest.mock('../../src/services/trace', () => ({
  get tracing() {
    return mockTracing;
  },
}));

// The marks are one store for the whole app, so each test uses its own names.

describe('e2eMarks', () => {
  test('a mark reads back, and each change tells every listener once', () => {
    const listener = jest.fn();
    const unsubscribe = subscribeMarks(listener);
    try {
      expect(isMarked('a')).toBe(false);
      mark('a');
      expect(isMarked('a')).toBe(true);
      expect(listener).toHaveBeenCalledTimes(1);
      // Marking it again changes nothing, so says nothing.
      mark('a');
      expect(listener).toHaveBeenCalledTimes(1);
      unmark('a');
      expect(isMarked('a')).toBe(false);
      expect(listener).toHaveBeenCalledTimes(2);
      // Nor does unmarking one that isn't marked.
      unmark('a');
      expect(listener).toHaveBeenCalledTimes(2);
    } finally {
      unsubscribe();
    }
  });

  test('a listener hears nothing once unsubscribed', () => {
    const listener = jest.fn();
    subscribeMarks(listener)();
    mark('b');
    unmark('b');
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('useE2eMark', () => {
  function Shows({ name }: { name: string }) {
    return <Text testID="shown">{String(useE2eMark(name))}</Text>;
  }

  test('follows the mark as it comes and goes', async () => {
    const { getByTestId } = await render(<Shows name="c" />);
    expect(getByTestId('shown').props.children).toBe('false');
    await act(async () => mark('c'));
    expect(getByTestId('shown').props.children).toBe('true');
    await act(async () => unmark('c'));
    expect(getByTestId('shown').props.children).toBe('false');
  });
});

describe('E2eMarker', () => {
  afterEach(() => {
    mockTracing = true;
  });

  test('in the E2E build, shows a 1×1 element that takes no touch while `when` holds', async () => {
    const { getByTestId, queryByTestId, rerender } = await render(<E2eMarker id="m" when />);
    const marker = getByTestId('m');
    expect(marker.props.pointerEvents).toBe('none');
    expect(marker.props.style).toEqual({
      position: 'absolute',
      top: 0,
      left: 0,
      width: 1,
      height: 1,
    });
    await rerender(<E2eMarker id="m" when={false} />);
    expect(queryByTestId('m')).toBeNull();
  });

  test('outside it, shows nothing', async () => {
    mockTracing = false;
    const { queryByTestId } = await render(<E2eMarker id="m" when />);
    expect(queryByTestId('m')).toBeNull();
  });
});
