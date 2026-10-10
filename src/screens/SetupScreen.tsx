import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ActionSheetIOS,
  Alert,
  InteractionManager,
  ScrollView,
} from 'react-native';
import { SymbolView } from 'expo-symbols';
import { useSift } from '../context/SiftContext';
import { useTheme } from '../theme/ThemeContext';
import { useMusicProvider } from '../hooks/useMusicProvider';
import GlassBackground from '../components/GlassBackground';
import GlassCard from '../components/GlassCard';
import PlaylistPicker from '../components/PlaylistPicker';
import ResumeSessionModal from '../components/ResumeSessionModal';
import { Button } from '../components/Button';
import { decisionCounts, discardConfirmation, legacyFailedRemovalIds, removeExplanation } from '../utils/sessionCopy';
import { loadSession } from '../services/SessionStore';
import { clearArtworkCache } from '../hooks/useResolvedArtwork';
import { clearHistoryForSource } from '../services/RemovalHistoryStore';
import { RADIUS, SPACING } from '../theme';
import {
  Playlist,
  SiftSession,
  SiftSource,
  SortOrder,
  SORT_ORDER_DISPLAY,
} from '../types';

function sourceMatches(a: SiftSource, b: SiftSource): boolean {
  if (a.type !== b.type) return false;
  if (a.type === 'playlist' && b.type === 'playlist') return a.playlist.id === b.playlist.id;
  return true;
}

const SORT_ORDERS: SortOrder[] = [
  'least-played',
  'most-played',
  'oldest',
  'newest',
  'random',
];

const SOURCE_TYPES = ['library', 'playlist'] as const;
const SOURCE_DISPLAY: Record<typeof SOURCE_TYPES[number], string> = {
  library: 'Library',
  playlist: 'Playlist',
};

