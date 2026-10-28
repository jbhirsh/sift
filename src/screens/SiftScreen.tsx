import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  GestureResponderEvent,
  LayoutChangeEvent,
  useWindowDimensions,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import type { SFSymbol } from 'sf-symbols-typescript';
import { useSharedValue, withTiming, Easing, runOnJS } from 'react-native-reanimated';
import { useSift } from '../context/SiftContext';
import { useTheme } from '../theme/ThemeContext';
import GlassBackground from '../components/GlassBackground';
import GlassCard from '../components/GlassCard';
import InteractiveCard from '../components/InteractiveCard';
import PlayerControls from '../components/PlayerControls';
import { COLORS, RADIUS, SETTINGS_BUTTON, SHADOWS, SPACING, UNDO_PILL } from '../theme';
import { Decision, PendingDecision, PROVIDER_DISPLAY, Track } from '../types';
import {
  loadSeenRemoveNote,
  loadSeenSwipeHint,
  markRemoveNoteSeen,
  markSwipeHintSeen,
} from '../services/PreferencesStore';
import {
  decisionAnnouncement,
  failedRemovalCount,
  FIRST_REMOVE_NOTE,
  SWIPE_HINT,
  undoMessage,
} from '../utils/sessionCopy';
import { collectsRemovals } from '../utils/libraryRemovals';
import { useHoldPendingDecision, useSendPending, wasSent } from '../hooks/usePendingDecision';
import { useRemovalRetry } from '../hooks/useRemovalRetry';
import UndoPill from '../components/UndoPill';
import DecisionsSheet from '../components/DecisionsSheet';
import { useDecisionsSheet } from '../hooks/useReviseDecision';
import { decidedLatestFirst } from '../utils/decisions';
import { compactCount } from '../utils/compactCount';
import { cardSize, flyOffDistance } from '../utils/cardLayout';
import { decisionHaptic, undoHaptic } from '../services/haptics';
import { useTraceScreen } from '../hooks/useTrace';
import { trace } from '../services/trace';
import { createDecisionGuard } from '../utils/decisionGuard';

const SEGMENT_COUNT = 10;
// How long after a press before the next decision can be pressed: a Skip's
// settle; a button's Keep or Remove, its 300 ms fly-off; a swipe, its 200 ms
// fly-off and 150 ms more as the next card lands, so a tap meant for the
// swiped card can't decide the next one.
const SKIP_HOLD_MS = 300;
const BUTTON_HOLD_MS = 300;
const SWIPE_HOLD_MS = 350;

// A touch stamped further from now than this is on some other clock: judge
// it as now, rather than hold the guard for years.
const MAX_TOUCH_AGE_MS = 60_000;

/**
 * When a press happened: when the finger lifted, on the touch's own clock
 * (the same clock as performance.now()), not when JavaScript got to it. A
 * swipe or a VoiceOver action has no touch: now.
 */
function pressTime(event?: GestureResponderEvent): number {
  const now = performance.now();
  const touched = event?.nativeEvent?.timestamp;
  return touched != null && Math.abs(now - touched) < MAX_TOUCH_AGE_MS ? touched : now;
}
// The action buttons' bottom padding and label line height, which place the
// Undo pill on the label row.
const ACTIONS_BOTTOM_PADDING = SPACING['3xl'];
const ACTION_LABEL_LINE_HEIGHT = 16;

