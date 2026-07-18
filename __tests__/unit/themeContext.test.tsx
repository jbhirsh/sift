import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { ThemeProvider, useTheme } from '../../src/theme/ThemeContext';
import { COLORS, GLASS_BORDER, GRADIENTS } from '../../src/theme';

// Mock useColorScheme
const mockUseColorScheme = jest.fn();
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: mockUseColorScheme,
}));

function TestConsumer() {
  const theme = useTheme();
  return (
    <>
      <Text testID="isDark">{String(theme.isDark)}</Text>
      <Text testID="glassTint">{theme.glass.tint}</Text>
      <Text testID="borderColor">{theme.glass.borderColor}</Text>
      <Text testID="text">{theme.colors.text}</Text>
      <Text testID="gradient-setup">{JSON.stringify(theme.gradientColors('setup'))}</Text>
      <Text testID="gradient-sifting">{JSON.stringify(theme.gradientColors('sifting'))}</Text>
    </>
  );
}

describe('ThemeContext', () => {
  beforeEach(() => {
    mockUseColorScheme.mockReset();
  });

  test('provides light theme when colorScheme is light', () => {
    mockUseColorScheme.mockReturnValue('light');
    const { getByTestId } = render(
      <ThemeProvider><TestConsumer /></ThemeProvider>
    );
    expect(getByTestId('isDark').props.children).toBe('false');
    expect(getByTestId('glassTint').props.children).toBe('light');
    expect(getByTestId('borderColor').props.children).toBe(GLASS_BORDER.light);
    expect(getByTestId('text').props.children).toBe(COLORS.light.text);
  });

  test('provides dark theme when colorScheme is dark', () => {
    mockUseColorScheme.mockReturnValue('dark');
    const { getByTestId } = render(
      <ThemeProvider><TestConsumer /></ThemeProvider>
    );
    expect(getByTestId('isDark').props.children).toBe('true');
    expect(getByTestId('glassTint').props.children).toBe('dark');
    expect(getByTestId('borderColor').props.children).toBe(GLASS_BORDER.dark);
    expect(getByTestId('text').props.children).toBe(COLORS.dark.text);
  });

  test('gradientColors returns correct gradient for setup phase', () => {
    mockUseColorScheme.mockReturnValue('light');
    const { getByTestId } = render(
      <ThemeProvider><TestConsumer /></ThemeProvider>
    );
    expect(JSON.parse(getByTestId('gradient-setup').props.children)).toEqual(GRADIENTS.setup.light);
  });

  test('gradientColors returns dark gradient in dark mode', () => {
    mockUseColorScheme.mockReturnValue('dark');
    const { getByTestId } = render(
      <ThemeProvider><TestConsumer /></ThemeProvider>
    );
    expect(JSON.parse(getByTestId('gradient-sifting').props.children)).toEqual(GRADIENTS.sifting.dark);
  });

  test('useTheme throws when used outside ThemeProvider', () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<TestConsumer />)).toThrow('useTheme must be used within a ThemeProvider');
    consoleError.mockRestore();
  });
});
