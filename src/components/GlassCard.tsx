import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { GLASS, RADIUS } from '../theme';
import { useTheme } from '../theme/ThemeContext';

type GlassIntensity = 'thin' | 'regular' | 'thick';

interface GlassCardProps {
  intensity?: GlassIntensity;
  radius?: number;
  style?: ViewStyle;
  children: React.ReactNode;
}

export default function GlassCard({
  intensity = 'regular',
  radius = RADIUS.md,
  style,
  children,
}: GlassCardProps) {
  const { glass, isDark } = useTheme();
  const material = GLASS[intensity];

  return (
    <View style={[styles.container, { borderRadius: radius, borderColor: glass.borderColor }, style]}>
      <BlurView
        intensity={material.intensity}
        tint={glass.tint}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: isDark
              ? `rgba(255,255,255,${material.tintOpacity})`
              : `rgba(255,255,255,${material.tintOpacity * 3})`,
          },
        ]}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    borderWidth: 0.5,
  },
});
