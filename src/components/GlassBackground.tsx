import React from 'react';
import { StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../theme/ThemeContext';
import type { AppPhase } from '../types';

interface GlassBackgroundProps {
  phase: AppPhase;
}

export default function GlassBackground({ phase }: GlassBackgroundProps) {
  const { gradientColors } = useTheme();
  const colors = gradientColors(phase);

  return (
    <LinearGradient
      colors={colors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={StyleSheet.absoluteFill}
    />
  );
}
