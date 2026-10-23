import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import BottomSheet, { SheetHeader } from '../../src/components/BottomSheet';
import { a11yViolations } from '../helpers/a11yScan';

jest.mock('../../src/theme/ThemeContext', () => ({
  useTheme: () => ({ colors: { text: '#000', accent: '#007AFF' } }),
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

describe('BottomSheet', () => {
  it('puts its testID on the backdrop and its content in a sheet of the given height', async () => {
    const screen = await render(
      <BottomSheet testID="some-sheet" maxHeight="70%">
        <Text>Inside</Text>
      </BottomSheet>,
    );
    expect(screen.getByTestId('some-sheet')).toBeTruthy();
    expect(screen.getByText('Inside')).toBeTruthy();
    const [container] = screen.getByTestId('some-sheet').children;
    expect(typeof container !== 'string' && StyleSheet.flatten(container.props.style)).toEqual(
      expect.objectContaining({ maxHeight: '70%' }),
    );
  });

  it('closes through onRequestClose (the system back gesture)', async () => {
    const onRequestClose = jest.fn();
    const screen = await render(
      <BottomSheet testID="some-sheet" maxHeight="80%" onRequestClose={onRequestClose}>
        <Text>Inside</Text>
      </BottomSheet>,
    );
    // The Modal itself carries no testID: climb to it from the backdrop.
    type Node = { props: { onRequestClose?: () => void }; parent: Node | null };
    let node: Node | null = screen.getByTestId('some-sheet') as unknown as Node;
    while (node && !node.props.onRequestClose) node = node.parent;
    node?.props.onRequestClose?.();
    expect(onRequestClose).toHaveBeenCalledTimes(1);
  });
});

describe('SheetHeader', () => {
  it('shows the title and a named button that runs its action', async () => {
    const onAction = jest.fn();
    const screen = await render(
      <SheetHeader
        title="Pick one"
        actionLabel="Cancel"
        onAction={onAction}
        actionTestID="x-cancel"
      />,
    );
    expect(screen.getByText('Pick one')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('x-cancel'));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(a11yViolations(screen.root)).toEqual([]);
  });
});
