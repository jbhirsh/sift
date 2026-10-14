import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { CONTENT_COLUMN, RADIUS, SPACING } from '../theme';
import GlassCard from './GlassCard';
import type { Decision, Track } from '../types';
import { useTraceScreen } from '../hooks/useTrace';

const CHOICES: { decision: Decision; label: string }[] = [
  { decision: 'keep', label: 'Keep' },
  { decision: 'remove', label: 'Remove' },
  { decision: 'skip', label: 'Skip' },
];

interface DecisionsSheetProps {
  /** The decided cards, the latest first. */
  tracks: Track[];
  decisionFor: (trackId: string) => Decision | null;
  /** Change one; resolves to whether it changed. */
  onRevise: (track: Track, decision: Decision) => Promise<boolean>;
  onClose: () => void;
  /** No changes for now (Done: while its save, a Start Over or a Restore runs). */
  disabled?: boolean;
}

/**
 * Every decision of this sift, the latest first, each one changeable:
 * beyond the last decision, which Undo already takes back.
 */
export default function DecisionsSheet({ tracks, decisionFor, onRevise, onClose, disabled = false }: DecisionsSheetProps) {
  useTraceScreen('decisions');
  const { colors } = useTheme();
  // Rows whose change is on its way, and ones whose change didn't go through.
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());

  const change = useCallback(async (track: Track, decision: Decision) => {
    setBusyIds((prev) => new Set(prev).add(track.id));
    setFailedIds((prev) => {
      const next = new Set(prev);
      next.delete(track.id);
      return next;
    });
    const changed = await onRevise(track, decision);
    setBusyIds((prev) => {
      const next = new Set(prev);
      next.delete(track.id);
      return next;
    });
    if (!changed) setFailedIds((prev) => new Set(prev).add(track.id));
  }, [onRevise]);

  const decisionColor = (decision: Decision) =>
    decision === 'keep' ? colors.keepText : decision === 'remove' ? colors.removeText : colors.skipText;

  const renderItem = ({ item }: { item: Track }) => {
    const current = decisionFor(item.id);
    const busy = busyIds.has(item.id) || disabled;
    return (
      <View style={[styles.row, { borderBottomColor: colors.quaternary }]} testID={`decision-row-${item.id}`}>
        <View style={styles.rowHeader}>
          <View style={styles.trackText}>
            <Text style={[styles.trackName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
            <Text style={[styles.trackArtist, { color: colors.textSecondary }]} numberOfLines={1}>{item.artist}</Text>
          </View>
          {busyIds.has(item.id) && <ActivityIndicator size="small" color={colors.textSecondary} testID={`decision-busy-${item.id}`} />}
        </View>
        <View style={styles.choices}>
          {CHOICES.map(({ decision, label }) => {
            const selected = current === decision;
            return (
              <TouchableOpacity
                key={decision}
                testID={`decision-${decision}-${item.id}`}
                style={[
                  styles.choice,
                  { backgroundColor: colors.quaternary },
                  selected && { borderColor: decisionColor(decision) },
                ]}
                disabled={busy || selected}
                onPress={() => { void change(item, decision); }}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`${label} ${item.name}`}
                accessibilityState={{ selected, disabled: busy || selected }}
              >
                <Text
                  style={[
                    styles.choiceText,
                    { color: selected ? decisionColor(decision) : colors.textSecondary },
                    selected && styles.choiceTextSelected,
                  ]}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {failedIds.has(item.id) && (
          <Text style={[styles.failed, { color: colors.removeText }]} testID={`decision-failed-${item.id}`}>
            Couldn{'’'}t change it. Check your connection and try again.
          </Text>
        )}
      </View>
    );
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay} testID="decisions-sheet">
        <View style={styles.sheetContainer}>
          <GlassCard intensity="thick" radius={RADIUS.lg} style={styles.sheet}>
            <View style={styles.header}>
              <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">Your decisions</Text>
              <TouchableOpacity onPress={onClose} activeOpacity={0.7} testID="decisions-done" accessibilityRole="button" style={styles.doneButton}>
                <Text style={[styles.doneText, { color: colors.accent }]}>Done</Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.note, { color: colors.textSecondary }]}>
              Change any of them: Sift updates your library to match.
            </Text>
            <FlatList
              data={tracks}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              extraData={[busyIds, failedIds, decisionFor, disabled]}
              style={styles.list}
              testID="decisions-list"
            />
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
    ...CONTENT_COLUMN,
    maxHeight: '80%',
  },
  sheet: {
    paddingBottom: SPACING['4xl'],
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING['2xl'],
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.sm,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
  },
  doneButton: {
    minHeight: 44,
    justifyContent: 'center',
  },
  doneText: {
    fontSize: 17,
    fontWeight: '600',
  },
  note: {
    fontSize: 13,
    paddingHorizontal: SPACING['2xl'],
    paddingBottom: SPACING.lg,
  },
  list: {
    flexGrow: 0,
  },
  row: {
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING['2xl'],
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: SPACING.base,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.base,
  },
  trackText: {
    flex: 1,
  },
  trackName: {
    fontSize: 16,
    fontWeight: '500',
  },
  trackArtist: {
    fontSize: 13,
  },
  choices: {
    flexDirection: 'row',
    gap: SPACING.base,
  },
  choice: {
    flex: 1,
    minHeight: 44,
    borderRadius: RADIUS.sm,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceText: {
    fontSize: 15,
  },
  choiceTextSelected: {
    fontWeight: '700',
  },
  failed: {
    fontSize: 13,
  },
});
