import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { SPACING } from '../theme';
import BottomSheet, { SheetHeader } from './BottomSheet';
import { Button } from './Button';
import SessionStatRow from './SessionStatRow';
import type { SiftSession } from '../types';
import { useTraceScreen } from '../hooks/useTrace';

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
  useTraceScreen('resume-session');
  const { colors } = useTheme();

  const sourceLabel =
    session.source?.type === 'playlist' ? session.source.playlist.name : 'Library';

  // Clamped like the reducer's `remaining` (SiftContext): a corrupted or
  // legacy session could carry cursor > tracks.length. (Setup offers only
  // unfinished sessions.)
  const remaining = Math.max(0, session.tracks.length - session.cursor);

  return (
    <BottomSheet testID="resume-session-modal" maxHeight="70%">
      <SheetHeader
        title="Resume Sifting?"
        actionLabel="Cancel"
        onAction={onCancel}
        actionTestID="resume-modal-cancel"
      />

      <Text style={[styles.sourceLabel, { color: colors.textSecondary }]}>
        {`You have an unfinished sift for ${sourceLabel}.`}
      </Text>

      <SessionStatRow
        kept={session.kept.length}
        removed={session.removed.length}
        skipped={session.skipped.length}
        remaining={remaining}
      />

      <View style={styles.buttonSection}>
        <Button title="Resume" size="large" onPress={onResume} testID="resume-modal-resume" />
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
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
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
