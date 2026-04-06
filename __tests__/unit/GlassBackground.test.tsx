import React from 'react';
import { render } from '@testing-library/react-native';
import GlassBackground from '../../src/components/GlassBackground';
import { ThemeProvider } from '../../src/theme/ThemeContext';

jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: jest.fn().mockReturnValue('light'),
}));

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: 'LinearGradient',
}));

describe('GlassBackground', () => {
  test('renders without crashing for setup phase', () => {
    const { toJSON } = render(
      <ThemeProvider><GlassBackground phase="setup" /></ThemeProvider>
    );
    expect(toJSON()).toBeTruthy();
  });

  test('renders for loading phase', () => {
    const { toJSON } = render(
      <ThemeProvider><GlassBackground phase="loading" /></ThemeProvider>
    );
    expect(toJSON()).toBeTruthy();
  });

  test('renders for sifting phase', () => {
    const { toJSON } = render(
      <ThemeProvider><GlassBackground phase="sifting" /></ThemeProvider>
    );
    expect(toJSON()).toBeTruthy();
  });

  test('renders for done phase', () => {
    const { toJSON } = render(
      <ThemeProvider><GlassBackground phase="done" /></ThemeProvider>
    );
    expect(toJSON()).toBeTruthy();
  });

  test('renders for paused phase', () => {
    const { toJSON } = render(
      <ThemeProvider><GlassBackground phase="paused" /></ThemeProvider>
    );
    expect(toJSON()).toBeTruthy();
  });
});
