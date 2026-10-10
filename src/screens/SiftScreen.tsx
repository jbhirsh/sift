import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import type { SFSymbol } from 'sf-symbols-typescript';
import {
  useSharedValue,
  withTiming,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { useSift } from '../context/SiftContext';
import { useTheme } from '../theme/ThemeContext';
import { useMusicProvider } from '../hooks/useMusicProvider';
import GlassBackground from '../components/GlassBackground';
import GlassCard from '../components/GlassCard';
import InteractiveCard from '../components/InteractiveCard';
import PlayerControls from '../components/PlayerControls';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../theme';
import { Decision, PROVIDER_DISPLAY } from '../types';
import { loadSeenRemoveNote, markRemoveNoteSeen } from '../services/PreferencesStore';
import { FIRST_REMOVE_NOTE, unsyncedCount } from '../utils/sessionCopy';
import { compactCount } from '../utils/compactCount';

const SEGMENT_COUNT = 10;

export default function SiftScreen() {
  const {
    state,
    dispatch,
    currentTrack,
    nextTrack,
    nextNextTrack,
    remaining,
    decide,
    flushPendingSave,
  } = useSift();

  const { keepTrack, removeTrack } = useMusicProvider();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [isAnimating, setIsAnimating] = useState(false);
  // Synchronous mirror of isAnimating: a swipe-decide followed by an
  // immediate button press can both fire before React re-renders, so the
  // state value alone cannot close the double-decide window.
  const isAnimatingRef = useRef(false);
  const settleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const programmaticOffset = useSharedValue(0);

  const beginDecision = useCallback((): boolean => {
    if (isAnimatingRef.current) return false;
    isAnimatingRef.current = true;
    setIsAnimating(true);
    return true;
  }, []);

  const endDecision = useCallback(() => {
    isAnimatingRef.current = false;
    setIsAnimating(false);
  }, []);

  useEffect(() => {
    return () => {
      if (settleTimeoutRef.current) clearTimeout(settleTimeoutRef.current);
    };
  }, []);

  // One-time note on the first Apple Music library remove (#141): Apple
  // doesn't let apps delete library songs, so say where they went. Inline
  // under the stats, gone with the next decision. The ref starts as "seen"
  // so nothing shows before the stored flag has loaded.
  const removeNoteEligible = state.provider === 'apple-music' && state.source.type === 'library';
  const seenRemoveNoteRef = useRef(true);
  const [showRemoveNote, setShowRemoveNote] = useState(false);
  useEffect(() => {
    let cancelled = false;
    loadSeenRemoveNote().then((seen) => {
      if (!cancelled) seenRemoveNoteRef.current = seen;
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const afterDecision = useCallback((decision: Decision) => {
    setShowRemoveNote(false);
    if (decision === 'remove' && removeNoteEligible && !seenRemoveNoteRef.current) {
      seenRemoveNoteRef.current = true;
      setShowRemoveNote(true);
      markRemoveNoteSeen();
    }
  }, [removeNoteEligible]);

  // Failed removals and keeps parked after a failed add: changes that didn't
  // reach the provider, shown during the sift rather than only on Done.
  // Failed removals are counted the same way Done counts them.
  const unsynced = unsyncedCount(state.removed, state.failedRemovalIds, state.pendingKeeps);

  // Decisions since this screen mounted: one sitting. Finish then Continue
  // sifting remounts it, which starts a new count.
  const [startCursor] = useState(state.cursor);
  const sessionDecisions = Math.max(0, state.cursor - startCursor);

  const progress = state.tracks.length > 0
    ? state.cursor / state.tracks.length
    : 0;

  // Plain function, not useCallback: the React Compiler (enabled in app.json)
  // memoizes it, and hook-argument freezing is what made the shared-value
  // write inside a useCallback an immutability violation.
  const animateDecision = (decision: Decision) => {
    if (!beginDecision()) return;

    const track = currentTrack;
    const direction = decision === 'keep' ? 500 : -500;

    const onComplete = () => {
      decide(decision);
      afterDecision(decision);
      if (track) {
        if (decision === 'remove') removeTrack(track);
        if (decision === 'keep') keepTrack(track);
      }
      programmaticOffset.value = 0;
      endDecision();
    };

    programmaticOffset.value = withTiming(
      direction,
      { duration: 300, easing: Easing.in(Easing.ease) },
      (finished) => {
        if (finished) {
          runOnJS(onComplete)();
        }
      },
    );
  };

  const handleSkip = useCallback(() => {
    // Same synchronous lock as the other decide paths: the disabled prop
    // alone lags a render behind the ref, so a skip tap racing a card swipe
    // could double-decide the still-current track.
    if (!beginDecision()) return;
    decide('skip');
    afterDecision('skip');
    settleTimeoutRef.current = setTimeout(endDecision, 300);
  }, [beginDecision, endDecision, decide, afterDecision]);

  const handleCardDecide = useCallback(
    (decision: Decision) => {
      if (!beginDecision()) return;
      const track = currentTrack;
      decide(decision);
      afterDecision(decision);
      if (track) {
        if (decision === 'remove') removeTrack(track);
        if (decision === 'keep') keepTrack(track);
      }
      // Hold the guard briefly while the swiped card settles so a button
      // press right after a swipe cannot decide the next card too.
      settleTimeoutRef.current = setTimeout(endDecision, 300);
    },
    [beginDecision, endDecision, decide, afterDecision, currentTrack, removeTrack, keepTrack],
  );

  return (
    <View style={styles.root}>
      <GlassBackground phase="sifting" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <GlassCard intensity="thin" radius={20}>
          <TouchableOpacity
            onPress={() => {
              // Persist any debounced-but-unsaved decisions before leaving —
              // the autosave effect's cleanup would otherwise cancel them.
              flushPendingSave();
              dispatch({ type: 'SET_IS_PLAYING', isPlaying: false });
              dispatch({ type: 'SET_PHASE', phase: 'setup' });
            }}
            style={styles.backButton}
            testID="back-button"
          >
            <SymbolView name="chevron.backward" size={18} tintColor={colors.textSecondary} />
          </TouchableOpacity>
        </GlassCard>

        {/* End the sift here and see the summary (#142). In the header, not
            a menu, where a first-time user will find it. The session stays,
            so Done's Continue sifting picks up at the next card. */}
        <GlassCard intensity="thin" radius={20}>
          <TouchableOpacity
            onPress={() => {
              // Not mid-decision: the Keep/Remove animation decides only
              // when it ends, and finishing first would drop that decision
              // or land it under Done.
              if (isAnimatingRef.current) return;
              flushPendingSave();
              dispatch({ type: 'FINISH' });
            }}
            disabled={isAnimating}
            style={styles.finishButton}
            testID="finish-button"
            accessibilityRole="button"
            accessibilityHint="Ends this sift here and shows your summary"
          >
            {/* Capped so the largest text sizes can't push it under the
                centered title. */}
            <Text style={[styles.finishText, { color: colors.text }]} maxFontSizeMultiplier={1.3}>Finish</Text>
          </TouchableOpacity>
        </GlassCard>

        {/* Centered on the screen, not between the header's buttons. */}
        <Text
          style={[styles.title, { color: colors.text, top: insets.top + 8 }]}
          pointerEvents="none"
          maxFontSizeMultiplier={1.3}
        >
          Sift
        </Text>
      </View>

      {/* Stats row in glass pill */}
      <View style={styles.statsRowContainer}>
        <GlassCard intensity="thin" radius={RADIUS.lg}>
          <View style={styles.statsRow}>
            {/* "left" leads: it's the number that answers "how much more?" */}
            <StatBadge label="left" value={remaining} color={colors.textTertiary} textColor={colors.textSecondary} testID="remaining-count" />
            <StatBadge label="kept" value={state.kept.length} color={COLORS.keep} textColor={colors.textSecondary} testID="stat-kept" />
            <StatBadge label="removed" value={state.removed.length} color={COLORS.remove} textColor={colors.textSecondary} testID="stat-removed" />
            <StatBadge label="skipped" value={state.skipped.length} color={COLORS.skip} textColor={colors.textSecondary} testID="stat-skipped" />
          </View>
        </GlassCard>
      </View>

      {/* Progress segments */}
      <View style={styles.progressRow}>
        {Array.from({ length: SEGMENT_COUNT }, (_, i) => {
          const filled = i / SEGMENT_COUNT < progress;
          return (
            <View
              key={i}
              style={[
                styles.progressSegment,
                // The unfilled track uses textTertiary (3:1 on the background)
                // so progress doesn't read as loose dashes; the text-colored
                // fill stays well apart from it (about 5:1), not by hue alone.
                filled
                  ? { backgroundColor: colors.text }
                  : { backgroundColor: colors.textTertiary },
              ]}
            />
          );
        })}
      </View>
      {/* On a big library the segments barely move in one sitting, so count
          what this sitting has done (#142). Always rendered, so the first
          decision doesn't shift the card. */}
      <Text style={[styles.sessionCount, { color: colors.textSecondary }]} testID="session-count">
        This session: {compactCount(sessionDecisions)}
      </Text>

      {/* Card stack. The back cards hide behind the front card at rest and
          show while it is dragged or flies off. */}
      <View style={styles.cardArea}>
        {nextNextTrack != null && (
          <View style={[
            styles.backCard,
            styles.backCard2,
            { backgroundColor: isDark ? colors.surface : colors.background },
          ]} />
        )}
        {nextTrack != null && (
          <View style={[
            styles.backCard,
            styles.backCard1,
            { backgroundColor: isDark ? colors.surface : colors.background },
          ]} />
        )}
        {currentTrack != null && (
          <InteractiveCard
            track={currentTrack}
            onDecide={handleCardDecide}
            programmaticOffset={programmaticOffset}
          />
        )}
        {/* Over the top of the card, not in the layout: appearing mid-sift
            must not shrink the card under the user's thumb. Touches pass
            through to the card. */}
        <View style={styles.cardOverlay} pointerEvents="none">
          {unsynced > 0 && (
            <Text
              testID="unsynced-chip"
              accessibilityLabel={`${unsynced} ${unsynced === 1 ? 'change' : 'changes'} didn't reach ${PROVIDER_DISPLAY[state.provider]}`}
              // Opaque surface behind it: it sits over artwork of any color.
              style={[styles.unsyncedChip, { color: colors.skipText, backgroundColor: colors.surface }]}
            >
              {`${unsynced} didn\u2019t sync`}
            </Text>
          )}
          {showRemoveNote && (
            <View style={styles.removeNote}>
              <GlassCard intensity="thin" radius={RADIUS.md}>
                <Text testID="first-remove-note" style={[styles.removeNoteText, { color: colors.textSecondary }]}>
                  {FIRST_REMOVE_NOTE}
                </Text>
              </GlassCard>
            </View>
          )}
        </View>
      </View>

      {/* Player controls */}
      <View style={styles.playerControls}>
        <PlayerControls />
      </View>

      {/* Action buttons */}
      <View style={styles.actionsRow}>
        <ActionButton
          symbolName="xmark.circle.fill"
          label="Remove"
          color={COLORS.remove}
          labelColor={colors.textSecondary}
          onPress={() => animateDecision('remove')}
          disabled={isAnimating}
        />
        <ActionButton
          symbolName="arrow.right.circle"
          label="Skip"
          color={COLORS.skip}
          labelColor={colors.textSecondary}
          onPress={handleSkip}
          disabled={isAnimating}
        />
        <ActionButton
          symbolName="checkmark.circle.fill"
          label="Keep"
          color={COLORS.keep}
          labelColor={colors.textSecondary}
          onPress={() => animateDecision('keep')}
          disabled={isAnimating}
        />
      </View>
    </View>
  );
}

// ── Subcomponents ──────────────────────────────────────

function StatBadge({
  label,
  value,
  color,
  textColor,
  testID,
}: {
  label: string;
  value: number;
  color: string;
  textColor: string;
  testID: string;
}) {
  return (
    <View style={statStyles.container}>
      <View style={[statStyles.dot, { backgroundColor: color }]} />
      <Text
        style={[statStyles.text, { color: textColor }]}
        testID={testID}
        numberOfLines={1}
        accessibilityLabel={`${value} ${label}`}
      >
        {compactCount(value)} {label}
      </Text>
    </View>
  );
}

const statStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    // Backstop for a narrow screen: shrink a badge rather than clip it.
    flexShrink: 1,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  text: {
    fontSize: 11,
    flexShrink: 1,
  },
});

function ActionButton({
  symbolName,
  label,
  color,
  labelColor,
  onPress,
  disabled,
}: {
  symbolName: string;
  label: string;
  color: string;
  labelColor: string;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={actionStyles.wrapper}
      accessibilityLabel={label}
    >
      <GlassCard intensity="regular" radius={32}>
        <View style={actionStyles.circle}>
          <SymbolView name={symbolName as SFSymbol} size={28} tintColor={color} />
        </View>
      </GlassCard>
      <Text style={[actionStyles.label, { color: labelColor }]}>{label.toUpperCase()}</Text>
    </TouchableOpacity>
  );
}

const actionStyles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    gap: 6,
  },
  circle: {
    width: 64,
    height: 64,
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
  },
});

