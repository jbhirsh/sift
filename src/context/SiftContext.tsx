import React, {
  createContext,
  useContext,
  useReducer,
  useMemo,
  useCallback,
  useEffect,
  useRef,
  ReactNode,
} from 'react';
import * as Sentry from '@sentry/react-native';
import { AppState } from 'react-native';
import {
  Track,
  Decision,
  AppPhase,
  SortOrder,
  MusicProvider,
  ConnectionStatus,
  SiftSession,
  SiftSource,
  PendingDecision,
  DEFAULT_PREFERENCES,
  Preferences,
  PreferenceField,
  NO_FILTER,
  TrackFilter,
} from '../types';
import { saveSession, clearSession } from '../services/SessionStore';
import { MusicProviderHost } from './MusicProviderContext';
import { loadPreferences, updatePreferences } from '../services/PreferencesStore';
import { trace, tracing } from '../services/trace';
import { describeAction } from '../utils/trace';
import { sortTracks } from '../utils/sorting';
import { uniqueTracks } from '../utils/trackIdentity';

// ── State ──────────────────────────────────────────────

export interface SiftState {
  phase: AppPhase;
  provider: MusicProvider;
  source: SiftSource;
  /** The source that the current tracks were loaded from. */
  activeSource: SiftSource | null;
  tracks: Track[];
  cursor: number;
  kept: Track[];
  removed: Track[];
  skipped: Track[];
  sortOrder: SortOrder;
  loadProgress: number;
  loadMessage: string;
  loadError: string | null;
  playbackPosition: number;
  isPlaying: boolean;
  removalErrors: string[];
  /**
   * Ids of the removed tracks whose removal failed. removalErrors holds
   * names for display, and two songs can share a name ("Intro"), so counts
   * key on these.
   */
  failedRemovalIds: string[];
  connectionStatus: ConnectionStatus;
  /**
   * When true, the next loadTracks call skips the reviewed-ledger filter
   * (and, for a playlist, the removal-history one).
   */
  skipFiltering: boolean;
  /**
   * "Start at chorus" setting: Apple Music tracks start at their chorus
   * instead of 0:00. A preference, not session state: persisted by
   * PreferencesStore, never saved with or restored from a session.
   */
  startAtChorus: boolean;
  /** The latest decision, not yet sent to the music service (#152). */
  pending: PendingDecision | null;
  /** The track whose last play failed, so the player can say so. */
  playbackFailedId: string | null;
  /**
   * The native song cache is being filled for a resumed session. A play
   * that fails meanwhile may only be waiting for it, so it isn't reported.
   */
  songCacheWarming: boolean;
  /**
   * Counts the warm-ups finished. Play, artwork and the chorus start try
   * again when it changes: a card shown before its song was cached got none.
   */
  songCacheGeneration: number;
  /**
   * Which songs the next sift loads (Setup's Plays and Added). A choice for
   * the next load, like the source: a loaded sift's tracks already carry it.
   */
  filter: TrackFilter;
}

/** State that lives for the app session only, never saved or resumed. */
type TransientState =
  | 'phase'
  | 'startAtChorus'
  | 'playbackFailedId'
  | 'songCacheWarming'
  | 'songCacheGeneration'
  | 'filter';

const initialState: SiftState = {
  phase: 'setup',
  provider: 'apple-music',
  source: { type: 'library' },
  activeSource: null,
  tracks: [],
  cursor: 0,
  kept: [],
  removed: [],
  skipped: [],
  sortOrder: 'least-played',
  loadProgress: 0,
  loadMessage: 'Connecting to Music…',
  loadError: null,
  playbackPosition: 0,
  isPlaying: false,
  removalErrors: [],
  failedRemovalIds: [],
  connectionStatus: 'unknown',
  skipFiltering: false,
  pending: null,
  startAtChorus: DEFAULT_PREFERENCES.startAtChorus,
  playbackFailedId: null,
  songCacheWarming: false,
  songCacheGeneration: 0,
  filter: NO_FILTER,
};

// ── Actions ────────────────────────────────────────────

