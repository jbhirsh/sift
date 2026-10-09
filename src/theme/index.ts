import { Platform } from 'react-native';

// Spacing scale matching SwiftUI project
export const SPACING = {
  xs: 2,
  sm: 4,
  md: 6,
  base: 8,
  lg: 12,
  xl: 16,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
} as const;

// The floating settings gear (App.tsx): its size and how far below the top
// safe-area inset it sits. Screens that scroll under it clear
// SETTINGS_BUTTON.top + SETTINGS_BUTTON.size.
export const SETTINGS_BUTTON = {
  size: 40,
  top: SPACING.base,
} as const;

// Corner radius scale
export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
} as const;

// Semantic colors (iOS system equivalents). keep/remove/skip are for fills
// and icons in both themes. As TEXT they fail contrast on light backgrounds
// (green and orange are about 2.2:1 on white), so text uses the per-theme
// keepText/removeText/skipText below, which reach 4.5:1.
export const COLORS = {
  keep: '#34C759', // System green
  remove: '#FF3B30', // System red
  skip: '#FF9500', // System orange
  // Light mode
  light: {
    text: '#000000',
    // At least 4.5:1 on background and surface: body text.
    textSecondary: '#6C6C70',
    // At least 3:1 on background: icons, glyphs and tracks, not text.
    textTertiary: '#8A8A8E',
    background: '#FFFFFF',
    surface: '#F2F2F7',
    quaternary: 'rgba(0,0,0,0.04)',
    separator: 'rgba(0,0,0,0.1)',
    // Darker than iOS system blue (#007AFF, 4.0:1 on white) so blue text
    // and white-on-blue buttons reach 4.5:1 (owner's call, #154).
    accent: '#0066CC',
    // Button backgrounds under white labels.
    accentFill: '#0066CC',
    keepText: '#1F7A35',
    removeText: '#D70015',
    skipText: '#C93400',
  },
  // Dark mode
  dark: {
    text: '#FFFFFF',
    textSecondary: '#8E8E93',
    textTertiary: '#6E6E73',
    background: '#000000',
    surface: '#1C1C1E',
    quaternary: 'rgba(255,255,255,0.08)',
    separator: 'rgba(255,255,255,0.15)',
    // Blue text on dark backgrounds (5.8:1 on black). Too light for a white
    // label on top, hence the separate fill.
    accent: '#0A84FF',
    accentFill: '#0066CC',
    keepText: '#30D158',
    removeText: '#FF453A',
    skipText: '#FF9F0A',
  },
} as const;

// Shadow presets
export const SHADOWS = {
  subtle: {
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  prominent: {
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  button: {
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
} as const;

// Typography helpers
export const FONTS = {
  brand: Platform.select({
    ios: { fontFamily: '.AppleSystemUIFontRounded-Bold' },
    default: { fontWeight: 'bold' as const },
  }),
  headline: { fontWeight: '600' as const },
  body: { fontWeight: '400' as const },
} as const;

// Glass material definitions — blur intensity + tint overlay
export const GLASS = {
  thin: { intensity: 20, tintOpacity: 0.05 },
  regular: { intensity: 40, tintOpacity: 0.10 },
  thick: { intensity: 80, tintOpacity: 0.18 },
} as const;

// Background gradients per app phase
export const GRADIENTS = {
  setup: {
    light: ['#F8F0FF', '#EEF0FF'] as [string, string],
    dark: ['#1A0A2E', '#0A0E1A'] as [string, string],
  },
  loading: {
    light: ['#F0F4FF', '#FFFFFF'] as [string, string],
    dark: ['#0A0E1A', '#000000'] as [string, string],
  },
  sifting: {
    light: ['#F2F2F7', '#FFFFFF'] as [string, string],
    dark: ['#000000', '#0A0A0A'] as [string, string],
  },
  done: {
    light: ['#F0FFF4', '#F2F2F7'] as [string, string],
    dark: ['#0A1A0F', '#000000'] as [string, string],
  },
} as const;

// Specular highlight for glass edges
export const GLASS_BORDER = {
  light: 'rgba(255,255,255,0.5)',
  dark: 'rgba(255,255,255,0.12)',
} as const;
