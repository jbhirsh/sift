import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SymbolView } from 'expo-symbols';
import type { SFSymbol } from 'sf-symbols-typescript';
import { useTheme } from '../theme/ThemeContext';
import { SPACING, COLORS } from '../theme';
import { compactCount } from '../utils/compactCount';

interface SessionStatRowProps {
  kept: number;
  removed: number;
  skipped: number;
  remaining: number;
  /** Each item's testID is `${testIDPrefix}-${label}`. */
  testIDPrefix?: string;
}

/**
 * Kept / removed / skipped / remaining counts for a saved session, shared by
 * the resume sheet and Setup's inline resume block so both describe a
 * session the same way (#142). Counts are compacted (2,655 → "2.6k") so a
 * big library fits; the accessibility label carries the exact number.
 */
export default function SessionStatRow({
  kept,
  removed,
  skipped,
  remaining,
  testIDPrefix = 'resume-stat',
}: SessionStatRowProps) {
  const { colors } = useTheme();
  const items: { count: number; label: string; symbolName: SFSymbol; color: string }[] = [
    { count: kept, label: 'kept', symbolName: 'checkmark.circle.fill', color: COLORS.keep },
    { count: removed, label: 'removed', symbolName: 'xmark.circle.fill', color: COLORS.remove },
    { count: skipped, label: 'skipped', symbolName: 'arrow.right.circle', color: COLORS.skip },
    { count: remaining, label: 'remaining', symbolName: 'music.note.list', color: colors.textSecondary },
  ];

  return (
    <View style={styles.statsRow}>
      {items.map(({ count, label, symbolName, color }) => (
        <View
          key={label}
          style={styles.statItem}
          testID={`${testIDPrefix}-${label}`}
          accessible
          accessibilityLabel={`${count} ${label}`}
        >
          <SymbolView name={symbolName} size={22} tintColor={color} />
          <Text style={[styles.statCount, { color: colors.text }]} numberOfLines={1}>
            {compactCount(count)}
          </Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  statsRow: {
    // Full width even in a parent that centers its children (Setup's
    // button section), or space-around has no room and the labels touch.
    alignSelf: 'stretch',
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.xl,
  },
  statItem: {
    alignItems: 'center',
    gap: SPACING.sm,
  },
  statCount: {
    fontSize: 20,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 12,
  },
});