type SiftAction =
  | { type: 'DECIDE'; decision: Decision; /** ms since epoch */ at?: number }
  | { type: 'PENDING_SENT'; trackId: string; at: number }
  | { type: 'UNDO_LAST' }
  | { type: 'FINISH' }
  | { type: 'CONTINUE_SIFTING' }
  | { type: 'SET_PHASE'; phase: AppPhase }
  | { type: 'SET_PROVIDER'; provider: MusicProvider }
  | { type: 'SET_SORT_ORDER'; sortOrder: SortOrder }
  | { type: 'LOAD_TRACKS'; tracks: Track[] }
  | { type: 'SET_LOAD_PROGRESS'; progress: number; message?: string }
  | { type: 'SET_LOAD_ERROR'; error: string }
  /**
   * Loading's Cancel (#177): back to Setup. The load's progress and any
   * error go; a saved session Start Sifting already discarded stays gone.
   */
  | { type: 'CANCEL_LOAD' }
  | { type: 'SET_PLAYBACK_POSITION'; position: number }
  | { type: 'SET_IS_PLAYING'; isPlaying: boolean }
  | { type: 'SET_CONNECTION_STATUS'; status: ConnectionStatus }
  | { type: 'ADD_REMOVAL_ERROR'; error: string; failedRemovalId?: string }
  /** A failed removal landed on a retry (#151): it's no longer a failure. */
  | { type: 'CLEAR_REMOVAL_FAILURE'; trackId: string; error: string }
  | { type: 'RESTORE_TRACK'; trackId: string }
  | { type: 'SET_SOURCE'; source: SiftSource }
  | { type: 'SET_START_AT_CHORUS'; enabled: boolean }
  /**
   * The saved preferences, at launch (#175). `skip` names those the user
   * changed before they loaded, which keep the user's choice.
   */
  | { type: 'APPLY_PREFERENCES'; preferences: Preferences; skip: readonly PreferenceField[] }
  | { type: 'RESUME_SESSION'; session: Omit<SiftState, TransientState> & { phase?: AppPhase } }
  | { type: 'SET_PLAYBACK_FAILED'; trackId: string | null }
  | { type: 'SONG_CACHE_WARMING' }
  | { type: 'SONG_CACHE_WARMED' }
  /** One or both of Setup's Plays and Added choices. */
  | { type: 'SET_FILTER'; filter: Partial<TrackFilter> }
  /** A decided card's decision changed (the decisions list). */
  | { type: 'REVISE'; trackId: string; decision: Decision }
  | { type: 'START_FRESH'; skipFiltering?: boolean }
  | { type: 'RESET_TO_SETUP' };

/** Two sources are the same sift source: library, or the same playlist. */
function sameSource(a: SiftSource, b: SiftSource): boolean {
  return a.type === 'playlist' && b.type === 'playlist'
    ? a.playlist.id === b.playlist.id
    : a.type === b.type;
}

// ── Reducer ────────────────────────────────────────────

