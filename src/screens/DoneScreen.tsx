import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Platform,
  Clipboard,
  Alert,
} from 'react-native';
import type { Track } from '../types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import type { SFSymbol } from 'sf-symbols-typescript';
import { useSift } from '../context/SiftContext';
import { useTheme } from '../theme/ThemeContext';
import { useMusicProvider } from '../hooks/useMusicProvider';
import { useSendPending } from '../hooks/usePendingDecision';
import { useRemovalRetry } from '../hooks/useRemovalRetry';
import { useReviseDecision } from '../hooks/useReviseDecision';
import DecisionsSheet from '../components/DecisionsSheet';
import { decidedLatestFirst, decisionFor } from '../utils/decisions';
import { clearHistoryForSource } from '../services/RemovalHistoryStore';
import { loadReviewedIds } from '../services/ReviewedLedgerStore';
import { ledgerKey } from '../utils/reviewedLedger';
import GlassBackground from '../components/GlassBackground';
import GlassCard from '../components/GlassCard';
import { Button } from '../components/Button';
import {
  decisionCounts,
  DELETE_IN_MUSIC_HINT,
  discardConfirmation,
  doneHeadline,
  failedRemovalCount,
  keptSaveFailure,
  keptSaveMessage,
  nothingRemovedNote,
  playlistStartOverMessage,
  removedListSubtitle,
  SAVE_KEPT_TITLE,
  siftedPlaylistName,
} from '../utils/sessionCopy';
import { collectsRemovals } from '../utils/libraryRemovals';
import { COLORS, CONTENT_COLUMN, RADIUS, SETTINGS_BUTTON, SPACING } from '../theme';
import { useTraceScreen } from '../hooks/useTrace';

/** Done's "Save kept songs as a playlist", from press to result. */
type KeptSave =
  | { status: 'idle' }
  | { status: 'saving' }
  /** `kept`: this sift's keeps when it was pressed, to tell when they change. */
  | { status: 'saved'; message: string; kept: Track[] }
  | { status: 'failed'; message: string };