export default function SiftScreen() {
  useTraceScreen('sift');
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

  // Decisions reach the music service after the undo window (#152).
  const sendPending = useSendPending();
  useHoldPendingDecision(sendPending);
  useRemovalRetry();
  // Every decision so far, changeable (beyond Undo's last one).
  const { revise, showDecisions, setShowDecisions, decisionOf } = useDecisionsSheet(sendPending);
  // The last card's decision goes now: Done has no Undo to hold it for.
  const sendIfLast = useCallback(
    (held: PendingDecision | null) => {
      if (held && state.tracks[state.tracks.length - 1]?.id === held.trackId) sendPending(held);
    },
    [sendPending, state.tracks],
  );
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  // One decision at a time (utils/decisionGuard). Every way to decide, and
  // Finish, Undo, Back and the decisions list, asks it at the press. No
  // button is disabled for it and no timer lets it go: both change only when
  // JavaScript next runs, and after a stall the queued taps run first.
  const [guard] = useState(createDecisionGuard);
  // Decisions pressed while the one before wasn't on screen yet: each runs
  // once that one is, with its state.
  const waitingRef = useRef<{ decision: Decision; swiped: boolean }[]>([]);
  // The card can't be dragged from a decision's press until it's on screen.
  const [isAnimating, setIsAnimating] = useState(false);
  const programmaticOffset = useSharedValue(0);

  // One-time note on the first Apple Music library remove (#141): Apple
  // doesn't let apps delete library songs, so say where they went. Inline
  // under the stats, gone with the next decision. The ref starts as "seen"
  // so nothing shows before the stored flag has loaded.
  const removeNoteEligible = collectsRemovals(state.provider);
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
  // One-time hint on the first card ever: nothing else tells a sighted user
  // which way is Keep. Gone with the first decision, which marks it seen.
  const [showSwipeHint, setShowSwipeHint] = useState(false);
  useEffect(() => {
    let cancelled = false;
    loadSeenSwipeHint().then((seen) => {
      if (!cancelled && !seen) setShowSwipeHint(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const afterDecision = useCallback(
    (decision: Decision, track: Track | undefined) => {
      // Say what happened: a swipe or button gives a sighted user motion,
      // VoiceOver nothing (#146).
      if (track)
        AccessibilityInfo.announceForAccessibility(decisionAnnouncement(track.name, decision));
      if (showSwipeHint) {
        setShowSwipeHint(false);
        markSwipeHintSeen();
      }
      setShowRemoveNote(false);
      if (decision === 'remove' && removeNoteEligible && !seenRemoveNoteRef.current) {
        seenRemoveNoteRef.current = true;
        setShowRemoveNote(true);
        markRemoveNoteSeen();
      }
    },
    [removeNoteEligible, showSwipeHint],
  );

  // Failed removals: changes that didn't reach the provider, shown during
  // the sift rather than only on Done, and counted the same way Done counts
  // them. (A keep writes nothing to the provider, so it can't fail to.)
  const unsynced = failedRemovalCount(state.removed, state.failedRemovalIds);

  // Decisions since this screen mounted: one sitting. Finish then Continue
  // sifting remounts it, which starts a new count.
  const [startCursor] = useState(state.cursor);
  const sessionDecisions = Math.max(0, state.cursor - startCursor);

  // The card's size for the space it gets (#149): the whole space on a
  // phone; on iPad, clamped so square artwork isn't cropped to a strip.
  // Until the first layout the stack just fills the area, as on a phone.
  const { width: windowWidth } = useWindowDimensions();
  const [cardStackSize, setCardStackSize] = useState<{ width: number; height: number } | null>(
    null,
  );
  const onCardAreaLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    const next = cardSize(width - CARD_AREA_GUTTER * 2, height);
    setCardStackSize((prev) =>
      prev?.width === next.width && prev.height === next.height ? prev : next,
    );
  };

  const showUndo =
    state.pending != null &&
    state.tracks[state.cursor - 1]?.id === state.pending.trackId &&
    !wasSent(state.pending);

  const progress = state.tracks.length > 0 ? state.cursor / state.tracks.length : 0;

  // Plain function, not useCallback: the React Compiler (enabled in app.json)
  // memoizes it, and hook-argument freezing is what made the shared-value
  // write inside a useCallback an immutability violation.
  // A swipe's card flies off from where it was let go, faster: it's
  // already moving.
  const runDecision = (decision: Decision, swiped: boolean) => {
    const track = currentTrack;
    const land = () => {
      // The previous decision can't be undone any more: send it.
      sendPending(state.pending);
      sendIfLast(decide(decision));
      afterDecision(decision, track);
    };
    if (decision === 'skip') {
      land();
      return;
    }

    // Far enough to leave the window from its middle, on any width.
    const distance = flyOffDistance(windowWidth);
    const direction = decision === 'keep' ? distance : -distance;
    const onComplete = () => {
      land();
      programmaticOffset.value = 0;
    };
    programmaticOffset.value = withTiming(
      direction,
      swiped
        ? { duration: 200, easing: Easing.out(Easing.ease) }
        : { duration: 300, easing: Easing.in(Easing.ease) },
      (finished) => {
        if (finished) {
          runOnJS(onComplete)();
        }
      },
    );
  };
  // The latest render's, for a waiting decision to run with.
  const runDecisionRef = useRef(runDecision);
  useEffect(() => {
    runDecisionRef.current = runDecision;
  });

  // Every decide path: judged at the press, then run now, or once the
  // decision before it is on screen. Only a Skip waits: a Keep or Remove
  // would land on a card the user hasn't seen. False when turned away.
  const requestDecision = (decision: Decision, swiped: boolean, at: number): boolean => {
    const input = swiped ? `swipe-${decision}` : decision;
    const hold = decision === 'skip' ? SKIP_HOLD_MS : swiped ? SWIPE_HOLD_MS : BUTTON_HOLD_MS;
    const judged = guard.press(at, hold, decision === 'skip');
    if (judged.verdict === 'busy') {
      trace('guard-busy', { input, held: Math.max(0, Math.round(judged.sinceMs)) });
      return false;
    }
    trace(`guard-${judged.verdict}`, { input });
    // Felt at the press, even when it waits to run.
    decisionHaptic(decision);
    setIsAnimating(true);
    if (judged.verdict === 'wait') waitingRef.current.push({ decision, swiped });
    else runDecision(decision, swiped);
    return true;
  };

  // When React showed the next card: a decision's lines come at the press,
  // this one when it's on screen.
  useEffect(() => {
    trace('cursor', { at: state.cursor, of: state.tracks.length });
  }, [state.cursor, state.tracks.length]);

  // A decision on screen (the card moved): the next waiting one goes, with
  // this state, or the card can be dragged again.
  useEffect(() => {
    const next = guard.shown() ? waitingRef.current.shift() : undefined;
    if (next) runDecisionRef.current(next.decision, next.swiped);
    else setIsAnimating(false);
  }, [state.cursor, guard]);

  // Mid-decision or in its hold, for Finish, Undo and the list.
  const deciding = (event?: GestureResponderEvent) => guard.busy(pressTime(event));

  // A swipe, or a VoiceOver action on the card. The card springs back when
  // it's turned away.
  const handleCardDecide = (decision: Decision): boolean =>
    requestDecision(decision, decision !== 'skip', performance.now());

  return (
    <View style={styles.root}>
      <GlassBackground phase="sifting" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <GlassCard intensity="thin" radius={20}>
          <TouchableOpacity
            onPress={() => {
              // Not while a decision is under way: a Keep or Remove landing
              // after this would decide on a screen that's gone.
              if (guard.underWay()) return;
              // Persist any debounced-but-unsaved decisions before leaving —
              // the autosave effect's cleanup would otherwise cancel them.
              flushPendingSave();
              dispatch({ type: 'SET_IS_PLAYING', isPlaying: false });
              // Sent while this screen is still up (see sendIfLast).
              sendPending(state.pending);
              dispatch({ type: 'SET_PHASE', phase: 'setup' });
            }}
            style={styles.backButton}
            testID="back-button"
            accessibilityRole="button"
            accessibilityLabel="Back"
            accessibilityHint="Your progress is saved"
          >
            <SymbolView name="chevron.backward" size={18} tintColor={colors.textSecondary} />
          </TouchableOpacity>
        </GlassCard>

        {/* End the sift here and see the summary (#142). In the header, not
            a menu, where a first-time user will find it. The session stays,
            so Done's Continue sifting picks up at the next card. */}
        <GlassCard intensity="thin" radius={20}>
          <TouchableOpacity
            onPress={(event) => {
              // Not mid-decision: the Keep/Remove animation decides only
              // when it ends, and finishing first would drop that decision
              // or land it under Done.
              if (deciding(event)) return;
              sendPending(state.pending);
              flushPendingSave();
              dispatch({ type: 'FINISH' });
            }}
            style={styles.finishButton}
            testID="finish-button"
            accessibilityRole="button"
            accessibilityHint="Ends this sift here and shows your summary"
          >
            {/* Capped so the largest text sizes can't push it under the
                centered title. */}
            <Text style={[styles.finishText, { color: colors.text }]} maxFontSizeMultiplier={1.3}>
              Finish
            </Text>
          </TouchableOpacity>
        </GlassCard>

        <View style={{ flex: 1 }} />
        {state.cursor > 0 && (
          <GlassCard intensity="thin" radius={20}>
            <TouchableOpacity
              onPress={(event) => {
                if (!deciding(event)) setShowDecisions(true);
              }}
              style={styles.backButton}
              testID="decisions-button"
              accessibilityRole="button"
              accessibilityLabel="Your decisions"
              accessibilityHint="Lists this sift's decisions, to change any of them"
            >
              <SymbolView
                name="clock.arrow.circlepath"
                size={18}
                tintColor={colors.textSecondary}
              />
            </TouchableOpacity>
          </GlassCard>
        )}
        {/* The app's floating Settings gear (App.tsx) sits here, in line
            with the header: keep its place clear. */}
        <View style={{ width: SETTINGS_BUTTON.size }} />

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
            <StatBadge
              label="left"
              value={remaining}
              color={colors.textTertiary}
              textColor={colors.textSecondary}
              testID="remaining-count"
            />
            <StatBadge
              label="kept"
              value={state.kept.length}
              color={COLORS.keep}
              textColor={colors.textSecondary}
              testID="stat-kept"
            />
            <StatBadge
              label="removed"
              value={state.removed.length}
              color={COLORS.remove}
              textColor={colors.textSecondary}
              testID="stat-removed"
            />
            <StatBadge
              label="skipped"
              value={state.skipped.length}
              color={COLORS.skip}
              textColor={colors.textSecondary}
              testID="stat-skipped"
            />
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
      <View style={styles.cardArea} onLayout={onCardAreaLayout} testID="card-area">
        <View style={cardStackSize ?? styles.cardStackFill} testID="card-stack">
          {nextNextTrack != null && (
            <View
              style={[
                styles.backCard,
                styles.backCard2,
                { backgroundColor: isDark ? colors.surface : colors.background },
              ]}
            />
          )}
          {nextTrack != null && (
            <View
              style={[
                styles.backCard,
                styles.backCard1,
                { backgroundColor: isDark ? colors.surface : colors.background },
              ]}
            />
          )}
          {currentTrack != null && (
            <InteractiveCard
              // A new card per song: it starts in the middle with its own
              // artwork, never the last card's drag or picture.
              key={currentTrack.id}
              track={currentTrack}
              onDecide={handleCardDecide}
              programmaticOffset={programmaticOffset}
              disabled={isAnimating}
              artworkRetryKey={state.songCacheGeneration}
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
                style={[
                  styles.unsyncedChip,
                  { color: colors.skipText, backgroundColor: colors.surface },
                ]}
              >
                {`${unsynced} didn\u2019t sync`}
              </Text>
            )}
            {showSwipeHint && (
              // Opaque, like the sync chip: it sits over artwork of any color.
              <Text
                testID="swipe-hint"
                style={[styles.swipeHint, { color: colors.text, backgroundColor: colors.surface }]}
              >
                {SWIPE_HINT}
              </Text>
            )}
            {showRemoveNote && (
              <View style={styles.removeNote}>
                <GlassCard intensity="thin" radius={RADIUS.md}>
                  <Text
                    testID="first-remove-note"
                    style={[styles.removeNoteText, { color: colors.textSecondary }]}
                  >
                    {FIRST_REMOVE_NOTE}
                  </Text>
                </GlassCard>
              </View>
            )}
          </View>
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
          hideLabel={showUndo}
          label="Remove"
          testID="action-remove"
          color={COLORS.remove}
          labelColor={colors.textSecondary}
          onPress={(event) => {
            requestDecision('remove', false, pressTime(event));
          }}
        />
        <ActionButton
          symbolName="arrow.right.circle"
          hideLabel={showUndo}
          label="Skip"
          testID="action-skip"
          color={COLORS.skip}
          labelColor={colors.textSecondary}
          onPress={(event) => {
            requestDecision('skip', false, pressTime(event));
          }}
        />
        <ActionButton
          symbolName="checkmark.circle.fill"
          hideLabel={showUndo}
          label="Keep"
          testID="action-keep"
          color={COLORS.keep}
          labelColor={colors.textSecondary}
          onPress={(event) => {
            requestDecision('keep', false, pressTime(event));
          }}
        />
        {/* Undo the latest decision while it hasn't been sent (#152): in
            thumb reach, over the buttons' label row, whose labels step aside
            while it shows. No space of its own, so the card never shrinks or
            jumps, and clear of the home indicator. After the buttons, so it's
            drawn over the Skip button's label and takes the tap. */}
        {showUndo && state.pending && (
          <View style={styles.undoRow} pointerEvents="box-none">
            <UndoPill
              testID="undo-pill"
              accessibilityLabel={`Undo: ${undoMessage(state.tracks[state.cursor - 1].name, state.pending.decision)}`}
              onPress={(event) => {
                if (deciding(event)) return;
                undoHaptic();
                dispatch({ type: 'UNDO_LAST' });
              }}
            />
          </View>
        )}
      </View>

      {showDecisions && (
        <DecisionsSheet
          tracks={decidedLatestFirst(state.tracks, state.cursor)}
          decisionFor={decisionOf}
          onRevise={revise}
          onClose={() => setShowDecisions(false)}
        />
      )}
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
  testID,
  color,
  labelColor,
  onPress,
  hideLabel,
}: {
  symbolName: string;
  label: string;
  /**
   * What E2E flows tap. Not the label: on React Native 0.88 the printed
   * label under the button is an element of its own, which a flow's text
   * match finds first, and its centre sits where the Undo pill shows.
   */
  testID: string;
  color: string;
  labelColor: string;
  onPress: (event: GestureResponderEvent) => void;
  /** Hidden but still laid out, so the row doesn't move. */
  hideLabel: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={actionStyles.wrapper}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <GlassCard intensity="regular" radius={32}>
        <View style={actionStyles.circle}>
          <SymbolView name={symbolName as SFSymbol} size={28} tintColor={color} />
        </View>
      </GlassCard>
      <Text style={[actionStyles.label, { color: labelColor, opacity: hideLabel ? 0 : 1 }]}>
        {label.toUpperCase()}
      </Text>
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
    lineHeight: ACTION_LABEL_LINE_HEIGHT,
    fontWeight: '600',
  },
});

// ── Main styles ────────────────────────────────────────

/** The card area's side margins: the card's inset from the screen edge. */
const CARD_AREA_GUTTER = SPACING.lg;

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
    left: SPACING['2xl'] - CARD_AREA_GUTTER,
    right: SPACING['2xl'] - CARD_AREA_GUTTER,
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
  swipeHint: {
    fontSize: 15,
    fontWeight: '600',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.base,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
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
    paddingHorizontal: CARD_AREA_GUTTER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardStackFill: {
    flex: 1,
    alignSelf: 'stretch',
  },
  backCard: {
    position: 'absolute',
    left: 0,
    right: 0,
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
    paddingBottom: ACTIONS_BOTTOM_PADDING,
  },
  undoRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    // Centred on the label row, the last thing above the bottom padding.
    bottom: ACTIONS_BOTTOM_PADDING + ACTION_LABEL_LINE_HEIGHT / 2 - UNDO_PILL.height / 2,
    alignItems: 'center',
  },
});
