import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { FONTS, RADIUS, SPACING, TOAST } from '../theme';
import GlassCard from './GlassCard';

interface ToastProps {
  message: string;
  actionLabel: string;
  /** What VoiceOver says for the action, when the label alone is vague. */
  actionAccessibilityLabel?: string;
  onAction: () => void;
  testID?: string;
}

/**
 * A short message with one action, on glass (#152). Text on colors.text, so
 * it passes 4.5:1 in both themes. The caller places it; it doesn't float.
 */
export default function Toast({ message, actionLabel, actionAccessibilityLabel, onAction, testID }: ToastProps) {
  const { colors } = useTheme();
  return (
    <GlassCard intensity="regular" radius={RADIUS.xl}>
      <View style={styles.row} testID={testID}>
        <Text style={[styles.message, { color: colors.text }]} numberOfLines={1}>
          {message}
        </Text>
        <TouchableOpacity
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={actionAccessibilityLabel ?? actionLabel}
          hitSlop={8}
          testID={testID ? `${testID}-action` : undefined}
        >
          <Text style={[styles.action, { color: colors.text }]}>{actionLabel}</Text>
        </TouchableOpacity>
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.lg,
    paddingHorizontal: SPACING.xl,
    height: TOAST.height,
  },
  message: {
    ...FONTS.body,
    fontSize: TOAST.fontSize,
    flexShrink: 1,
  },
  action: {
    ...FONTS.headline,
    fontSize: TOAST.fontSize,
    textDecorationLine: 'underline',
  },
});
