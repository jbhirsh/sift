import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import {
  useSharedValue,
  withTiming,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { useSift } from '../context/SiftContext';
import InteractiveCard from '../components/InteractiveCard';
import PlayerControls from '../components/PlayerControls';
import { Decision } from '../types';

const SEGMENT_COUNT = 10;

export default function SiftScreen() {
  const {
    state,
    currentTrack,
    nextTrack,
    nextNextTrack,
    remaining,
    decide,
    stopSession,
  } = useSift();

  const insets = useSafeAreaInsets();
  const [isAnimating, setIsAnimating] = useState(false);
  const programmaticOffset = useSharedValue(0);

  const progress = state.tracks.length > 0
    ? state.cursor / state.tracks.length
    : 0;

  const animateDecision = useCallback(
    (decision: Decision) => {
      if (isAnimating) return;
      setIsAnimating(true);

      const direction = decision === 'keep' ? 500 : -500;

      const onComplete = () => {
        decide(decision);
        programmaticOffset.value = 0;
        setIsAnimating(false);
      };

      // eslint-disable-next-line react-hooks/immutability
      programmaticOffset.value = withTiming(
        direction,
        { duration: 300, easing: Easing.in(Easing.ease) },
        (finished) => {
          if (finished) {
            runOnJS(onComplete)();
          }
        },
      );
    },
    [isAnimating, decide, programmaticOffset],
  );

  const handleSkip = useCallback(() => {
    decide('skip');
  }, [decide]);

  const handleCardDecide = useCallback(
    (decision: Decision) => {
      decide(decision);
    },
    [decide],
  );

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          onPress={stopSession}
          style={styles.backButton}
          testID="stop-button"
        >
          <SymbolView name="chevron.backward" size={22} tintColor="rgba(60,60,67,0.6)" />
        </TouchableOpacity>

        <Text style={styles.title}>Sift</Text>

        <Text style={styles.remaining} testID="remaining-count">
          {remaining} left
        </Text>
      </View>

      {/* Stats row */}
      <View style={styles.statsRow}>
        <StatBadge label="kept" value={state.kept.length} color="#34C759" testID="stat-kept" />
        <StatBadge label="removed" value={state.removed.length} color="#FF3B30" testID="stat-removed" />
        <StatBadge label="skipped" value={state.skipped.length} color="#FF9500" testID="stat-skipped" />
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
                filled ? styles.segmentFilled : styles.segmentEmpty,
              ]}
            />
          );
        })}
      </View>

      {/* Card stack */}
      <View style={styles.cardArea}>
        {/* Back card 2 */}
        {nextNextTrack != null && (
          <View style={[styles.backCard, styles.backCard2]} />
        )}
        {/* Back card 1 */}
        {nextTrack != null && (
          <View style={[styles.backCard, styles.backCard1]} />
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
  testID,
}: {
  label: string;
  value: number;
  color: string;
  testID: string;
}) {
  return (
    <View style={statStyles.container}>
      <View style={[statStyles.dot, { backgroundColor: color }]} />
      <Text style={statStyles.text} testID={testID}>
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
    color: 'rgba(60, 60, 67, 0.6)',
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
      <View style={actionStyles.circle}>
        <SymbolView name={symbolName as any} size={28} tintColor={color} />
      </View>
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
    borderRadius: 32,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  icon: {
    fontSize: 24,
    fontWeight: '600',
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
    backgroundColor: '#F2F2F7',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(120, 120, 128, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backIcon: {
    fontSize: 24,
    fontWeight: '500',
    color: 'rgba(60, 60, 67, 0.6)',
    marginTop: -2,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: 'bold',
  },
  remaining: {
    fontSize: 13,
    color: 'rgba(60, 60, 67, 0.6)',
    minWidth: 40,
    textAlign: 'right',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 16,
    paddingHorizontal: 24,
    paddingBottom: 8,
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
  segmentFilled: {
    backgroundColor: '#000',
  },
  segmentEmpty: {
    backgroundColor: 'rgba(120, 120, 128, 0.12)',
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
    backgroundColor: '#fff',
    borderRadius: 20,
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
    paddingHorizontal: 24,
    paddingVertical: 8,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 40,
    paddingBottom: 32,
  },
});
