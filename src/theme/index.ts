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

// Corner radius scale
export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
} as const;

// Semantic colors (iOS system equivalents)
export const COLORS = {
  keep: '#34C759', // System green
  remove: '#FF3B30', // System red
  skip: '#FF9500', // System orange
  // Light mode
  light: {
    text: '#000000',
    textSecondary: '#6C6C70',
    textTertiary: '#AEAEB2',
    background: '#FFFFFF',
    surface: '#F2F2F7',
    quaternary: 'rgba(0,0,0,0.04)',
    separator: 'rgba(0,0,0,0.1)',
    accent: '#007AFF',
  },
  // Dark mode
  dark: {
    text: '#FFFFFF',
    textSecondary: '#8E8E93',
    textTertiary: '#636366',
    background: '#000000',
    surface: '#1C1C1E',
    quaternary: 'rgba(255,255,255,0.08)',
    separator: 'rgba(255,255,255,0.15)',
    accent: '#0A84FF',
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
