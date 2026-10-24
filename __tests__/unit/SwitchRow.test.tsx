import React from 'react';
import { Text } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import SwitchRow from '../../src/components/SwitchRow';
import { ThemeProvider } from '../../src/theme/ThemeContext';
import { a11yViolations } from '../helpers/a11yScan';

jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: jest.fn().mockReturnValue('light'),
}));

function Row({
  value,
  onValueChange,
}: {
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <ThemeProvider>
      <SwitchRow
        testID="row"
        label="Start at chorus"
        hint="Begin each song at its chorus."
        value={value}
        onValueChange={onValueChange}
      >
        <Text>Start at chorus</Text>
      </SwitchRow>
    </ThemeProvider>
  );
}

describe('SwitchRow', () => {
  test('a tap anywhere on the row flips the value', async () => {
    const onValueChange = jest.fn();
    const { getByTestId, rerender } = await render(
      <Row value={false} onValueChange={onValueChange} />,
    );
    await fireEvent.press(getByTestId('row'));
    expect(onValueChange).toHaveBeenLastCalledWith(true);
    await rerender(<Row value onValueChange={onValueChange} />);
    await fireEvent.press(getByTestId('row'));
    expect(onValueChange).toHaveBeenLastCalledWith(false);
  });

  test('VoiceOver reads the row as one switch with its state', async () => {
    const { getByTestId, toJSON } = await render(<Row value onValueChange={jest.fn()} />);
    const row = getByTestId('row');
    expect(row.props.accessible).toBe(true);
    expect(row.props.accessibilityRole).toBe('switch');
    expect(row.props.accessibilityLabel).toBe('Start at chorus');
    expect(row.props.accessibilityHint).toBe('Begin each song at its chorus.');
    expect(row.props.accessibilityState).toEqual({ checked: true });
    expect(a11yViolations(toJSON())).toEqual([]);
  });

  test("the native switch only draws the value: it takes no touches and isn't a second element", async () => {
    type Node = {
      type: string;
      props: Record<string, unknown>;
      children: (Node | string)[] | null;
    };
    const { toJSON } = await render(<Row value onValueChange={jest.fn()} />);
    // The host view holding the native switch, and the switch.
    const find = (node: Node | string, parent: Node | null): [Node, Node] | null => {
      if (typeof node === 'string') return null;
      if (node.type === 'RCTSwitch' && parent) return [parent, node];
      for (const child of node.children ?? []) {
        const found = find(child, node);
        if (found) return found;
      }
      return null;
    };
    const found = find(toJSON() as unknown as Node, null);
    if (!found) throw new Error('no native switch');
    const [holder, drawn] = found;
    expect(drawn.props.value).toBe(true);
    expect(holder.props.pointerEvents).toBe('none');
    expect(holder.props.accessibilityElementsHidden).toBe(true);
  });
});
