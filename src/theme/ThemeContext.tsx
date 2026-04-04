import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { COLORS, GLASS_BORDER, GRADIENTS } from './index';
import type { AppPhase } from '../types';

type ColorScheme = typeof COLORS.light | typeof COLORS.dark;

interface ThemeContextValue {
  isDark: boolean;
  colors: ColorScheme;
  glass: {
    tint: 'light' | 'dark';
    borderColor: string;
  };
  gradientColors: (phase: AppPhase) => [string, string];
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const value = useMemo<ThemeContextValue>(() => {
    const colors = isDark ? COLORS.dark : COLORS.light;
    const glassTint = isDark ? 'dark' : 'light';
    const borderColor = isDark ? GLASS_BORDER.dark : GLASS_BORDER.light;

    const gradientColors = (phase: AppPhase): [string, string] => {
      const phaseKey = phase === 'paused' ? 'done' : phase;
      const gradient = GRADIENTS[phaseKey as keyof typeof GRADIENTS];
      if (!gradient) return isDark ? ['#000000', '#0A0A0A'] : ['#F2F2F7', '#FFFFFF'];
      return isDark ? gradient.dark : gradient.light;
    };

    return {
      isDark,
      colors,
      glass: { tint: glassTint, borderColor },
      gradientColors,
    };
  }, [isDark]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
