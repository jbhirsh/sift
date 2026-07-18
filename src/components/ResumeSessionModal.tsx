import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
} from 'react-native';
import { SymbolView } from 'expo-symbols';
import type { SFSymbol } from 'sf-symbols-typescript';
import { useTheme } from '../theme/ThemeContext';
import { SPACING, RADIUS, COLORS } from '../theme';
import GlassCard from './GlassCard';
import type { SiftSession } from '../types';

interface ResumeSessionModalProps {
  session: SiftSession;
  onResume: () => void;
  onStartOver: () => void;
  onCancel: () => void;
}

export default function ResumeSessionModal({
  session,
  onResume,
  onStartOver,
  onCancel,
}: ResumeSessionModalProps) {
  const { colors } = useTheme();

  const sourceLabel =
    session.source?.type === 'playlist'
      ? session.source.playlist.name
      : 'Library';

  // Clamped like the reducer's `remaining` (SiftContext): a corrupted or
  // legacy session could carry cursor > tracks.length, and a finished
  // session (offered when unflushed keeps need repair) has exactly
  // cursor === tracks.length.
  const remaining = Math.max(0, session.tracks.length - session.cursor);

  return (
    <Modal
      visible
      transparent
      animationType="slide"
    >
      {/* testID lives on the inner View, not the Modal: RN never exposes a
          Modal's own testID to the iOS accessibility hierarchy, so Maestro
          (XCUITest) cannot see it there — unit tests find either. */}
      <View style={styles.overlay} testID="resume-session-modal">
        <View style={styles.sheetContainer}>
          <GlassCard intensity="thick" radius={RADIUS.lg} style={styles.sheet}>
            <View style={styles.header}>
              <Text style={[styles.title, { color: colors.text }]}>
                Resume Sifting?
              </Text>
              <TouchableOpacity
                onPress={onCancel}
                activeOpacity={0.7}
                testID="resume-modal-cancel"
              >
                <Text style={[styles.cancelText, { color: colors.accent }]}>
                  Cancel
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.sourceLabel, { color: colors.textSecondary }]}>
              {remaining === 0
                // Finished sessions reach this modal only when buffered
                // keeps still need saving — "unfinished sift" would be a
                // false claim for them.
                ? `You have unsaved changes from a finished sift for ${sourceLabel}.`
                : `You have an unfinished sift for ${sourceLabel}.`}
            </Text>

            <View style={styles.statsRow}>
              <StatItem
                count={session.kept.length}
                label="kept"
                symbolName="checkmark.circle.fill"
                color={COLORS.keep}
                textColor={colors.text}
                secondaryColor={colors.textSecondary}
              />
              <StatItem
                count={session.removed.length}
                label="removed"
                symbolName="xmark.circle.fill"
                color={COLORS.remove}
                textColor={colors.text}
                secondaryColor={colors.textSecondary}
              />
              <StatItem
                count={session.skipped.length}
                label="skipped"
                symbolName="arrow.right.circle"
                color={COLORS.skip}
                textColor={colors.text}
                secondaryColor={colors.textSecondary}
              />
              <StatItem
                count={remaining}
                label="remaining"
                symbolName="music.note.list"
                color={colors.textSecondary}
                textColor={colors.text}
                secondaryColor={colors.textSecondary}
              />
            </View>

            <View style={styles.buttonSection}>
              <TouchableOpacity
                style={[styles.resumeButton, { backgroundColor: colors.accent }]}
                onPress={onResume}
                activeOpacity={0.8}
                testID="resume-modal-resume"
              >
                <Text style={styles.resumeButtonText}>Resume</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.startOverButton, { borderColor: colors.accent }]}
                onPress={onStartOver}
                activeOpacity={0.8}
                testID="resume-modal-start-over"
              >
                <Text style={[styles.startOverButtonText, { color: colors.accent }]}>
                  Start Over
                </Text>
              </TouchableOpacity>
            </View>
          </GlassCard>
        </View>
      </View>
    </Modal>
  );
}

function StatItem({
  count,
  label,
  symbolName,
  color,
  textColor,
  secondaryColor,
}: {
  count: number;
  label: string;
  symbolName: SFSymbol;
  color: string;
  textColor: string;
  secondaryColor: string;
}) {
  return (
    <View style={styles.statItem} testID={`resume-stat-${label}`}>
      <SymbolView name={symbolName} size={22} tintColor={color} />
      <Text style={[styles.statCount, { color: textColor }]}>{count}</Text>
      <Text style={[styles.statLabel, { color: secondaryColor }]}>{label}</Text>
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
    maxHeight: '70%',
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
  cancelText: {
    fontSize: 17,
  },
  sourceLabel: {
    fontSize: 15,
    paddingHorizontal: SPACING['2xl'],
    marginBottom: SPACING.xl,
  },
  statsRow: {
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
  buttonSection: {
    gap: SPACING.lg,
    paddingHorizontal: SPACING['2xl'],
    paddingTop: SPACING.xl,
  },
  resumeButton: {
    // backgroundColor is theme-dependent (colors.accent) and applied inline.
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.xl,
    alignItems: 'center',
  },
  resumeButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  startOverButton: {
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.xl,
    alignItems: 'center',
    borderWidth: 1,
  },
  startOverButtonText: {
    fontSize: 17,
    fontWeight: '600',
  },
});
