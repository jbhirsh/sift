import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Switch,
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
import SessionStatRow from '../components/SessionStatRow';
import { Button } from '../components/Button';
import { APPLE_REMOVED_PLAYLIST, decisionCounts, discardConfirmation, playlistStartOverMessage, removeExplanation } from '../utils/sessionCopy';
import { resumeState } from '../context/resumeSession';
import { loadSession } from '../services/SessionStore';
import { useSendSavedPending } from '../hooks/usePendingDecision';
import { warmUpOrder } from '../utils/warmUpOrder';
import { ADDED_AGES, addedAgeLabel, PLAY_LIMITS, playLimitLabel } from '../utils/trackFilter';
import { clearArtworkCache } from '../hooks/useResolvedArtwork';
import { clearHistoryForSource } from '../services/RemovalHistoryStore';
import { loadReviewedIds } from '../services/ReviewedLedgerStore';
import { ledgerKey, reviewedNote } from '../utils/reviewedLedger';
import { COLORS, CONTENT_COLUMN, RADIUS, SPACING } from '../theme';
import {
  Playlist,
  SiftSession,
  SiftSource,
  SortOrder,
  SORT_ORDER_DISPLAY,
} from '../types';
import { useTraceScreen } from '../hooks/useTrace';

function sourceMatches(a: SiftSource, b: SiftSource): boolean {
  if (a.type !== b.type) return false;
  if (a.type === 'playlist' && b.type === 'playlist') return a.playlist.id === b.playlist.id;
  return true;
}

