import React from 'react';
import { Text, TouchableOpacity, StyleSheet, type GestureResponderEvent } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { SymbolView } from 'expo-symbols';
import { useTheme } from '../theme/ThemeContext';
import { FONTS, SHADOWS, SPACING, UNDO_PILL } from '../theme';

interface UndoPillProps {
  /** What VoiceOver says: "Undo" alone doesn't say what it takes back. */
  accessibilityLabel: string;
  onPress: (event: GestureResponderEvent) => void;
  testID?: string;
}

/**
 * The "↶ Undo" pill (#152): an opaque surface, so it reads over anything,
 * with text on colors.text for 4.5:1 in both themes. It fades in and out;
 * the caller places it and decides when it shows.
 */
export default function UndoPill({ accessibilityLabel, onPress, testID }: UndoPillProps) {
  const { colors } = useTheme();

  // Reanimated's entering/exiting, not core Animated: a native-driven
  // opacity can be reset to its start value when the screen re-renders
  // (playback ticks re-render it twice a second), and an invisible pill
  // also drops out of the accessibility tree.
  return (
    <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)}>
      <TouchableOpacity
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        hitSlop={8}
        testID={testID}
        style={[styles.pill, { backgroundColor: colors.surface }]}
      >
        <SymbolView name="arrow.uturn.backward" size={UNDO_PILL.iconSize} tintColor={colors.text} />
        <Text style={[styles.label, { color: colors.text }]}>Undo</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    height: UNDO_PILL.height,
    paddingHorizontal: SPACING.lg,
    borderRadius: UNDO_PILL.height / 2,
    ...SHADOWS.button,
  },
  label: {
    ...FONTS.headline,
    fontSize: UNDO_PILL.fontSize,
  },
});
