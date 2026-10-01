import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';
import GlassCard from '../../src/components/GlassCard';
import { ThemeProvider } from '../../src/theme/ThemeContext';

const mockUseColorScheme = jest.fn().mockReturnValue('light');
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: mockUseColorScheme,
}));

jest.mock('expo-blur', () => ({
  BlurView: 'BlurView',
}));

function renderCard(props: { intensity?: 'thin' | 'regular' | 'thick'; radius?: number } = {}) {
  return render(
    <ThemeProvider>
      <GlassCard {...props}>
        <Text testID="child">Content</Text>
      </GlassCard>
    </ThemeProvider>
  );
}

describe('GlassCard', () => {
  test('renders children', async () => {
    const { getByTestId } = await renderCard();
    expect(getByTestId('child')).toBeTruthy();
  });

  test('renders with thin intensity', async () => {
    const { toJSON } = await renderCard({ intensity: 'thin' });
    expect(toJSON()).toBeTruthy();
  });

  test('renders with thick intensity', async () => {
    const { toJSON } = await renderCard({ intensity: 'thick' });
    expect(toJSON()).toBeTruthy();
  });

  test('renders with custom radius', async () => {
    const { toJSON } = await renderCard({ radius: 24 });
    expect(toJSON()).toBeTruthy();
  });

  test('renders with default intensity (regular)', async () => {
    const { toJSON } = await renderCard();
    expect(toJSON()).toBeTruthy();
  });

  test('renders with dark color scheme', async () => {
    mockUseColorScheme.mockReturnValue('dark');
    const { toJSON } = await renderCard();
    expect(toJSON()).toBeTruthy();
    mockUseColorScheme.mockReturnValue('light');
  });
});
