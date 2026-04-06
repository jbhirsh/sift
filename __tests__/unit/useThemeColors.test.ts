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

  test('returns light colors when colorScheme is light', () => {
    mockUseColorScheme.mockReturnValue('light');
    const { result } = renderHook(() => useThemeColors());
    expect(result.current).toBe(COLORS.light);
  });

  test('returns dark colors when colorScheme is dark', () => {
    mockUseColorScheme.mockReturnValue('dark');
    const { result } = renderHook(() => useThemeColors());
    expect(result.current).toBe(COLORS.dark);
  });

  test('returns light colors when colorScheme is null', () => {
    mockUseColorScheme.mockReturnValue(null);
    const { result } = renderHook(() => useThemeColors());
    expect(result.current).toBe(COLORS.light);
  });
});