/** Whether the sift in memory, unfinished, is one of this source. */
function inMemoryResumableFor(
  state: { tracks: readonly unknown[]; cursor: number; activeSource: SiftSource | null },
  source: SiftSource,
): boolean {
  return state.tracks.length > 0
    && state.cursor < state.tracks.length
    && state.activeSource != null
    && sourceMatches(source, state.activeSource);
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
  useTraceScreen('setup');
  const { state, dispatch, startFresh, flushPendingSave } = useSift();
  const { colors, glass } = useTheme();
  const { loadPlaylists, warmCache, ensureAccess, rememberSiftedKeeps } = useMusicProvider();
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
  // Plays and Added: which songs the sift takes, picked like the sort.
  const pickFrom = <T,>(choices: readonly T[], label: (choice: T) => string, onPick: (choice: T) => void) => {
    if (Platform.OS !== 'ios') return;
    const options = [...choices.map(label), 'Cancel'];
    ActionSheetIOS.showActionSheetWithOptions(
      { options, cancelButtonIndex: options.length - 1 },
      (index) => {
        if (index < choices.length) onPick(choices[index]);
      },
    );
  };
  const openPlaysPicker = () => pickFrom(PLAY_LIMITS, playLimitLabel, (maxPlays) => {
    dispatch({ type: 'SET_FILTER', filter: { ...state.filter, maxPlays } });
  });
  const openAddedPicker = () => pickFrom(ADDED_AGES, addedAgeLabel, (addedYearsAgo) => {
    dispatch({ type: 'SET_FILTER', filter: { ...state.filter, addedYearsAgo } });
  });
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loadingPlaylists, setLoadingPlaylists] = useState(false);
  const [showPlaylistPicker, setShowPlaylistPicker] = useState(false);
  const [savedSession, setSavedSession] = useState<SiftSession | null>(null);
  const [showResumeModal, setShowResumeModal] = useState(false);
  // Songs kept in earlier sifts of the selected library or playlist, which
  // a new sift leaves out unless the switch says otherwise (#143).
  const [includeSifted, setIncludeSifted] = useState(false);
  const sourceLedgerKey = ledgerKey(state.provider, state.source);
  // With the source it was counted for: another source's count doesn't
  // show while this one's loads.
  const [reviewed, setReviewed] = useState({ key: '', count: 0 });
  const reviewedCount = reviewed.key === sourceLedgerKey ? reviewed.count : 0;
  const selectedSource = state.source;
  useEffect(() => {
    let cancelled = false;
    // A playlist's count includes keeps an older build saved to
    // "<name> - Sifted", remembered the first time it's picked.
    rememberSiftedKeeps(selectedSource)
      .then(() => loadReviewedIds(sourceLedgerKey))
      .then((ids) => {
        if (!cancelled) setReviewed({ key: sourceLedgerKey, count: ids.size });
      });
    return () => {
      cancelled = true;
    };
  }, [sourceLedgerKey, selectedSource, rememberSiftedKeeps]);
  // The switch shows once the selected source has songs kept in earlier
  // sifts. It decides what a new sift loads, from Start Sifting or Start Over.
  const showIncludeSifted = reviewedCount > 0;
  const includeReviewed = showIncludeSifted && includeSifted;
  // True while performStartOver runs (a playlist's removal history being
  // cleared), so a second Start Over can't start alongside it.
  const [isStartingOver, setIsStartingOver] = useState(false);
  const startOverBlocked = isStartingOver;

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
      if (session.cursor >= session.tracks.length) return;
      setSavedSession(session);
      const current = stateRef.current;
      if (inMemoryResumableFor(current, current.source)) {
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
      setShowResumeModal(true);
    });
  }, [dispatch]);

  const checkForMatchingSession = (chosen: SiftSource) => {
    if (!savedSession) return;
    const sessionSource = savedSession.source;
    if (!sessionSource) return;
    // The sift in memory for this source is the same session, and newer
    // than the copy loaded from disk when this screen mounted (a held
    // decision sent on the way out, a removal that failed since): the
    // inline Resume Sifting resumes it. Offering the disk copy here would
    // restore it over the newer one and lose those changes.
    if (inMemoryResumableFor(state, chosen)) return;
    if (sourceMatches(chosen, sessionSource)) {
      setShowResumeModal(true);
    }
  };

  // finish: resume straight to Done, ending the sift where it left off (#142).
  const handleResume = async ({ finish = false }: { finish?: boolean } = {}) => {
    if (!savedSession) return;
    setShowResumeModal(false);
    // Access can be revoked between launches (iOS ends the app when it is).
    // Sifting without it would play nothing and fail every Remove, quietly.
    if (!(await ensureAccess())) return;

    // Clear stale artwork URLs from the previous session synchronously…
    clearArtworkCache();

    // …and resume FIRST. Warming the native song cache used to happen before
    // this dispatch, leaving an unguarded await window where the user was
    // stuck on Setup with the modal gone; play/artwork degrade gracefully
    // while the cache warms, so restoring the session must not wait for it.
    // Marked warming first: a play that fails meanwhile isn't reported.
    dispatch({ type: 'SONG_CACHE_WARMING' });
    dispatch({
      type: 'RESUME_SESSION',
      session: resumeState(savedSession, {
        provider: state.provider,
        connectionStatus: state.connectionStatus,
        finish,
      }),
    });

    // Warm the native cache in the background for playback/artwork: the
    // cards up next first, which play, artwork and the chorus start then
    // retry (songCacheGeneration), then the rest. Only the first warm-up
    // holds back a failed play's message: the rest can take minutes on a
    // big library, and a song that really won't play must say so. A
    // playlist sift reloads its playlist too: its music videos come back no
    // other way (#54).
    const { upNext, rest } = warmUpOrder(savedSession.tracks.map((t) => t.id), savedSession.cursor);
    const source = savedSession.source;
    await warmCache(upNext, source?.type === 'playlist' ? source.playlist.id : undefined);
    dispatch({ type: 'SONG_CACHE_WARMED' });
    if (rest.length === 0) return;
    await warmCache(rest);
    dispatch({ type: 'SONG_CACHE_WARMED' });
  };

  // A decision the saved session held when the app was killed goes out
  // before the session is replaced (useSendSavedPending).
  const sendSavedPending = useSendSavedPending();
  const replaceSavedSession = async (skipFiltering: boolean) => {
    sendSavedPending(await loadSession());
    startFresh(skipFiltering);
  };

  const performStartOver = async () => {
    setIsStartingOver(true);
    try {
      const source = state.source;
      // First: the decision the saved session still holds goes out before
      // the session is discarded.
      sendSavedPending(await loadSession());
      if (source.type === 'playlist') {
        // Only go on once the clear landed: discarding the saved session
        // after a failed clear would lose the sift while the history stays.
        const historyCleared = await clearHistoryForSource(source.playlist.id);
        if (!historyCleared) {
          dispatch({ type: 'SET_LOAD_ERROR', error: 'Could not clear the removal history. Try again.' });
          return;
        }
      }
      setSavedSession(null);
      // Songs kept in earlier sifts stay left out unless the switch says
      // otherwise (#143): dropping an unfinished sift shouldn't bring back
      // every song already kept.
      startFresh(includeReviewed);
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
    const unfinished = saved.cursor < saved.tracks.length;
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
    // Not while a previous Start Over is still running.
    if (startOverBlocked) return;
    // The resume modal (when open) is the first affordance — dismiss it
    // before the confirmation so the two prompts never stack.
    setShowResumeModal(false);
    const source = state.source;
    const risk = await sessionAtRisk();
    const start = () => { performStartOver(); };
    // One tap must never silently erase decisions (#137), whichever source
    // they belong to: the saved sift may be another source's.
    if (risk && sourceMatches(source, risk.source)) {
      confirmDiscard(discardConfirmation(risk.provider, source, risk.counts, 'start-over'), start);
    } else if (risk) {
      confirmDiscard(discardConfirmation(risk.provider, risk.source, risk.counts, 'new-sift'), start);
    } else if (source.type === 'playlist') {
      // No decisions to lose, but a playlist's Start Over still says what
      // it does (and doesn't) undo, exactly like DoneScreen's.
      confirmDiscard({
        title: 'Start Over?',
        message: playlistStartOverMessage(state.provider, source.playlist.name),
        confirm: 'Start Over',
      }, start);
    } else {
      // No decisions to lose.
      start();
    }
  });

  // Starting a sift replaces the one saved session, whatever its source
  // (#137). If that would throw away an unfinished sift's decisions, ask.
  const handleStartSifting = () => withDiscardCheck(async () => {
    const risk = await sessionAtRisk();
    if (!risk) {
      await replaceSavedSession(includeReviewed);
      return;
    }
    confirmDiscard(discardConfirmation(risk.provider, risk.source, risk.counts, 'new-sift'), () => {
      void replaceSavedSession(includeReviewed);
    });
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

  const canResumeInMemory = inMemoryResumableFor(state, state.source);
  const canResumeFromSaved = !canResumeInMemory
    && savedSession != null
    && savedSession.source != null
    && sourceMatches(state.source, savedSession.source)
    && savedSession.cursor < savedSession.tracks.length;

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
            // The wordmark reads "sift." on screen; VoiceOver says the name.
            accessibilityLabel="Sift"
            accessibilityRole="header"
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
              <SymbolView name="exclamationmark.triangle.fill" size={16} tintColor={COLORS.skip} accessibilityElementsHidden />
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
            <View style={styles.segmentedControl} accessibilityRole="tabbar">
              {SOURCE_TYPES.map((sourceType) => {
                const isSelected = state.source.type === sourceType;
                return (
                  <TouchableOpacity
                    key={sourceType}
                    testID={`source-${sourceType}`}
                    // A button with its selected state: iOS has no tab trait
                    // for a segment, and the container is the tab bar.
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    style={[
                      styles.segment,
                      isSelected && [styles.segmentSelected, { borderColor: glass.borderColor }],
                    ]}
                    onPress={() => {
                      setupTouchedRef.current = true;
                      if (sourceType === 'library') {
                        dispatch({ type: 'SET_SOURCE', source: { type: 'library' } });
                        checkForMatchingSession({ type: 'library' });
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
              {/* A button VoiceOver names, with a full-size hit area (#174). */}
              <TouchableOpacity
                testID="setup-change-playlist"
                onPress={openPlaylistPicker}
                style={styles.changeButton}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityHint="Picks another playlist to sift"
              >
                <Text style={[styles.changeButtonText, { color: colors.accent }]}>
                  Change
                </Text>
              </TouchableOpacity>
            </View>
          )}
          {/* What Remove will do, before the first irreversible swipe (#141). */}
          <Text testID="remove-explanation" style={[styles.footnote, { color: colors.textSecondary }]}>
            {removeExplanation(state.provider, state.source)}
          </Text>
          {showIncludeSifted && (
            <>
              <GlassCard intensity="thin" radius={RADIUS.md}>
                <View style={styles.switchRow}>
                  <Text style={[styles.switchLabel, { color: colors.text }]}>
                    Include songs I{'\u2019'}ve already sifted
                  </Text>
                  <Switch
                    testID="include-sifted-switch"
                    accessibilityLabel="Include songs I've already sifted"
                    value={includeSifted}
                    onValueChange={setIncludeSifted}
                    trackColor={{ true: colors.accent, false: colors.quaternary }}
                  />
                </View>
              </GlassCard>
              <Text testID="reviewed-note" style={[styles.footnote, { color: colors.textSecondary }]}>
                {reviewedNote(reviewedCount, includeSifted)}
              </Text>
            </>
          )}
        </View>

        {showPlaylistPicker && (
          <PlaylistPicker
            // "<name> - Sifted" playlists (Done's "Save kept songs as a
            // playlist") and "Sift — Removed" are outputs of sifting, not
            // sources: offering them would let a sift save to
            // "<x> - Sifted - Sifted", or sift songs already removed.
            playlists={playlists.filter((p) => !p.name.endsWith(' - Sifted') && p.name !== APPLE_REMOVED_PLAYLIST)}
            loading={loadingPlaylists}
            onSelect={(playlist) => {
              const source: SiftSource = { type: 'playlist', playlist };
              dispatch({ type: 'SET_SOURCE', source });
              setShowPlaylistPicker(false);
              checkForMatchingSession(source);
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
              accessibilityRole="button"
              // The label stays the visible text (Maestro matches on it);
              // the hint says what it sets.
              accessibilityHint="Sort order. Changes the order songs come in"
            >
              <Text style={[styles.sortButtonText, { color: colors.accent }]}>
                {SORT_ORDER_DISPLAY[state.sortOrder]}
              </Text>
            </TouchableOpacity>
          </View>
        </GlassCard>

        {/* Which songs to go through: the least played, or the oldest. */}
        <GlassCard intensity="thin" radius={RADIUS.md}>
          <View style={styles.filterRow}>
            <Text style={[styles.sectionLabel, { color: colors.text }]}>Plays</Text>
            <View style={{ flex: 1 }} />
            <TouchableOpacity
              testID="filter-plays"
              onPress={openPlaysPicker}
              style={styles.sortButton}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityHint="Only songs played at most this often"
            >
              <Text style={[styles.sortButtonText, { color: colors.accent }]}>
                {playLimitLabel(state.filter.maxPlays)}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={[styles.filterDivider, { backgroundColor: colors.separator }]} />
          <View style={styles.filterRow}>
            <Text style={[styles.sectionLabel, { color: colors.text }]}>Added</Text>
            <View style={{ flex: 1 }} />
            <TouchableOpacity
              testID="filter-added"
              onPress={openAddedPicker}
              style={styles.sortButton}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityHint="Only songs added to your library at least this long ago"
            >
              <Text style={[styles.sortButtonText, { color: colors.accent }]}>
                {addedAgeLabel(state.filter.addedYearsAgo)}
              </Text>
            </TouchableOpacity>
          </View>
        </GlassCard>

        {showResumeModal && savedSession && (
          <ResumeSessionModal
            session={savedSession}
            onResume={() => { handleResume(); }}
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
            if (canResumeInMemory || canResumeFromSaved) {
              // Same counts as the resume sheet, so the session being
              // resumed (or finished) is visible here too (#142).
              const counts = canResumeInMemory || savedSession == null ? state : savedSession;
              return (
                <>
                  <SessionStatRow
                    kept={counts.kept.length}
                    removed={counts.removed.length}
                    skipped={counts.skipped.length}
                    remaining={Math.max(0, counts.tracks.length - counts.cursor)}
                    testIDPrefix="setup-stat"
                  />
                  <Button
                    title="Resume Sifting"
                    size="large"
                    onPress={canResumeInMemory
                      ? () => dispatch({ type: 'SET_PHASE', phase: 'sifting' })
                      : () => { handleResume(); }}
                  />
                  {/* End the sift where it is and see its summary (#142). */}
                  <TouchableOpacity
                    testID="setup-finish"
                    style={styles.finishLink}
                    accessibilityRole="button"
                    onPress={canResumeInMemory
                      ? () => dispatch({ type: 'SET_PHASE', phase: 'done' })
                      : () => { handleResume({ finish: true }); }}
                  >
                    <Text style={[styles.finishLinkText, { color: colors.accent }]}>Finish and see summary</Text>
                  </TouchableOpacity>
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
    ...CONTENT_COLUMN,
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
  // The value buttons are 44 pt tall (#174); the rows' padding shrinks to
  // match, so the cards keep their height.
  sortContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  sortButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  filterDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 16,
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
  finishLink: {
    alignSelf: 'center',
    paddingVertical: SPACING.base,
  },
  finishLinkText: {
    fontSize: 15,
    fontWeight: '600',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.lg,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.lg,
  },
  switchLabel: {
    flex: 1,
    fontSize: 15,
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
  // 44 pt to hit; the row grows to fit it. (A negative vertical margin kept
  // the old row height only at the default text size: larger text spilled
  // into the rows above and below.)
  changeButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: SPACING.base,
    marginRight: -SPACING.base,
  },
  changeButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
