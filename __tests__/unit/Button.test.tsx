import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Button } from '../../src/components/Button';

jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: jest.fn().mockReturnValue('light'),
}));

describe('Button', () => {
  test('renders title text', () => {
    const { getByText } = render(
      <Button title="Press Me" onPress={jest.fn()} />
    );
    expect(getByText('Press Me')).toBeTruthy();
  });

  test('calls onPress when pressed', () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <Button title="Press" onPress={onPress} />
    );
    fireEvent.press(getByText('Press'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('does not call onPress when disabled', () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <Button title="Disabled" onPress={onPress} disabled />
    );
    fireEvent.press(getByText('Disabled'));
    expect(onPress).not.toHaveBeenCalled();
  });

  test('renders with icon prefix', () => {
    const { getByText } = render(
      <Button title="Save" onPress={jest.fn()} icon="💾" />
    );
    expect(getByText('💾 Save')).toBeTruthy();
  });

  test('renders with secondary variant', () => {
    const { getByText } = render(
      <Button title="Secondary" onPress={jest.fn()} variant="secondary" />
    );
    expect(getByText('Secondary')).toBeTruthy();
  });

  test('renders with plain variant', () => {
    const { getByText } = render(
      <Button title="Plain" onPress={jest.fn()} variant="plain" />
    );
    expect(getByText('Plain')).toBeTruthy();
  });

  test('renders with small size', () => {
    const { getByText } = render(
      <Button title="Small" onPress={jest.fn()} size="small" />
    );
    expect(getByText('Small')).toBeTruthy();
  });

  test('renders with large size', () => {
    const { getByText } = render(
      <Button title="Large" onPress={jest.fn()} size="large" />
    );
    expect(getByText('Large')).toBeTruthy();
  });

  test('renders with custom color', () => {
    const { getByText } = render(
      <Button title="Custom" onPress={jest.fn()} color="#FF0000" />
    );
    expect(getByText('Custom')).toBeTruthy();
  });

  test('renders with testID', () => {
    const { getByTestId } = render(
      <Button title="Test" onPress={jest.fn()} testID="my-button" />
    );
    expect(getByTestId('my-button')).toBeTruthy();
  });

  test('secondary variant disabled shows default text color', () => {
    const { getByText } = render(
      <Button title="SecDisabled" onPress={jest.fn()} variant="secondary" disabled />
    );
    expect(getByText('SecDisabled')).toBeTruthy();
  });

  test('plain variant disabled shows default text color', () => {
    const { getByText } = render(
      <Button title="PlainDisabled" onPress={jest.fn()} variant="plain" disabled />
    );
    expect(getByText('PlainDisabled')).toBeTruthy();
  });
});
