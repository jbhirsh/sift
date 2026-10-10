import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
} from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { SPACING, RADIUS } from '../theme';
import GlassCard from './GlassCard';
import { Button } from './Button';
import SessionStatRow from './SessionStatRow';
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
                accessibilityRole="button"
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

            <SessionStatRow
              kept={session.kept.length}
              removed={session.removed.length}
              skipped={session.skipped.length}
              remaining={remaining}
            />

            <View style={styles.buttonSection}>
              <Button
                title="Resume"
                size="large"
                onPress={onResume}
                testID="resume-modal-resume"
              />
              {/* Destructive, and kept well clear of Resume: a thumb aimed at
                  Resume must not land here (#137). It asks before
                  discarding anything. */}
              <View style={styles.startOverGap} />
              <Button
                title="Start Over"
                size="large"
                variant="secondary"
                color={colors.removeText}
                onPress={onStartOver}
                testID="resume-modal-start-over"
              />
            </View>
          </GlassCard>
        </View>
      </View>
    </Modal>
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
  buttonSection: {
    paddingHorizontal: SPACING['2xl'],
    paddingTop: SPACING.xl,
  },
  startOverGap: {
    height: SPACING['3xl'],
  },
});