export function siftReducer(state: SiftState, action: SiftAction): SiftState {
  switch (action.type) {
    case 'DECIDE': {
      const track = state.tracks[state.cursor];
      if (!track) return state;

      const next: SiftState = {
        ...state,
        cursor: state.cursor + 1,
        // Whoever dispatches DECIDE sends the previous pending decision
        // first (SiftScreen); this one waits out the undo window.
        pending: { trackId: track.id, decision: action.decision, at: action.at ?? 0 },
      };

      switch (action.decision) {
        case 'keep':
          next.kept = [...state.kept, track];
          break;
        case 'remove':
          next.removed = [...state.removed, track];
          break;
        case 'skip':
          next.skipped = [...state.skipped, track];
          break;
      }

      if (next.cursor >= state.tracks.length) {
        next.phase = 'done';
      }

      return next;
    }

    case 'PENDING_SENT':
      return state.pending?.trackId === action.trackId && state.pending.at === action.at
        ? { ...state, pending: null }
        : state;

    // Take back the latest decision while it hasn't been sent (#152): the
    // card comes back, and the music service never heard of it.
    case 'UNDO_LAST': {
      const pending = state.pending;
      const track = state.tracks[state.cursor - 1];
      if (!pending || !track || track.id !== pending.trackId) return state;
      const drop = (list: Track[]) => {
        const i = list.map((t) => t.id).lastIndexOf(track.id);
        return i < 0 ? list : [...list.slice(0, i), ...list.slice(i + 1)];
      };
      // From whichever list holds it: a Restore moves a removed song to kept.
      return {
        ...state,
        cursor: state.cursor - 1,
        kept: drop(state.kept),
        removed: drop(state.removed),
        skipped: drop(state.skipped),
        pending: null,
        phase: state.phase === 'done' ? 'sifting' : state.phase,
      };
    }

    // End a sift early (#142): Done with the decisions so far. The session
    // is untouched, so CONTINUE_SIFTING (or a later resume) picks up at the
    // next card.
    case 'FINISH':
      if (state.phase !== 'sifting') return state;
      return { ...state, phase: 'done', isPlaying: false };

    case 'CONTINUE_SIFTING':
      if (state.phase !== 'done' || state.cursor >= state.tracks.length) return state;
      return { ...state, phase: 'sifting' };

    case 'SET_PHASE':
      return { ...state, phase: action.phase };

    case 'SET_PROVIDER':
      return { ...state, provider: action.provider };

    case 'SET_SORT_ORDER': {
      const hasActiveSift = state.tracks.length > 0 && state.cursor < state.tracks.length;
      if (!hasActiveSift) {
        return { ...state, sortOrder: action.sortOrder };
      }
      // Re-sort only the remaining unsifted tracks
      const decided = state.tracks.slice(0, state.cursor);
      const remaining = sortTracks(state.tracks.slice(state.cursor), action.sortOrder);
      return { ...state, sortOrder: action.sortOrder, tracks: [...decided, ...remaining] };
    }

    case 'LOAD_TRACKS':
      return {
        ...state,
        // One card per song: a playlist can list a song twice (#56).
        tracks: uniqueTracks(action.tracks),
        cursor: 0,
        kept: [],
        removed: [],
        skipped: [],
        removalErrors: [],
        failedRemovalIds: [],
        pending: null,
        phase: 'sifting',
        loadProgress: 1,
        activeSource: state.source,
        skipFiltering: false,
      };

    case 'SET_LOAD_PROGRESS':
      return {
        ...state,
        loadProgress: action.progress,
        ...(action.message !== undefined && { loadMessage: action.message }),
      };

    case 'SET_LOAD_ERROR':
      return { ...state, loadError: action.error, phase: 'setup' };

    case 'CANCEL_LOAD':
      // Only from Loading: a late press must not pull a sift out from under it.
      if (state.phase !== 'loading') return state;
      return {
        ...state,
        phase: 'setup',
        loadProgress: 0,
        loadMessage: '',
        loadError: null,
        skipFiltering: false,
      };

    case 'SET_PLAYBACK_POSITION':
      return { ...state, playbackPosition: action.position };

    case 'SET_IS_PLAYING':
      return { ...state, isPlaying: action.isPlaying };

    case 'SET_CONNECTION_STATUS':
      return { ...state, connectionStatus: action.status };

    case 'SET_PLAYBACK_FAILED':
      return state.playbackFailedId === action.trackId
        ? state
        : { ...state, playbackFailedId: action.trackId };

    case 'SONG_CACHE_WARMING':
      return { ...state, songCacheWarming: true };

    case 'SET_FILTER':
      return { ...state, filter: { ...state.filter, ...action.filter } };

    case 'REVISE': {
      // Only a decided card, and only to another decision.
      const index = state.tracks.findIndex((t) => t.id === action.trackId);
      if (index < 0 || index >= state.cursor) return state;
      const track = state.tracks[index];
      const without = (list: Track[]) => list.filter((t) => t.id !== track.id);
      const lists = {
        kept: without(state.kept),
        removed: without(state.removed),
        skipped: without(state.skipped),
      };
      const target =
        action.decision === 'keep' ? 'kept' : action.decision === 'remove' ? 'removed' : 'skipped';
      if (lists[target].length < state[target].length) return state;
      lists[target] = [...lists[target], track];
      // A removal that failed is no longer owed once it isn't a removal.
      const wasFailed = state.failedRemovalIds.includes(track.id) && action.decision !== 'remove';
      const errorIndex = wasFailed ? state.removalErrors.indexOf(track.name) : -1;
      return {
        ...state,
        ...lists,
        // Still held (not sent; useReviseDecision clears a sent one first):
        // it goes out as the new decision.
        pending:
          state.pending?.trackId === track.id
            ? { ...state.pending, decision: action.decision }
            : state.pending,
        failedRemovalIds: wasFailed
          ? state.failedRemovalIds.filter((id) => id !== track.id)
          : state.failedRemovalIds,
        removalErrors:
          errorIndex < 0
            ? state.removalErrors
            : state.removalErrors.filter((_, i) => i !== errorIndex),
      };
    }

    case 'SONG_CACHE_WARMED':
      return {
        ...state,
        songCacheWarming: false,
        songCacheGeneration: state.songCacheGeneration + 1,
      };

    case 'ADD_REMOVAL_ERROR':
      return {
        ...state,
        removalErrors: [...state.removalErrors, action.error],
        ...(action.failedRemovalId != null && {
          failedRemovalIds: [...state.failedRemovalIds, action.failedRemovalId],
        }),
      };

    case 'CLEAR_REMOVAL_FAILURE': {
      if (!state.failedRemovalIds.includes(action.trackId)) return state;
      // removalErrors holds names for display; drop one entry for this song.
      const errorIndex = state.removalErrors.indexOf(action.error);
      return {
        ...state,
        failedRemovalIds: state.failedRemovalIds.filter((id) => id !== action.trackId),
        removalErrors:
          errorIndex < 0
            ? state.removalErrors
            : state.removalErrors.filter((_, i) => i !== errorIndex),
      };
    }

    case 'RESTORE_TRACK': {
      const track = state.removed.find((t) => t.id === action.trackId);
      if (!track) return state;
      return {
        ...state,
        removed: state.removed.filter((t) => t.id !== action.trackId),
        kept: [...state.kept, track],
      };
    }

    case 'SET_SOURCE':
      return { ...state, source: action.source };

    case 'SET_START_AT_CHORUS':
      return state.startAtChorus === action.enabled
        ? state
        : { ...state, startAtChorus: action.enabled };

    case 'APPLY_PREFERENCES': {
      const { preferences, skip } = action;
      const next = { ...state };
      if (!skip.includes('startAtChorus')) next.startAtChorus = preferences.startAtChorus;
      // The sort and filter pick a new sift's songs, on Setup: a sift
      // already in hand (resumed before they loaded) or one loading (started
      // before, with the choices it read then) keeps its own.
      if (state.phase === 'setup' && state.tracks.length === 0) {
        if (!skip.includes('sortOrder')) next.sortOrder = preferences.sortOrder;
        const filter = { ...state.filter };
        if (!skip.includes('maxPlays')) filter.maxPlays = preferences.filter.maxPlays;
        if (!skip.includes('addedYearsAgo'))
          filter.addedYearsAgo = preferences.filter.addedYearsAgo;
        next.filter = filter;
      }
      return next;
    }

    case 'RESUME_SESSION':
      return {
        ...state,
        ...action.session,
        phase: action.session.phase ?? 'sifting',
        activeSource: action.session.source ?? state.source,
        // A preference, not part of the session being resumed.
        startAtChorus: state.startAtChorus,
        playbackFailedId: null,
      };

    case 'START_FRESH':
      return {
        ...state,
        source: state.source,
        activeSource: null,
        tracks: [],
        cursor: 0,
        kept: [],
        removed: [],
        skipped: [],
        loadProgress: 0,
        loadError: null,
        loadMessage: state.source.type === 'playlist' ? 'Loading playlist…' : 'Loading library…',
        removalErrors: [],
        failedRemovalIds: [],
        pending: null,
        phase: 'loading',
        skipFiltering: action.skipFiltering ?? false,
        // A resume's warm-up still running belongs to the sift left behind.
        songCacheWarming: false,
        isPlaying: false,
        playbackPosition: 0,
      };

    case 'RESET_TO_SETUP':
      return {
        ...state,
        activeSource: null,
        tracks: [],
        cursor: 0,
        kept: [],
        removed: [],
        skipped: [],
        loadProgress: 0,
        loadError: null,
        loadMessage: '',
        removalErrors: [],
        failedRemovalIds: [],
        pending: null,
        phase: 'setup',
        skipFiltering: false,
        songCacheWarming: false,
        isPlaying: false,
        playbackPosition: 0,
      };

    default:
      return state;
  }
}

