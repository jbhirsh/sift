import React from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, type DimensionValue } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { CONTENT_COLUMN, SPACING, RADIUS } from '../theme';
import GlassCard from './GlassCard';
import TouchOverlay from './TouchOverlay';

interface BottomSheetProps {
  /** On the sheet's backdrop, where Maestro and the unit tests find it. */
  testID: string;
  /** The most of the screen's height the sheet takes. */
  maxHeight: DimensionValue;
  onRequestClose?: () => void;
  children: React.ReactNode;
}

/**
 * A sheet that slides up over a dimmed screen, in the column the screens
 * use: the decisions list, the playlist picker and the resume prompt.
 */
export default function BottomSheet({
  testID,
  maxHeight,
  onRequestClose,
  children,
}: BottomSheetProps) {
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onRequestClose}>
      {/* testID lives on the inner View, not the Modal: RN never exposes a
          Modal's own testID to the iOS accessibility hierarchy, so Maestro
          (XCUITest) cannot see it there — unit tests find either. */}
      <View style={styles.overlay} testID={testID}>
        <View style={[styles.sheetContainer, { maxHeight }]}>
          <GlassCard intensity="thick" radius={RADIUS.lg} style={styles.sheet}>
            {children}
          </GlassCard>
        </View>
      </View>
      <TouchOverlay inModal />
    </Modal>
  );
}

interface SheetHeaderProps {
  title: string;
  /** The text button across from the title (Cancel). */
  actionLabel: string;
  onAction: () => void;
  actionTestID: string;
}

/** A sheet's title with a text button across from it. */
export function SheetHeader({ title, actionLabel, onAction, actionTestID }: SheetHeaderProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.header}>
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      <TouchableOpacity
        onPress={onAction}
        activeOpacity={0.7}
        testID={actionTestID}
        accessibilityRole="button"
      >
        <Text style={[styles.actionText, { color: colors.accent }]}>{actionLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    ...CONTENT_COLUMN,
  },
  sheet: {
    paddingBottom: SPACING['4xl'],
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING['2xl'],
    paddingVertical: SPACING.xl,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
  },
  actionText: {
    fontSize: 17,
  },
});
