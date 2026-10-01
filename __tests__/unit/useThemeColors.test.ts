import { renderHook } from '@testing-library/react-native';
import { useThemeColors } from '../../src/theme/useThemeColors';
import { COLORS } from '../../src/theme';

const mockUseColorScheme = jest.fn();
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: mockUseColorScheme,
}));

describe('useThemeColors', () => {
  beforeEach(() => {
    mockUseColorScheme.mockReset();
  });

  test('returns light colors when colorScheme is light', async () => {
    mockUseColorScheme.mockReturnValue('light');
    const { result } = await renderHook(() => useThemeColors());
    expect(result.current).toBe(COLORS.light);
  });

  test('returns dark colors when colorScheme is dark', async () => {
    mockUseColorScheme.mockReturnValue('dark');
    const { result } = await renderHook(() => useThemeColors());
    expect(result.current).toBe(COLORS.dark);
  });

  test('returns light colors when colorScheme is null', async () => {
    mockUseColorScheme.mockReturnValue(null);
    const { result } = await renderHook(() => useThemeColors());
    expect(result.current).toBe(COLORS.light);
  });
});