export default function DoneScreen() {
  useTraceScreen('done');
  const { state, dispatch, resetToSetup } = useSift();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { restoreTrack, restoreUnderWay, keepTrack, saveKeptPlaylist } = useMusicProvider();
  // A decision still held back (a session resumed straight to Done, #152)
  // has nothing left to undo it here: send it.
  const sendPending = useSendPending();
  useRemovalRetry();
  // Every decision of the sift, changeable here too.
  const revise = useReviseDecision(sendPending);
  const [showDecisions, setShowDecisions] = useState(false);
  const decisionOf = useCallback(
    (trackId: string) => decisionFor(trackId, { kept: state.kept, removed: state.removed, skipped: state.skipped }),
    [state.kept, state.removed, state.skipped],
  );
  useEffect(() => {
    sendPending(state.pending);
  }, [state.pending, sendPending]);
  const [copied, setCopied] = useState(false);
  const [restoringIds, setRestoringIds] = useState<Set<string>>(new Set());
  const [startOverError, setStartOverError] = useState<string | null>(null);
  // True while a confirmed Start Over clears the playlist's removal history.
  // In-flight restores block Start Over too: a restore's removeFromHistory
  // would otherwise race clearHistoryForSource on the same history file
  // (their writes are serialized in RemovalHistoryStore, but a restore
  // queued behind the clear would still re-add its record to the just-wiped
  // history and re-add the track remotely after the reset).
  const [isStartingOver, setIsStartingOver] = useState(false);
  const startOverBlocked = isStartingOver || restoringIds.size > 0;
  // The "Copied!" toast reset timer must not outlive the screen: an
  // uncleared timeout fires setState on an unmounted component and holds
  // the process open (surfaced as Jest's "did not exit" warning). Same
  // pattern as settleTimeoutRef in SiftScreen.
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
    };
  }, []);

  // "Save kept songs as a playlist" (playlist sifts): copies every song
  // remembered as kept from the playlist, in this sift or an earlier one,
  // into "<name> - Sifted". Shown once there is something to save: a keep
  // in this sift, or one the ledger remembers from before.
  const keptSource = state.activeSource ?? state.source;
  const keptLedgerKey = keptSource.type === 'playlist' ? ledgerKey(state.provider, keptSource) : null;
  const [rememberedKeeps, setRememberedKeeps] = useState(0);
  useEffect(() => {
    if (keptLedgerKey == null) return;
    let cancelled = false;
    loadReviewedIds(keptLedgerKey).then((ids) => {
      if (!cancelled) setRememberedKeeps(ids.size);
    });
    return () => {
      cancelled = true;
    };
    // Again when this sift's keeps change: a decision changed to or from Keep.
  }, [keptLedgerKey, state.kept]);
  const [keptSave, setKeptSave] = useState<KeptSave>({ status: 'idle' });
  const saving = keptSave.status === 'saving';
  // A second press while one save runs is ignored, even before the
  // disabled button has rendered.
  const savingRef = useRef(false);
  const saveKept = useCallback(async () => {
    if (savingRef.current || keptSource.type !== 'playlist') return;
    savingRef.current = true;
    const kept = state.kept;
    setKeptSave({ status: 'saving' });
    try {
      const result = await saveKeptPlaylist();
      setKeptSave({ status: 'saved', message: keptSaveMessage(result), kept });
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'Something went wrong.';
      setKeptSave({ status: 'failed', message: keptSaveFailure(siftedPlaylistName(keptSource.playlist.name), reason) });
    } finally {
      savingRef.current = false;
    }
  }, [keptSource, state.kept, saveKeptPlaylist]);
  const canSaveKept = keptSource.type === 'playlist'
    && (state.kept.length > 0 || rememberedKeeps > 0 || keptSave.status !== 'idle');
  // After a save, the button comes back once this sift's keeps change.
  const showSaveButton = keptSave.status !== 'saved' || keptSave.kept !== state.kept;
  // Changing a decision while the save reads the ledger could leave a song
  // saved that is no longer kept (or the reverse).
  const decisionsBlocked = startOverBlocked || saving;

  const copyRemovedList = useCallback(() => {
    const text = state.removed
      .map((t) => `${t.name} \u2014 ${t.artist}`)
      .join('\n');
    Clipboard.setString(text);
    setCopied(true);
    // Re-presses restart the 2s window instead of letting the first
    // press's timer hide the toast early.
    if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
    copiedTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
  }, [state.removed]);

  const handleRestore = useCallback(
    async (track: Track) => {
      // Already being restored from the decisions list, as part of a change
      // to another decision: recording it as kept here would undo that.
      if (restoreUnderWay(track.id)) return;
      setRestoringIds((prev) => new Set(prev).add(track.id));
      // A restored song counts as kept (RESTORE_TRACK), so it's remembered
      // as one too: later sifts leave it out, and a playlist's saved keeps
      // include it.
      if (await restoreTrack(track)) await keepTrack(track);
      setRestoringIds((prev) => {
        const next = new Set(prev);
        next.delete(track.id);
        return next;
      });
    },
    [restoreTrack, restoreUnderWay, keepTrack],
  );

  const renderTrackRow = useCallback(
    ({ item: track, index }: { item: Track; index: number }) => (
      <View
        style={[
          styles.trackRow,
          index % 2 !== 0 && { backgroundColor: colors.quaternary },
        ]}
      >
        <View style={{ flex: 1 }}>
          <Text
            style={[styles.trackName, { color: colors.text }]}
            numberOfLines={1}
          >
            {track.name}
          </Text>
          <Text
            style={[styles.trackArtist, { color: colors.textSecondary }]}
            numberOfLines={1}
          >
            {track.artist}
          </Text>
        </View>
        {/* A labeled button: the bare "+" it replaces read as "add" (#142). */}
        <TouchableOpacity
          testID={`restore-track-${track.id}`}
          onPress={() => handleRestore(track)}
          disabled={restoringIds.has(track.id)}
          style={[styles.restoreButton, restoringIds.has(track.id) && { opacity: 0.4 }]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={`Restore ${track.name}`}
        >
          <Text style={[styles.restoreButtonText, { color: colors.accent }]}>Restore</Text>
        </TouchableOpacity>
      </View>
    ),
    [colors.quaternary, colors.text, colors.textSecondary, colors.accent, handleRestore, restoringIds],
  );

  const keyExtractor = useCallback((track: Track) => track.id, []);

  const failedRemovals = failedRemovalCount(state.removed, state.failedRemovalIds);
  // Cards not yet decided: a sift ended early with Finish (#142).
  const remaining = Math.max(0, state.tracks.length - state.cursor);
  const headline = doneHeadline(state.source, state.cursor, state.tracks.length);
  // Review N skipped replaces this session (LOAD_TRACKS), so it is offered
  // only once no cards remain: with cards left, Continue sifting comes
  // first and nothing is dropped.
  const canReviewSkipped = remaining === 0 && state.skipped.length > 0;

  // Start Over, once confirmed (or with no decisions to lose). A playlist's
  // removal history is cleared first, and the reset happens only once that
  // landed: wiping the session after a failed clear would lose the sift
  // while the history it was meant to clear stays.
  const startOver = async () => {
    const source = state.source;
    if (source.type === 'playlist') {
      setStartOverError(null);
      setIsStartingOver(true);
      if (!(await clearHistoryForSource(source.playlist.id))) {
        setStartOverError('Could not clear the removal history. Try again.');
        setIsStartingOver(false);
        return;
      }
      // Success: the gate stays up. resetToSetup's RESET_TO_SETUP lands
      // after clearSession settles and retires this screen with it.
    }
    resetToSetup();
  };

  const reviewSkipped = () => {
    const start = () => dispatch({ type: 'LOAD_TRACKS', tracks: state.skipped });
    if (state.removed.length === 0) {
      start();
      return;
    }
    Alert.alert(
      'Review skipped songs?',
      'This starts a sift of the songs you skipped, and clears this summary and its Restore buttons.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Review Skipped', onPress: start },
      ],
    );
  };

  const listHeader = (
    <>
      {/* Title section */}
      <View style={styles.titleSection}>
        <Text
          testID="done-title"
          style={[styles.titleText, { color: colors.text }]}
        >
          {headline.title}
        </Text>
        <Text testID="done-subtitle" style={[styles.subtitleText, { color: colors.textSecondary }]}>
          {headline.subtitle}
        </Text>
      </View>

      {/* Summary stats in glass card */}
      <View style={styles.summaryWrapper}>
        <GlassCard intensity="regular" radius={RADIUS.lg}>
          <View style={styles.summaryContainer}>
            <SummaryItem
              count={state.kept.length}
              label="kept"
              symbolName="checkmark.circle.fill"
              color={COLORS.keep}
              textColor={colors.text}
              secondaryText={colors.textSecondary}
            />
            <SummaryItem
              count={state.removed.length}
              label="removed"
              symbolName="xmark.circle.fill"
              color={COLORS.remove}
              textColor={colors.text}
              secondaryText={colors.textSecondary}
            />
            <SummaryItem
              count={state.skipped.length}
              label="skipped"
              symbolName="arrow.right.circle"
              color={COLORS.skip}
              textColor={colors.text}
              secondaryText={colors.textSecondary}
            />
          </View>
        </GlassCard>
      </View>

      {state.removed.length === 0 && (
        <Text testID="nothing-removed" style={[styles.nothingRemoved, { color: colors.textSecondary }]}>
          {nothingRemovedNote(remaining, state.skipped.length)}
        </Text>
      )}

      {/* Removed tracks header */}
      {state.removed.length > 0 && (
        <View style={styles.removedSection}>
          <View style={styles.removedHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.removedTitle, { color: colors.text }]}>
                Tracks Removed
              </Text>
              <Text style={[styles.removedSubtitle, { color: colors.textSecondary }]}>
                {/* Real counts when some failed: "Most of these" was shown
                    even when every removal failed (#141). The warning block
                    below names the tracks that are still in place. */}
                {removedListSubtitle(state.provider, state.source, state.removed.length, failedRemovals)}
              </Text>
              {/* Sift can only collect them: the deleting happens in Music. */}
              {collectsRemovals(state.provider) && failedRemovals < state.removed.length && (
                <Text testID="delete-in-music-hint" style={[styles.removedSubtitle, { color: colors.textSecondary }]}>
                  {DELETE_IN_MUSIC_HINT}
                </Text>
              )}
            </View>
            <View style={styles.removedActions}>
              <TouchableOpacity
                style={[styles.smallSecondaryButton, { borderColor: colors.accent }]}
                onPress={copyRemovedList}
                accessibilityRole="button"
                activeOpacity={0.8}
              >
                <Text style={[styles.smallSecondaryButtonText, { color: colors.accent }]}>
                  {copied ? 'Copied!' : 'Copy List'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {state.removalErrors.length > 0 && (
            <View testID="removal-errors" style={styles.removalErrorsBlock}>
              <Text style={[styles.removalErrorsTitle, { color: colors.skipText }]}>
                {state.removalErrors.length === 1
                  ? 'This track could not be removed and is still in place:'
                  : `These ${state.removalErrors.length} tracks could not be removed and are still in place:`}
              </Text>
              {state.removalErrors.map((error, index) => (
                <Text
                  key={`${error}-${index}`}
                  testID={`removal-error-${index}`}
                  style={[styles.removalErrorItem, { color: colors.text }]}
                >
                  {error}
                </Text>
              ))}
            </View>
          )}
        </View>
      )}
    </>
  );

  const listFooter = (
    <View style={styles.buttonSection}>
      {canSaveKept && (
        <View style={styles.saveKept}>
          {(keptSave.status === 'saved' || keptSave.status === 'failed') && (
            <View style={styles.saveKeptStatus}>
              <SymbolView
                name={keptSave.status === 'saved' ? 'checkmark.circle.fill' : 'exclamationmark.triangle.fill'}
                size={18}
                tintColor={keptSave.status === 'saved' ? COLORS.keep : COLORS.skip}
                accessibilityElementsHidden
              />
              <Text
                testID="save-kept-status"
                style={[
                  styles.saveKeptStatusText,
                  { color: keptSave.status === 'saved' ? colors.text : colors.removeText },
                ]}
              >
                {keptSave.message}
              </Text>
            </View>
          )}
          {showSaveButton && (
            <Button
              title={saving ? 'Saving\u2026' : keptSave.status === 'failed' ? 'Retry' : SAVE_KEPT_TITLE}
              testID="save-kept-playlist"
              size="large"
              variant="secondary"
              disabled={saving || isStartingOver}
              onPress={() => { void saveKept(); }}
            />
          )}
        </View>
      )}

      {startOverError && (
        <Text testID="start-over-error" style={[styles.playlistError, { color: colors.removeText }]}>
          {startOverError}
        </Text>
      )}

      {state.cursor > 0 && (
        <TouchableOpacity
          testID="done-change-decisions"
          style={[styles.changeDecisions, decisionsBlocked && { opacity: 0.4 }]}
          disabled={decisionsBlocked}
          onPress={() => setShowDecisions(true)}
          accessibilityRole="button"
          accessibilityHint="Lists this sift's decisions, to change any of them"
        >
          <Text style={[styles.changeDecisionsText, { color: colors.accent }]}>Change a decision</Text>
        </TouchableOpacity>
      )}

      {remaining > 0 && (
        <Button
          title="Continue sifting"
          testID="done-continue"
          size="large"
          // Not while a save runs: the sift would go on without its result.
          disabled={startOverBlocked || saving}
          onPress={() => dispatch({ type: 'CONTINUE_SIFTING' })}
        />
      )}

      {canReviewSkipped && (
        <Button
          title={`Review ${state.skipped.length.toLocaleString('en-US')} skipped`}
          testID="done-review-skipped"
          size="large"
          disabled={startOverBlocked}
          onPress={reviewSkipped}
        />
      )}

      {/* Disabled while a Start Over is clearing the removal history, or a
          restore is running (see startOverBlocked). */}
      <Button
        title="Start Over"
        testID="done-start-over"
        size="large"
        variant="secondary"
        color={colors.removeText}
        disabled={startOverBlocked}
        onPress={() => {
          // The session and its decisions are cleared, so ask first (#137).
          // A playlist's Start Over asks even with none to lose, saying what
          // it does and doesn't undo.
          const counts = decisionCounts(state);
          if (counts.total === 0) {
            if (state.source.type !== 'playlist') {
              void startOver();
              return;
            }
            Alert.alert('Start Over?', playlistStartOverMessage(state.provider, state.source.playlist.name), [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Start Over', style: 'destructive', onPress: () => { void startOver(); } },
            ]);
            return;
          }
          const copy = discardConfirmation(state.provider, state.source, counts, 'done', { unfinished: remaining > 0 });
          Alert.alert(copy.title, copy.message, [
            { text: 'Cancel', style: 'cancel' },
            { text: copy.confirm, style: 'destructive', onPress: () => { void startOver(); } },
          ]);
        }}
      />
    </View>
  );

  return (
    <View style={styles.root}>
      <GlassBackground phase="done" />
      <FlatList
        data={state.removed}
        renderItem={renderTrackRow}
        keyExtractor={keyExtractor}
        style={styles.container}
        // Clear the floating settings gear (App.tsx), which sits in the same
        // column as the rows' restore buttons.
        contentContainerStyle={[styles.contentContainer, { paddingTop: insets.top + SETTINGS_BUTTON.top + SETTINGS_BUTTON.size }]}
        ListHeaderComponent={listHeader}
        ListFooterComponent={listFooter}
      />
      {showDecisions && (
        <DecisionsSheet
          tracks={decidedLatestFirst(state.tracks, state.cursor)}
          decisionFor={decisionOf}
          onRevise={revise}
          onClose={() => setShowDecisions(false)}
          disabled={decisionsBlocked}
        />
      )}
    </View>
  );
}