// ── Context ────────────────────────────────────────────

interface SiftContextValue {
  state: SiftState;
  dispatch: React.Dispatch<SiftAction>;
  // Convenience helpers
  currentTrack: Track | undefined;
  nextTrack: Track | undefined;
  nextNextTrack: Track | undefined;
  remaining: number;
  total: number;
  /** Returns the decision as held (#152), or null when there was no card. */
  decide: (decision: Decision) => PendingDecision | null;
  startFresh: (skipFiltering?: boolean) => void;
  resetToSetup: () => void;
  /**
   * Immediately persist any debounced-but-unsaved session write. Call before
   * navigating away from sifting (e.g. back to setup) so the last decisions
   * are not lost when the autosave effect's cleanup cancels the pending timer.
   */
  flushPendingSave: () => void;
  /** Change and persist the "Start at chorus" setting. */
  setStartAtChorus: (enabled: boolean) => void;
  /** Change Setup's sort order, remembered for later launches (#175). */
  setSortOrder: (sortOrder: SortOrder) => void;
  /** Change Setup's Plays or Added choice, remembered for later launches (#175). */
  setFilter: (filter: Partial<TrackFilter>) => void;
}

const SiftContext = createContext<SiftContextValue | null>(null);

export function SiftProvider({
  children,
  initialTracks,
}: {
  children: ReactNode;
  initialTracks?: Track[];
}) {
  const init = initialTracks
    ? { ...initialState, tracks: initialTracks, phase: 'sifting' as AppPhase }
    : initialState;

  const [state, reactDispatch] = useReducer(siftReducer, init);
  // Every action goes in the E2E trace (services/trace): what a tap did, on
  // any screen.
  const dispatch = useCallback((action: SiftAction) => {
    if (tracing) {
      const described = describeAction(action);
      if (described) trace('action', described);
    }
    reactDispatch(action);
  }, []);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSessionRef = useRef<SiftSession | null>(null);
  // The preferences the user changed this launch, so a slow initial load
  // can't overwrite their choice with the stored value.
  const preferencesChangedRef = useRef(new Set<PreferenceField>());

  // Load saved preferences once.
  useEffect(() => {
    let cancelled = false;
    loadPreferences().then((preferences) => {
      if (cancelled) return;
      dispatch({
        type: 'APPLY_PREFERENCES',
        preferences,
        skip: [...preferencesChangedRef.current],
      });
    });
    return () => {
      cancelled = true;
    };
  }, [dispatch]);

  // Keep Sentry context in sync with app state
  useEffect(() => {
    Sentry.setTag('provider', state.provider);
    Sentry.setTag('phase', state.phase);
    Sentry.setContext('sift_session', {
      trackCount: state.tracks.length,
      cursor: state.cursor,
      kept: state.kept.length,
      removed: state.removed.length,
      skipped: state.skipped.length,
      sortOrder: state.sortOrder,
    });
  }, [
    state.phase,
    state.provider,
    state.cursor,
    state.tracks.length,
    state.kept.length,
    state.removed.length,
    state.skipped.length,
    state.sortOrder,
  ]);

  // Auto-save session after every decision (debounced to avoid rapid-fire writes during fast swiping)
  useEffect(() => {
    // Setup with tracks is a sift backed out of: still saved, so a held
    // decision sent on the way out (#152) isn't left on disk to come back.
    // Only while Setup shows that sift's own source.
    const backedOut =
      state.phase === 'setup' &&
      state.activeSource != null &&
      sameSource(state.activeSource, state.source);
    if (state.phase !== 'sifting' && state.phase !== 'done' && !backedOut) return;
    if (state.tracks.length === 0) return;

    const session: SiftSession = {
      tracks: state.tracks,
      cursor: state.cursor,
      kept: state.kept,
      removed: state.removed,
      skipped: state.skipped,
      sortOrder: state.sortOrder,
      savedAt: new Date().toISOString(),
      provider: state.provider,
      // The source these tracks came from: on Setup the picker can already
      // show another one.
      source: state.activeSource ?? state.source,
      // Persisted so a resumed session still shows its failed removals and
      // retries them.
      removalErrors: state.removalErrors,
      failedRemovalIds: state.failedRemovalIds,
      // Persisted before it is sent, so a crash in the undo window still
      // sends it on resume (#152).
      pending: state.pending,
    };

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    pendingSessionRef.current = session;
    saveTimeoutRef.current = setTimeout(() => {
      pendingSessionRef.current = null;
      saveSession(session);
    }, 500);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [
    state.cursor,
    state.kept,
    state.removed,
    state.skipped,
    state.tracks,
    state.phase,
    state.sortOrder,
    state.provider,
    state.source,
    state.activeSource,
    state.removalErrors,
    state.failedRemovalIds,
    state.pending,
  ]);

  // Flush a debounced session write immediately (see SiftContextValue docs).
  const flushPendingSave = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    const pending = pendingSessionRef.current;
    if (pending) {
      pendingSessionRef.current = null;
      saveSession(pending);
    }
  }, []);

  // The autosave is debounced, so a swipe followed straight away by a call,
  // a lock or the app switcher could lose that decision (while its remote
  // removal had already gone through). Write it out as the app leaves the
  // foreground (#137).
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') flushPendingSave();
    });
    return () => subscription.remove();
  }, [flushPendingSave]);

  const onPlaybackPosition = useCallback(
    (position: number) => dispatch({ type: 'SET_PLAYBACK_POSITION', position }),
    [dispatch],
  );

  const currentTrack = state.tracks[state.cursor];
  const nextTrack = state.tracks[state.cursor + 1];
  const nextNextTrack = state.tracks[state.cursor + 2];
  const remaining = Math.max(0, state.tracks.length - state.cursor);
  const total = state.tracks.length;

  const tracksRef = useRef(state.tracks);
  useEffect(() => {
    tracksRef.current = state.tracks;
  }, [state.tracks]);

  const decide = useCallback(
    (decision: Decision) => {
      // The card's position, never its name: track names are listening
      // history (#147).
      Sentry.addBreadcrumb({
        category: 'user-action',
        message: `Decision: ${decision} on card ${state.cursor + 1} of ${state.tracks.length}`,
        level: 'info',
      });
      const at = Date.now();
      // The reducer judges the card from its own state; this is only what
      // the caller gets back.
      dispatch({ type: 'DECIDE', decision, at });
      const track = tracksRef.current[state.cursor];
      return track ? { trackId: track.id, decision, at } : null;
    },
    // Not keyed on the tracks array: every LOAD_TRACKS makes a new one, and
    // decide's identity would change with it.
    [dispatch, state.tracks.length, state.cursor],
  );

  // Drop a debounced save that hasn't been written: the session it holds is
  // the one being discarded, and the background flush below would otherwise
  // write it back to disk after it was cleared.
  const dropPendingSave = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    pendingSessionRef.current = null;
  }, []);

  const startFresh = useCallback(
    (skipFiltering?: boolean) => {
      Sentry.addBreadcrumb({
        category: 'user-action',
        message: 'Started fresh session',
        level: 'info',
      });
      dropPendingSave();
      clearSession().then(() => {
        dispatch({ type: 'START_FRESH', skipFiltering });
      });
    },
    [dispatch, dropPendingSave],
  );

  const resetToSetup = useCallback(() => {
    Sentry.addBreadcrumb({ category: 'user-action', message: 'Reset to setup', level: 'info' });
    dropPendingSave();
    clearSession().then(() => {
      dispatch({ type: 'RESET_TO_SETUP' });
    });
  }, [dispatch, dropPendingSave]);

  const setStartAtChorus = useCallback(
    (enabled: boolean) => {
      preferencesChangedRef.current.add('startAtChorus');
      Sentry.addBreadcrumb({
        category: 'user-action',
        message: `Start at chorus: ${enabled}`,
        level: 'info',
      });
      dispatch({ type: 'SET_START_AT_CHORUS', enabled });
      void updatePreferences({ startAtChorus: enabled });
    },
    [dispatch],
  );

  // Only Setup's own choices are remembered: a resumed session brings its
  // sort with it (RESUME_SESSION) without changing what's saved.
  const setSortOrder = useCallback(
    (sortOrder: SortOrder) => {
      preferencesChangedRef.current.add('sortOrder');
      dispatch({ type: 'SET_SORT_ORDER', sortOrder });
      void updatePreferences({ sortOrder });
    },
    [dispatch],
  );

  const setFilter = useCallback(
    (filter: Partial<TrackFilter>) => {
      for (const field of Object.keys(filter) as (keyof TrackFilter)[])
        preferencesChangedRef.current.add(field);
      dispatch({ type: 'SET_FILTER', filter });
      void updatePreferences({ filter });
    },
    [dispatch],
  );

  const value = useMemo<SiftContextValue>(
    () => ({
      state,
      dispatch,
      currentTrack,
      nextTrack,
      nextNextTrack,
      remaining,
      total,
      decide,
      startFresh,
      resetToSetup,
      flushPendingSave,
      setStartAtChorus,
      setSortOrder,
      setFilter,
    }),
    [
      state,
      dispatch,
      currentTrack,
      nextTrack,
      nextNextTrack,
      remaining,
      total,
      decide,
      startFresh,
      resetToSetup,
      flushPendingSave,
      setStartAtChorus,
      setSortOrder,
      setFilter,
    ],
  );

  return (
    <SiftContext.Provider value={value}>
      {/* Polls only on the Sift screen: the last decision moves to Done
          without clearing isPlaying, and the player there is gone. */}
      <MusicProviderHost
        provider={state.provider}
        isPlaying={state.isPlaying && state.phase === 'sifting'}
        onPosition={onPlaybackPosition}
      >
        {children}
      </MusicProviderHost>
    </SiftContext.Provider>
  );
}

export function useSift(): SiftContextValue {
  const ctx = useContext(SiftContext);
  if (!ctx) throw new Error('useSift must be used within a SiftProvider');
  return ctx;
}