// ── Main styles ────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING['2xl'],
    paddingVertical: SPACING.lg,
    gap: SPACING.base,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  finishButton: {
    height: 40,
    paddingHorizontal: SPACING.xl,
    justifyContent: 'center',
  },
  finishText: {
    fontSize: 15,
    fontWeight: '600',
  },
  title: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 40,
    lineHeight: 40,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: 'bold',
  },
  statsRowContainer: {
    paddingHorizontal: SPACING['2xl'],
    paddingBottom: SPACING.base,
  },
  cardOverlay: {
    position: 'absolute',
    top: SPACING.base,
    left: SPACING['2xl'],
    right: SPACING['2xl'],
    alignItems: 'center',
    gap: SPACING.base,
  },
  unsyncedChip: {
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: SPACING.base,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.sm,
    overflow: 'hidden',
  },
  removeNote: {
    alignSelf: 'stretch',
  },
  removeNoteText: {
    fontSize: 13,
    padding: SPACING.lg,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  progressRow: {
    flexDirection: 'row',
    gap: 3,
    paddingHorizontal: 48,
    paddingBottom: SPACING.md,
  },
  sessionCount: {
    fontSize: 11,
    textAlign: 'center',
    paddingBottom: SPACING.base,
  },
  progressSegment: {
    flex: 1,
    height: 3,
    borderRadius: 2,
  },
  cardArea: {
    flex: 1,
    paddingHorizontal: 12,
  },
  backCard: {
    position: 'absolute',
    left: 12,
    right: 12,
    top: 0,
    bottom: 0,
    borderRadius: RADIUS.xl,
    ...SHADOWS.subtle,
  },
  backCard2: {
    transform: [{ scale: 0.94 }, { translateY: -12 }],
    opacity: 0.4,
  },
  backCard1: {
    transform: [{ scale: 0.97 }, { translateY: -6 }],
    opacity: 0.6,
  },
  playerControls: {
    paddingHorizontal: SPACING['2xl'],
    paddingVertical: SPACING.base,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 40,
    paddingBottom: 32,
  },
});