export default function SetupScreen() {
  const { state, dispatch, startFresh, flushPendingSave } = useSift();
  const { colors, glass } = useTheme();
  const { loadPlaylists, clearSiftedPlaylist, warmCache } = useMusicProvider();
  const openSortPicker = () => {
    if (Platform.OS !== 'ios') return;
    const options = [...SORT_ORDERS.map((o) => SORT_ORDER_DISPLAY[o]), 'Cancel'];
    ActionSheetIOS.showActionSheetWithOptions(
      { options, cancelButtonIndex: options.length - 1 },
      (index) => {
        if (index < SORT_ORDERS.length) {
          dispatch({ type: 'SET_SORT_ORDER', sortOrder: SORT_ORDERS[index] });
        }
      },
    );
  };
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loadingPlaylists, setLoadingPlaylists] = useState(false);
  const [showPlaylistPicker, setShowPlaylistPicker] = useState(false);
  const [savedSession, setSavedSession] = useState<SiftSession | null>(null);
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [alreadySifted, setAlreadySifted] = useState(false);
  // True while performStartOver's remote clears are running. Together with
  // state.isCreatingPlaylist this gates every start-over path, so a clear
  // can never run concurrently with an in-flight sifted-playlist save (or
  // with itself).
  const [isStartingOver, setIsStartingOver] = useState(false);
  const startOverBlocked = state.isCreatingPlaylist || isStartingOver;

  // Latest state for the async session-load callback below. loadSession
  // resolves after an arbitrary delay, and the callback must judge the
  // world as it is THEN (in-memory sift? user already picked a source?),
  // not as it was at mount.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });
  // True once the user has touched the provider/source pickers — the async
  // session pre-population below must never overwrite an explicit choice.
  const setupTouchedRef = useRef(false);

  // Check for existing session on mount. The one-shot ref keeps this from
  // re-running even if the dispatch identity were ever to change.
  const sessionCheckedRef = useRef(false);
  useEffect(() => {
    if (sessionCheckedRef.current) return;
    sessionCheckedRef.current = true;
    loadSession().then((session) => {
      if (!session) return;
      const unfinished = session.cursor < session.tracks.length;
      // A finished session whose buffered keeps never flushed still needs
      // the resume path: resuming lands on Done, where the fallback save
      // runs for them. Dropping it here would silently lose those keeps —
      // the one thing pendingKeeps exists to prevent.
      if (!unfinished && (session.pendingKeeps?.length ?? 0) === 0) return;
      setSavedSession(session);
      const current = stateRef.current;
      const inMemoryResumable =
        current.tracks.length > 0 &&
        current.cursor < current.tracks.length &&
        current.activeSource != null &&
        sourceMatches(current.source, current.activeSource);
      if (inMemoryResumable) {
        // Backing out of an active sift leaves the same session both in
        // memory and on disk (the back button flushes the autosave without
        // clearing in-memory state, and this screen remounts on every phase
        // change). The inline Resume Sifting button already offers exactly
        // this choice — popping the modal on top of it would double-prompt
        // on every back-out.
        return;
      }
      if (setupTouchedRef.current) {
        // The user picked a provider/source while the session was still
        // loading from disk — never overwrite that explicit choice.
        // checkForMatchingSession still offers the modal if they later
        // select the session's own source.
        return;
      }
      // Pre-populate provider and source from saved session
      if (session.provider) {
        dispatch({ type: 'SET_PROVIDER', provider: session.provider });
      }
      if (session.source) {
        dispatch({ type: 'SET_SOURCE', source: session.source });
      }
      // Restore the persisted sifted-playlist id too, and AFTER SET_SOURCE —
      // SET_SOURCE nulls the id when the source changes. Without this, a
      // Start Over taken from here without resuming clears by name only and
      // a renamed "<name> - Sifted" companion silently survives while the
      // local history is wiped.
      dispatch({ type: 'SET_SIFTED_PLAYLIST_ID', id: session.siftedPlaylistId ?? null });
      setShowResumeModal(true);
    });
  }, [dispatch]);

  const checkForMatchingSession = (sourceType: string, playlistId?: string) => {
    if (!savedSession) return;
    const sessionSource = savedSession.source;
    if (!sessionSource) return;

    const matches =
      sourceType === 'library'
        ? sessionSource.type === 'library'
        : sessionSource.type === 'playlist' &&
          sessionSource.playlist.id === playlistId;

    if (matches) {
      setShowResumeModal(true);
    }
  };

  const handleResume = async () => {
    if (!savedSession) return;
    setShowResumeModal(false);

    // Clear stale artwork URLs from the previous session synchronously…
    clearArtworkCache();

    // …and resume FIRST. Warming the native song cache used to happen before
    // this dispatch, leaving an unguarded await window where the user was
    // stuck on Setup with the modal gone; play/artwork degrade gracefully
    // while the cache warms, so restoring the session must not wait for it.
    dispatch({
      type: 'RESUME_SESSION',
      session: {
        tracks: savedSession.tracks,
        cursor: savedSession.cursor,
        kept: savedSession.kept,
        removed: savedSession.removed,
        skipped: savedSession.skipped,
        sortOrder: savedSession.sortOrder,
        provider: savedSession.provider ?? state.provider,
        source: savedSession.source ?? { type: 'library' },
        activeSource: savedSession.source ?? { type: 'library' },
        // A FINISHED session is only offered here when it still has
        // unflushed pendingKeeps — resume it straight to Done so the
        // fallback save can repair them instead of replaying a sift with
        // nothing left to decide.
        phase: savedSession.cursor >= savedSession.tracks.length ? 'done' : 'sifting',
        loadProgress: 1,
        loadMessage: '',
        loadError: null,
        playbackPosition: 0,
        isPlaying: false,
        removalPlaylistCreated: false,
        removalPlaylistError: null,
        isCreatingPlaylist: false,
        // Legacy sessions predate these fields — default to empty rather
        // than dropping the persisted repair signal on the floor.
        removalErrors: savedSession.removalErrors ?? [],
        failedRemovalIds:
          savedSession.failedRemovalIds ??
          legacyFailedRemovalIds(savedSession.removed, savedSession.removalErrors ?? []),
        connectionStatus: state.connectionStatus,
        pendingKeeps: savedSession.pendingKeeps ?? [],
        skipFiltering: false,
        // Legacy sessions predate this field too — null falls back to the
        // name-based sifted-playlist lookup.
        siftedPlaylistId: savedSession.siftedPlaylistId ?? null,
      },
    });

    // Warm the native song cache in the background for playback/artwork.
    const trackIDs = savedSession.tracks.map((t) => t.id);
    await warmCache(trackIDs);
  };

  const performStartOver = async () => {
    setIsStartingOver(true);
    try {
      const source = state.source;
      if (source.type === 'playlist') {
        // Only proceed once each clear actually landed — wiping the local
        // removal history (or discarding the saved session) after a failed
        // remote clear would silently lose the state needed to reconcile.
        const playlistCleared = await clearSiftedPlaylist(source.playlist.name);
        if (!playlistCleared) {
          dispatch({
            type: 'SET_LOAD_ERROR',
            error: 'Could not empty the sifted playlist. Check your connection and try again.',
          });
          return;
        }
        const historyCleared = await clearHistoryForSource(source.playlist.id);
        if (!historyCleared) {
          dispatch({ type: 'SET_LOAD_ERROR', error: 'Could not clear the removal history. Try again.' });
          return;
        }
      }
      setSavedSession(null);
      setAlreadySifted(false);
      startFresh(true);
    } finally {
      setIsStartingOver(false);
    }
  };

  // The unfinished sift a discard here would throw away, read from disk after
  // flushing any debounced save, so its provider and source are its own, not
  // whatever the pickers show now. Sift keeps one saved session for all
  // sources, so starting anything new replaces it.
  const sessionAtRisk = async () => {
    flushPendingSave();
    const saved = await loadSession();
    if (!saved) return null;
    const counts = decisionCounts(saved);
    const unfinished = saved.cursor < saved.tracks.length || counts.pendingKeeps > 0;
    if (!unfinished || counts.total === 0) return null;
    return {
      provider: saved.provider ?? state.provider,
      source: saved.source ?? { type: 'library' as const },
      counts,
    };
  };

  // Guards the async look-up behind Start Sifting and Start Over, so a double
  // tap can't raise two prompts or start twice.
  const discardCheckRef = useRef(false);
  const withDiscardCheck = async (run: () => Promise<void>) => {
    if (discardCheckRef.current) return;
    discardCheckRef.current = true;
    try {
      await run();
    } finally {
      discardCheckRef.current = false;
    }
  };

  const confirmDiscard = (
    copy: { title: string; message: string; confirm: string },
    onConfirm: () => void,
  ) => {
    // Present it only after the resume modal's dismiss transition has
    // actually finished: setShowResumeModal(false) merely schedules the
    // dismissal, and presenting a UIAlertController while the sheet is still
    // animating out can land the alert behind it or drop it entirely.
    InteractionManager.runAfterInteractions(() => {
      Alert.alert(copy.title, copy.message, [
        { text: 'Cancel', style: 'cancel' },
        { text: copy.confirm, style: 'destructive', onPress: onConfirm },
      ]);
    });
  };

  const handleStartOver = () => withDiscardCheck(async () => {
    // Never start a clear while a sifted-playlist save is in flight (or a
    // previous clear is still running): the two would race each other on
    // the same remote playlist and could interleave adds after the clear.
    if (startOverBlocked) return;
    // The resume modal (when open) is the first affordance — dismiss it
    // before the confirmation so the two prompts never stack.
    setShowResumeModal(false);
    const source = state.source;
    const risk = await sessionAtRisk();
    const start = () => { performStartOver(); };
    // One tap must never silently erase decisions (#137), whichever source
    // they belong to: Re-sift of one playlist replaces a library sift too.
    if (risk && sourceMatches(source, risk.source)) {
      confirmDiscard(discardConfirmation(risk.provider, source, risk.counts, 'start-over'), start);
    } else if (risk) {
      confirmDiscard(discardConfirmation(risk.provider, risk.source, risk.counts, 'new-sift', {
        alsoEmpties: source.type === 'playlist' ? source.playlist.name : undefined,
      }), start);
    } else if (source.type === 'playlist') {
      // No decisions to lose, but this empties "<name> - Sifted" and wipes
      // the removal history, exactly like DoneScreen's Start Over.
      confirmDiscard({
        title: 'Start Over?',
        message: `This will empty "${source.playlist.name} - Sifted" and clear the removal history for this playlist. This cannot be undone.`,
        confirm: 'Start Over',
      }, start);
    } else {
      // Nothing to lose: no decisions, and a library start-over clears
      // nothing remote.
      start();
    }
  });

  // Starting a sift replaces the one saved session, whatever its source
  // (#137). If that would throw away an unfinished sift's decisions, ask.
  const handleStartSifting = () => withDiscardCheck(async () => {
    const risk = await sessionAtRisk();
    if (!risk) {
      startFresh();
      return;
    }
    confirmDiscard(discardConfirmation(risk.provider, risk.source, risk.counts, 'new-sift'), () => startFresh());
  });

  const openPlaylistPicker = () => {
    // Opening the picker is an explicit source interaction too (reachable
    // via the Change button without touching the segments).
    setupTouchedRef.current = true;
    setLoadingPlaylists(true);
    setShowPlaylistPicker(true);
    loadPlaylists().then((result) => {
      setPlaylists(result);
      setLoadingPlaylists(false);
    });
  };

  return (
    <View style={styles.container}>
      <GlassBackground phase="setup" />

      {/* Scrolls only when it must: on a small phone with an error, a
          playlist and the resume buttons showing, the content can outgrow
          the screen. flexGrow keeps it vertically centered otherwise. */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ flex: 1 }} />

        {/* Brand */}
        <View style={styles.brandSection}>
          <Text
            testID="setup-brand"
            style={[styles.brandText, { color: colors.text }]}
          >
            sift.
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Clean up your music library.
          </Text>
        </View>

        {/* Error display */}
        {state.loadError ? (
          <View style={styles.errorContainer}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <SymbolView name="exclamationmark.triangle.fill" size={16} tintColor="#FF9500" />
              <Text testID="setup-error" style={[styles.errorText, { color: colors.removeText }]}>
                {state.loadError}
              </Text>
            </View>
          </View>
        ) : null}

        {/* Sift source picker */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.text }]}>
            Sift source
          </Text>
          <GlassCard intensity="thin" radius={RADIUS.sm}>
            <View style={styles.segmentedControl}>
              {SOURCE_TYPES.map((sourceType) => {
                const isSelected = state.source.type === sourceType;
                return (
                  <TouchableOpacity
                    key={sourceType}
                    testID={`source-${sourceType}`}
                    style={[
                      styles.segment,
                      isSelected && [styles.segmentSelected, { borderColor: glass.borderColor }],
                    ]}
                    onPress={() => {
                      setupTouchedRef.current = true;
                      if (sourceType === 'library') {
                        dispatch({ type: 'SET_SOURCE', source: { type: 'library' } });
                        setAlreadySifted(false);
                        checkForMatchingSession('library');
                      } else {
                        openPlaylistPicker();
                      }
                    }}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        {
                          color: isSelected ? colors.text : colors.textSecondary,
                          fontWeight: isSelected ? '600' : '400',
                        },
                      ]}
                    >
                      {SOURCE_DISPLAY[sourceType]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </GlassCard>
          {state.source.type === 'playlist' && (
            <View style={styles.selectedPlaylist}>
              <Text style={[styles.selectedPlaylistName, { color: colors.text }]} numberOfLines={1}>
                {state.source.playlist.name}
              </Text>
              <TouchableOpacity
                onPress={openPlaylistPicker}
                activeOpacity={0.7}
              >
                <Text style={[styles.changeButton, { color: colors.accent }]}>
                  Change
                </Text>
              </TouchableOpacity>
            </View>
          )}
          {/* What Remove will do, before the first irreversible swipe (#141). */}
          <Text testID="remove-explanation" style={[styles.footnote, { color: colors.textSecondary }]}>
            {removeExplanation(state.provider, state.source)}
          </Text>
        </View>

        {showPlaylistPicker && (
          <PlaylistPicker
            // Companion "- Sifted" playlists are outputs of sifting, not
            // sources: offering them would let a sift target
            // "<x> - Sifted - Sifted". The unfiltered list is kept in state
            // because the already-sifted check below needs the companions.
            playlists={playlists.filter((p) => !p.name.endsWith(' - Sifted'))}
            loading={loadingPlaylists}
            onSelect={(playlist) => {
              dispatch({ type: 'SET_SOURCE', source: { type: 'playlist', playlist } });
              setShowPlaylistPicker(false);
              setAlreadySifted(playlists.some((p) => p.name === `${playlist.name} - Sifted`));
              checkForMatchingSession('playlist', playlist.id);
            }}
            onCancel={() => setShowPlaylistPicker(false)}
          />
        )}

        {/* Sort order picker */}
        <GlassCard intensity="thin" radius={RADIUS.md}>
          <View style={styles.sortContainer}>
            <Text style={[styles.sectionLabel, { color: colors.text }]}>
              Sort by
            </Text>
            <View style={{ flex: 1 }} />
            <TouchableOpacity
              onPress={openSortPicker}
              style={styles.sortButton}
              activeOpacity={0.7}
            >
              <Text style={[styles.sortButtonText, { color: colors.accent }]}>
                {SORT_ORDER_DISPLAY[state.sortOrder]}
              </Text>
            </TouchableOpacity>
          </View>
        </GlassCard>

        {showResumeModal && savedSession && (
          <ResumeSessionModal
            session={savedSession}
            onResume={handleResume}
            onStartOver={handleStartOver}
            onCancel={() => {
              setShowResumeModal(false);
              setSavedSession(null);
            }}
          />
        )}

        {/* Action buttons */}
        <View style={styles.buttonSection}>
          {(() => {
            const canResumeInMemory = state.tracks.length > 0
              && state.cursor < state.tracks.length
              && state.activeSource != null
              && sourceMatches(state.source, state.activeSource);
            const canResumeFromSaved = !canResumeInMemory
              && savedSession != null
              && savedSession.source != null
              && sourceMatches(state.source, savedSession.source)
              && savedSession.cursor < savedSession.tracks.length;

            if (canResumeInMemory || canResumeFromSaved) {
              return (
                <>
                  <Button
                    title="Resume Sifting"
                    size="large"
                    onPress={canResumeInMemory
                      ? () => dispatch({ type: 'SET_PHASE', phase: 'sifting' })
                      : handleResume}
                  />
                  {/* Destructive: kept clear of Resume Sifting (#137). */}
                  <View style={styles.startOverGap} />
                  <Button
                    title="Start Over"
                    testID="setup-start-over"
                    size="large"
                    variant="secondary"
                    color={colors.removeText}
                    onPress={handleStartOver}
                    disabled={startOverBlocked}
                  />
                </>
              );
            }
            if (alreadySifted && state.source.type === 'playlist') {
              return (
                <Button
                  title="Re-sift Playlist"
                  testID="setup-resift"
                  size="large"
                  onPress={handleStartOver}
                  disabled={startOverBlocked}
                />
              );
            }
            return (
              <Button
                title="Start Sifting"
                testID="setup-start-sifting"
                size="large"
                onPress={() => { handleStartSifting(); }}
              />
            );
          })()}
        </View>

        <View style={{ flex: 1 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 40,
  },
  brandSection: {
    alignItems: 'center',
    gap: 8,
    marginBottom: 32,
  },
  brandText: {
    fontSize: 48,
    fontWeight: '700',
    ...Platform.select({
      ios: { fontFamily: '.AppleSystemUIFontRounded-Bold' },
      default: {},
    }),
  },
  subtitle: {
    fontSize: 20,
  },
  errorContainer: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
  },
  section: {
    gap: 12,
    marginBottom: 32,
  },
  sectionLabel: {
    fontSize: 17,
    fontWeight: '600',
  },
  segmentedControl: {
    flexDirection: 'row',
    padding: SPACING.sm,
  },
  segment: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 7,
    borderWidth: 0.5,
    borderColor: 'transparent',
  },
  segmentSelected: {
    backgroundColor: 'rgba(120,120,128,0.2)',
  },
  segmentText: {
    fontSize: 15,
  },
  sortContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  sortButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  sortButtonText: {
    fontSize: 17,
  },
  buttonSection: {
    gap: 12,
    alignItems: 'center',
    marginTop: SPACING['2xl'],
  },
  startOverGap: {
    height: SPACING.base,
  },
  footnote: {
    fontSize: 13,
    marginTop: SPACING.sm,
    paddingHorizontal: SPACING.sm,
  },
  selectedPlaylist: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.sm,
  },
  selectedPlaylistName: {
    fontSize: 15,
    flex: 1,
    marginRight: SPACING.base,
  },
  changeButton: {
    fontSize: 15,
    fontWeight: '600',
  },
});
