import { useColorScheme } from 'react-native';
import { COLORS } from './index';

export function useThemeColors() {
  const scheme = useColorScheme();
  return scheme === 'dark' ? COLORS.dark : COLORS.light;
}
