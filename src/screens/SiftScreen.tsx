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
import { RADIUS, SPACING } from '../theme';
import { Decision } from '../types';

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
    settleTimeoutRef.current = setTimeout(endDecision, 300);
  }, [beginDecision, endDecision, decide]);

  const handleCardDecide = useCallback(
    (decision: Decision) => {
      if (!beginDecision()) return;
      const track = currentTrack;
      decide(decision);
      if (track) {
        if (decision === 'remove') removeTrack(track);
        if (decision === 'keep') keepTrack(track);
      }
      // Hold the guard briefly while the swiped card settles so a button
      // press right after a swipe cannot decide the next card too.
      settleTimeoutRef.current = setTimeout(endDecision, 300);
    },
    [beginDecision, endDecision, decide, currentTrack, removeTrack, keepTrack],
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

        <Text style={[styles.title, { color: colors.text }]}>Sift</Text>

        <View style={styles.headerSpacer} />
      </View>

      {/* Stats row in glass pill */}
      <View style={styles.statsRowContainer}>
        <GlassCard intensity="thin" radius={RADIUS.lg}>
          <View style={styles.statsRow}>
            <StatBadge label="kept" value={state.kept.length} color="#34C759" textColor={colors.textSecondary} testID="stat-kept" />
            <StatBadge label="removed" value={state.removed.length} color="#FF3B30" textColor={colors.textSecondary} testID="stat-removed" />
            <StatBadge label="skipped" value={state.skipped.length} color="#FF9500" textColor={colors.textSecondary} testID="stat-skipped" />
            <StatBadge label="left" value={remaining} color={colors.textTertiary} textColor={colors.textSecondary} testID="remaining-count" />
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
                filled
                  ? { backgroundColor: colors.text }
                  : { backgroundColor: colors.quaternary },
              ]}
            />
          );
        })}
      </View>

      {/* Card stack */}
      <View style={styles.cardArea}>
        {/* Back card 2 */}
        {nextNextTrack != null && (
          <View style={[
            styles.backCard,
            styles.backCard2,
            { backgroundColor: isDark ? colors.surface : '#fff' },
          ]} />
        )}
        {/* Back card 1 */}
        {nextTrack != null && (
          <View style={[
            styles.backCard,
            styles.backCard1,
            { backgroundColor: isDark ? colors.surface : '#fff' },
          ]} />
        )}
        {/* Front card */}
        {currentTrack != null && (
          <InteractiveCard
            track={currentTrack}
            onDecide={handleCardDecide}
            programmaticOffset={programmaticOffset}
          />
        )}
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
          color="#FF3B30"
          onPress={() => animateDecision('remove')}
          disabled={isAnimating}
        />
        <ActionButton
          symbolName="arrow.right.circle"
          label="Skip"
          color="#FF9500"
          onPress={handleSkip}
          disabled={isAnimating}
        />
        <ActionButton
          symbolName="checkmark.circle.fill"
          label="Keep"
          color="#34C759"
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
      <Text style={[statStyles.text, { color: textColor }]} testID={testID}>
        {value} {label}
      </Text>
    </View>
  );
}

const statStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  text: {
    fontSize: 11,
  },
});

function ActionButton({
  symbolName,
  label,
  color,
  onPress,
  disabled,
}: {
  symbolName: string;
  label: string;
  color: string;
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
      <Text style={actionStyles.label}>{label.toUpperCase()}</Text>
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
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(60, 60, 67, 0.6)',
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
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: 'bold',
  },
  headerSpacer: {
    width: 40,
  },
  statsRowContainer: {
    paddingHorizontal: SPACING['2xl'],
    paddingBottom: SPACING.base,
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
    paddingBottom: 16,
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
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
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
