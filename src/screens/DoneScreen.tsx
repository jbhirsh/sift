import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Platform,
  Clipboard,
  ActivityIndicator,
  Alert,
} from 'react-native';
import type { Track } from '../types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import type { SFSymbol } from 'sf-symbols-typescript';
import { useSift } from '../context/SiftContext';
import { useTheme } from '../theme/ThemeContext';
import { useMusicProvider } from '../hooks/useMusicProvider';
import { clearHistoryForSource } from '../services/RemovalHistoryStore';
import GlassBackground from '../components/GlassBackground';
import GlassCard from '../components/GlassCard';
import { COLORS, RADIUS, SPACING } from '../theme';

export default function DoneScreen() {
  const { state, dispatch, resetToSetup } = useSift();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { restoreTrack, saveSiftedPlaylist, clearSiftedPlaylist } = useMusicProvider();
  const [copied, setCopied] = useState(false);
  const [restoringIds, setRestoringIds] = useState<Set<string>>(new Set());
  const [startOverError, setStartOverError] = useState<string | null>(null);
  // True while the confirmed Start Over's remote clears run. Combined with
  // state.isCreatingPlaylist it gates BOTH directions of the save/clear
  // exclusion: Start Over is blocked while a save is in flight, and the
  // fallback save effect + Retry below are blocked while the clear is in
  // flight — so clearSiftedPlaylist can never run concurrently with a
  // sifted-playlist save racing the same remote playlist. In-flight
  // restores block Start Over too: a restore's removeFromHistory would
  // otherwise race clearHistoryForSource on the same history file (their
  // writes are serialized in RemovalHistoryStore, but a restore queued
  // behind the clear would still re-add its record to the just-wiped
  // history and re-add the track remotely after the reset).
  const [isStartingOver, setIsStartingOver] = useState(false);
  const startOverBlocked =
    state.isCreatingPlaylist || isStartingOver || restoringIds.size > 0;
  // Stale-closure-safe mirror of "a save is in flight". The Start Over
  // confirmation can sit open while the fallback effect (or Retry) starts a
  // save — e.g. a parked keep fails and dispatches ADD_PENDING_KEEP — and
  // the confirm callback's captured state predates that save. It re-checks
  // through this ref instead.
  const isCreatingPlaylistRef = useRef(state.isCreatingPlaylist);
  useEffect(() => {
    isCreatingPlaylistRef.current = state.isCreatingPlaylist;
  }, [state.isCreatingPlaylist]);
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

  const isAppleMusicLibrary = state.source.type === 'library' && state.provider === 'apple-music';
  const sourceLabel = state.source.type === 'playlist'
    ? `"${state.source.playlist.name}"`
    : 'your library';

  // Fallback: persist the full kept list when anything went wrong during
  // incremental sifting — keeps that were buffered because their playlist add
  // could not land (see pendingKeeps in SiftContext). Save ONLY the buffered
  // keeps: replaying the full kept list double-adds tracks whose Apple Music
  // identity changed between keep-time (catalog id) and playlist readback
  // (library-instance id), which the id-based diff cannot recognize. The
  // removalPlaylistError guard stops retry loops after a failed save (the
  // error stays visible in the footer). The isStartingOver guard is the
  // reverse half of the save/clear exclusion: a pending keep can land while
  // Start Over's clear is mid-flight (a parked keep failing dispatches
  // ADD_PENDING_KEEP exactly when the clear's `await keepQueue` settles),
  // and starting a save then would race the clear on the same playlist.
  useEffect(() => {
    if (
      state.source.type === 'playlist' &&
      state.pendingKeeps.length > 0 &&
      !state.isCreatingPlaylist &&
      !isStartingOver &&
      state.removalPlaylistError == null
    ) {
      saveSiftedPlaylist(state.source.playlist.name, state.pendingKeeps);
    }
  }, [state.source, state.pendingKeeps, state.isCreatingPlaylist, isStartingOver, state.removalPlaylistError, saveSiftedPlaylist]);

  // Manual retry for a failed sifted-playlist save. Without this, a single
  // transient failure would leave removalPlaylistError set forever (the
  // fallback effect above is guarded on it), stranding any buffered
  // pendingKeeps with no non-destructive way to try again. Gated on
  // isCreatingPlaylist so a retry can't start while a save is in flight,
  // and on isStartingOver so it can't race Start Over's in-flight clear.
  const handleRetrySave = useCallback(() => {
    if (state.source.type !== 'playlist') return;
    if (state.isCreatingPlaylist || isStartingOver) return;
    dispatch({ type: 'SET_PLAYLIST_ERROR', error: null });
    saveSiftedPlaylist(state.source.playlist.name, state.pendingKeeps);
  }, [dispatch, state.source, state.isCreatingPlaylist, isStartingOver, state.pendingKeeps, saveSiftedPlaylist]);

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
      setRestoringIds((prev) => new Set(prev).add(track.id));
      await restoreTrack(track);
      setRestoringIds((prev) => {
        const next = new Set(prev);
        next.delete(track.id);
        return next;
      });
    },
    [restoreTrack],
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
        <TouchableOpacity
          testID={`restore-track-${track.id}`}
          onPress={() => handleRestore(track)}
          disabled={restoringIds.has(track.id)}
          style={[styles.restoreButton, restoringIds.has(track.id) && { opacity: 0.4 }]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <SymbolView name="plus.circle.fill" size={22} tintColor={colors.accent} />
        </TouchableOpacity>
      </View>
    ),
    [colors.quaternary, colors.text, colors.textSecondary, colors.accent, handleRestore, restoringIds],
  );

  const keyExtractor = useCallback((track: Track) => track.id, []);

  const listHeader = (
    <>
      {/* Title section */}
      <View style={styles.titleSection}>
        <Text
          testID="done-title"
          style={[styles.titleText, { color: colors.text }]}
        >
          All done.
        </Text>
        <Text style={[styles.subtitleText, { color: colors.textSecondary }]}>
          Your library has been sifted.
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

      {/* Removed tracks header */}
      {state.removed.length > 0 && (
        <View style={styles.removedSection}>
          <View style={styles.removedHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.removedTitle, { color: colors.text }]}>
                Tracks Removed
              </Text>
              <Text style={[styles.removedSubtitle, { color: colors.textSecondary }]}>
                {state.removalErrors.length > 0
                  // Some removals failed — a blanket "have been removed"
                  // claim would be false. The warning block below names the
                  // tracks that are actually still in place.
                  ? (isAppleMusicLibrary
                      ? 'Most of these tracks have been moved to "Sift — Removed" in Music, but some could not be.'
                      : `Most of these tracks have been removed from ${sourceLabel}, but some could not be.`)
                  : (isAppleMusicLibrary
                      ? 'These tracks have been moved to "Sift — Removed" in Music.'
                      : `These tracks have been removed from ${sourceLabel}.`)}
              </Text>
            </View>
            <View style={styles.removedActions}>
              <TouchableOpacity
                style={[styles.smallSecondaryButton, { borderColor: colors.accent }]}
                onPress={copyRemovedList}
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
              <Text style={styles.removalErrorsTitle}>
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
      {state.isCreatingPlaylist && state.source.type === 'playlist' && (
        <View style={styles.siftedConfirmation}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={[styles.siftedConfirmationText, { color: colors.textSecondary }]}>
            Creating sifted playlist…
          </Text>
        </View>
      )}

      {state.removalPlaylistCreated && state.source.type === 'playlist' && (
        <View style={styles.siftedConfirmation}>
          <SymbolView name="checkmark.circle.fill" size={18} tintColor={COLORS.keep} />
          <Text style={[styles.siftedConfirmationText, { color: colors.text }]}>
            Sifted playlist created!
          </Text>
        </View>
      )}

      {state.removalPlaylistError && (
        <View style={styles.errorSection}>
          <Text style={styles.playlistError}>{state.removalPlaylistError}</Text>
          {state.source.type === 'playlist' && state.kept.length > 0 && (
            <TouchableOpacity
              testID="retry-save-button"
              // Disabled while a save is in flight OR while Start Over's
              // clear runs — a retry mid-clear would interleave adds with
              // the clear's readback/remove on the same remote playlist.
              style={[styles.smallSecondaryButton, { borderColor: colors.accent }, startOverBlocked && { opacity: 0.4 }]}
              onPress={handleRetrySave}
              disabled={startOverBlocked}
              activeOpacity={0.8}
            >
              <Text style={[styles.smallSecondaryButtonText, { color: colors.accent }]}>
                Retry
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {startOverError && (
        <Text testID="start-over-error" style={styles.playlistError}>
          {startOverError}
        </Text>
      )}

      <TouchableOpacity
        testID="done-start-over"
        style={[styles.primaryButton, startOverBlocked && { opacity: 0.4 }]}
        // Disabled while a sifted-playlist save is in flight (the fallback
        // effect above or a manual Retry) or while a previous Start Over's
        // clears are still running: a concurrent clearSiftedPlaylist would
        // race the save on the same remote playlist, and the interleaving
        // can leave it neither fully cleared nor fully saved.
        disabled={startOverBlocked}
        onPress={() => {
          if (state.source.type === 'playlist') {
            const playlist = state.source.playlist;
            // Destructive: this empties the just-built sifted playlist and
            // wipes the removal history for this source. Confirm first.
            Alert.alert(
              'Start Over?',
              `This will empty "${playlist.name} - Sifted" and clear the removal history for this playlist. This cannot be undone.`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Start Over',
                  style: 'destructive',
                  onPress: async () => {
                    // Re-check through the ref: the fallback effect (or a
                    // Retry) can start a save while this confirmation sits
                    // open, and this closure's captured state predates it.
                    // Bailing out keeps the clear from racing that save —
                    // the user can press Start Over again once it settles.
                    if (isCreatingPlaylistRef.current) return;
                    // Only reset once both clears actually landed. Wiping the
                    // local removal history (or the session) after a failed
                    // remote clear would silently lose the state needed to
                    // reconcile the still-populated sifted playlist.
                    // Neither clear throws (both catch internally and report
                    // via their boolean), so releasing the gate explicitly on
                    // the failure paths is exhaustive.
                    setStartOverError(null);
                    setIsStartingOver(true);
                    const playlistCleared = await clearSiftedPlaylist(playlist.name);
                    if (!playlistCleared) {
                      setStartOverError('Could not empty the sifted playlist. Check your connection and try again.');
                      setIsStartingOver(false);
                      return;
                    }
                    const historyCleared = await clearHistoryForSource(playlist.id);
                    if (!historyCleared) {
                      setStartOverError('Could not clear the removal history. Try again.');
                      setIsStartingOver(false);
                      return;
                    }
                    // Success: deliberately KEEP the gate up. resetToSetup's
                    // RESET_TO_SETUP lands asynchronously (after clearSession
                    // settles), and dropping the gate first would reopen the
                    // fallback-save window for a keep that buffered during
                    // the clear — the save would repopulate the playlist
                    // that was just emptied. The reset wipes pendingKeeps and
                    // retires this screen (phase leaves 'done'), taking the
                    // gate with it.
                    resetToSetup();
                  },
                },
              ],
            );
          } else {
            resetToSetup();
          }
        }}
        activeOpacity={0.8}
      >
        <Text style={styles.primaryButtonText}>Start Over</Text>
      </TouchableOpacity>
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
        contentContainerStyle={[styles.contentContainer, { paddingTop: insets.top }]}
        ListHeaderComponent={listHeader}
        ListFooterComponent={listFooter}
      />
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
      <SymbolView name={symbolName as SFSymbol} size={32} tintColor={color} />
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
  root: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  contentContainer: {
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
    color: COLORS.skip,
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
  errorSection: {
    alignItems: 'center',
    gap: 8,
  },
  playlistError: {
    fontSize: 12,
    color: COLORS.remove,
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
  primaryButton: {
    backgroundColor: '#007AFF',
    borderRadius: RADIUS.md,
    paddingVertical: 16,
    paddingHorizontal: 24,
    width: '100%',
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  siftedConfirmation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  siftedConfirmationText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