function SummaryItem({
  count,
  label,
  symbolName,
  color,
  textColor,
  secondaryText,
}: {
  count: number;
  label: string;
  symbolName: string;
  color: string;
  textColor: string;
  secondaryText: string;
}) {
  return (
    <View style={summaryStyles.item}>
      <SymbolView name={symbolName as SFSymbol} size={32} tintColor={color} accessibilityElementsHidden />
      <Text
        testID={`summary-count-${label}`}
        style={[summaryStyles.count, { color: textColor }]}
      >
        {count}
      </Text>
      <Text
        testID={`summary-label-${label}`}
        style={[summaryStyles.label, { color: secondaryText }]}
      >
        {label}
      </Text>
    </View>
  );
}

const summaryStyles = StyleSheet.create({
  item: {
    alignItems: 'center',
    gap: 8,
  },
  count: {
    fontSize: 28,
    fontWeight: '700',
  },
  label: {
    fontSize: 16,
  },
});

const styles = StyleSheet.create({
  changeDecisions: {
    minHeight: 44,
    justifyContent: 'center',
    alignSelf: 'center',
    paddingHorizontal: SPACING.lg,
  },
  changeDecisionsText: {
    fontSize: 17,
  },
  root: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  contentContainer: {
    ...CONTENT_COLUMN,
    paddingBottom: 40,
  },
  titleSection: {
    alignItems: 'center',
    gap: 8,
    paddingTop: 40,
    marginBottom: 32,
  },
  titleText: {
    fontSize: 40,
    fontWeight: '700',
    ...Platform.select({
      ios: { fontFamily: '.AppleSystemUIFontRounded-Bold' },
      default: {},
    }),
  },
  subtitleText: {
    fontSize: 20,
    textAlign: 'center',
    paddingHorizontal: SPACING['2xl'],
  },
  summaryWrapper: {
    alignSelf: 'center',
    marginHorizontal: SPACING['2xl'],
    width: '100%',
    maxWidth: 400,
    paddingHorizontal: SPACING['2xl'],
    marginBottom: 32,
  },
  summaryContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 16,
    gap: 40,
  },
  removedSection: {
    width: '100%',
    paddingHorizontal: SPACING['2xl'],
    marginBottom: 12,
  },
  removedHeader: {
    marginBottom: 12,
  },
  removedTitle: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 2,
  },
  removedSubtitle: {
    fontSize: 12,
    marginBottom: 8,
  },
  removedActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  removalErrorsBlock: {
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.skip,
    // The skip token at 10% alpha (#RRGGBBAA) — derived from the token so a
    // future token change carries through instead of drifting.
    backgroundColor: `${COLORS.skip}1A`,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    gap: SPACING.sm,
  },
  removalErrorsTitle: {
    fontSize: 12,
    fontWeight: '600',
  },
  removalErrorItem: {
    fontSize: 12,
  },
  smallSecondaryButton: {
    borderRadius: RADIUS.sm,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
  },
  smallSecondaryButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  playlistError: {
    fontSize: 12,
    marginBottom: 8,
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING['2xl'],
    paddingVertical: 8,
  },
  restoreButton: {
    paddingLeft: 12,
  },
  restoreButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  nothingRemoved: {
    fontSize: 15,
    textAlign: 'center',
    marginHorizontal: SPACING['2xl'],
    marginTop: SPACING.xl,
  },
  trackName: {
    fontSize: 16,
  },
  trackArtist: {
    fontSize: 12,
    marginTop: 2,
  },
  buttonSection: {
    gap: 12,
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 40,
    marginTop: 20,
  },
  saveKept: {
    alignItems: 'center',
    alignSelf: 'stretch',
    gap: SPACING.lg,
  },
  saveKeptStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  saveKeptStatusText: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
});
