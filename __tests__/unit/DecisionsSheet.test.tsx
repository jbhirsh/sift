import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import DecisionsSheet from '../../src/components/DecisionsSheet';
import { a11yViolations } from '../helpers/a11yScan';
import type { Decision, Track } from '../../src/types';

jest.mock('../../src/theme/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      text: '#000',
      textSecondary: '#666',
      accent: '#007AFF',
      quaternary: '#eee',
      keepText: '#1F7A35',
      removeText: '#D70015',
      skipText: '#C93400',
    },
  }),
}));

jest.mock('../../src/components/GlassCard', () => {
  const { View } = require('react-native');
  return function MockGlassCard({
    children,
    ...props
  }: {
    children: React.ReactNode;
    [key: string]: unknown;
  }) {
    return <View {...props}>{children}</View>;
  };
});

const t = (id: string, name: string): Track => ({
  id,
  name,
  artist: `${name} artist`,
  album: 'Album',
  duration: 200,
  playCount: 1,
  dateAdded: '',
});
const [a, b] = [t('a', 'Alpha'), t('b', 'Beta')];
const decisions: Record<string, Decision> = { a: 'keep', b: 'remove' };

/** A promise the test settles by hand. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

async function renderSheet(
  onRevise = jest.fn(async () => true),
  onClose = jest.fn(),
  disabled?: boolean,
) {
  const view = await render(
    <DecisionsSheet
      tracks={[b, a]}
      decisionFor={(id) => decisions[id] ?? null}
      onRevise={onRevise}
      onClose={onClose}
      disabled={disabled}
    />,
  );
  return { ...view, onRevise, onClose };
}

describe('DecisionsSheet', () => {
  test('lists the decisions in the order given, each showing its current one', async () => {
    const { getAllByTestId, getByTestId } = await renderSheet();
    expect(getAllByTestId(/^decision-row-/).map((row) => row.props.testID)).toEqual([
      'decision-row-b',
      'decision-row-a',
    ]);
    expect(getByTestId('decision-keep-a').props.accessibilityState).toEqual({
      selected: true,
      disabled: true,
    });
    expect(getByTestId('decision-remove-a').props.accessibilityState).toEqual({
      selected: false,
      disabled: false,
    });
    expect(getByTestId('decision-remove-b').props.accessibilityState).toEqual({
      selected: true,
      disabled: true,
    });
    expect(getByTestId('decision-skip-b').props.accessibilityLabel).toBe('Skip Beta');
  });

  test("changing one asks for it, showing it busy until it's done", async () => {
    const pending = deferred<boolean>();
    const onRevise = jest.fn(() => pending.promise);
    const { getByTestId, queryByTestId } = await renderSheet(onRevise);
    await fireEvent.press(getByTestId('decision-skip-a'));
    expect(onRevise).toHaveBeenCalledWith(a, 'skip');
    expect(getByTestId('decision-busy-a')).toBeTruthy();
    // No second change to the same song while one is on its way.
    expect(getByTestId('decision-remove-a').props.accessibilityState.disabled).toBe(true);
    expect(getByTestId('decision-skip-b').props.accessibilityState.disabled).toBe(false);
    await act(async () => {
      pending.resolve(true);
    });
    expect(queryByTestId('decision-busy-a')).toBeNull();
    expect(queryByTestId('decision-failed-a')).toBeNull();
  });

  test("a change that didn't go through says so, until the next try", async () => {
    const onRevise = jest.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const { getByTestId, queryByTestId } = await renderSheet(onRevise);
    await act(async () => {
      await fireEvent.press(getByTestId('decision-keep-b'));
    });
    expect(getByTestId('decision-failed-b')).toHaveTextContent(
      'Couldn’t change it. Check your connection and try again.',
    );
    await act(async () => {
      await fireEvent.press(getByTestId('decision-keep-b'));
    });
    expect(queryByTestId('decision-failed-b')).toBeNull();
  });

  test('disabled, nothing can be changed (and nothing shows as busy)', async () => {
    const { getByTestId, queryByTestId } = await renderSheet(
      jest.fn(async () => true),
      jest.fn(),
      true,
    );
    expect(getByTestId('decision-remove-a').props.accessibilityState.disabled).toBe(true);
    expect(getByTestId('decision-keep-b').props.accessibilityState.disabled).toBe(true);
    expect(queryByTestId('decision-busy-a')).toBeNull();
  });

  test('Done closes it', async () => {
    const { getByTestId, onClose } = await renderSheet();
    await fireEvent.press(getByTestId('decisions-done'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('VoiceOver scan', async () => {
    const { toJSON } = await renderSheet();
    expect(a11yViolations(toJSON())).toEqual([]);
  });
});
