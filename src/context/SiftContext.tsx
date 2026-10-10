import React, { createContext, useContext, useReducer, useMemo, useCallback, useEffect, useRef, ReactNode } from 'react';
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
} from '../types';
import { saveSession, clearSession } from '../services/SessionStore';
import { MusicProviderHost } from './MusicProviderContext';
import { loadPreferences, savePreferences } from '../services/PreferencesStore';
import { sortTracks } from '../utils/sorting';

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
  removalPlaylistCreated: boolean;
  removalPlaylistError: string | null;
  isCreatingPlaylist: boolean;
  removalErrors: string[];
  /**
   * Ids of the removed tracks whose removal failed. removalErrors holds
   * names for display, and two songs can share a name ("Intro"), so counts
   * key on these.
   */
  failedRemovalIds: string[];
  connectionStatus: ConnectionStatus;
  /**
   * Kept tracks whose add to the sifted playlist could not land yet (e.g. the
   * freshly-created playlist was not queryable within the retry window).
   * Flushed via saveSiftedPlaylist on the Done screen — never silently
   * dropped while the sift they belong to is alive. Only the deliberate
   * session-abandonment exits (LOAD_TRACKS / START_FRESH / RESET_TO_SETUP)
   * discard them, because they discard the whole kept list along with them.
   */
  pendingKeeps: Track[];
  /** When true, the next loadTracks call skips sifted/removal filtering. */
  skipFiltering: boolean;
  /**
   * Id of the "<name> - Sifted" companion playlist for the current playlist
   * source, captured by keepTrack when it creates or first resolves the
   * playlist. Lets later lookups resolve by id (rename-proof) instead of by
   * name; null until known (and for legacy sessions that predate the field).
   */
  siftedPlaylistId: string | null;
  /**
   * "Start at chorus" setting: Apple Music tracks start at their chorus
   * instead of 0:00. A preference, not session state: persisted by
   * PreferencesStore, never saved with or restored from a session.
   */
  startAtChorus: boolean;
  /** The latest decision, not yet sent to the music service (#152). */
  pending: PendingDecision | null;
}

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
  removalPlaylistCreated: false,
  removalPlaylistError: null,
  isCreatingPlaylist: false,
  removalErrors: [],
  failedRemovalIds: [],
  connectionStatus: 'unknown',
  pendingKeeps: [],
  skipFiltering: false,
  siftedPlaylistId: null,
  pending: null,
  startAtChorus: DEFAULT_PREFERENCES.startAtChorus,
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
  | { type: 'SET_PLAYBACK_POSITION'; position: number }
  | { type: 'SET_IS_PLAYING'; isPlaying: boolean }
  | { type: 'SET_CONNECTION_STATUS'; status: ConnectionStatus }
  | { type: 'SET_PLAYLIST_CREATED'; created: boolean }
  | { type: 'SET_PLAYLIST_ERROR'; error: string | null }
  | { type: 'SET_CREATING_PLAYLIST'; creating: boolean }
  | { type: 'ADD_REMOVAL_ERROR'; error: string; failedRemovalId?: string }
  | { type: 'ADD_PENDING_KEEP'; track: Track }
  | { type: 'REMOVE_PENDING_KEEPS'; trackIds: string[] }
  | { type: 'SET_SIFTED_PLAYLIST_ID'; id: string | null }
  | { type: 'RESTORE_TRACK'; trackId: string }
  | { type: 'SET_SOURCE'; source: SiftSource }
  | { type: 'SET_START_AT_CHORUS'; enabled: boolean }
  | { type: 'RESUME_SESSION'; session: Omit<SiftState, 'phase' | 'startAtChorus'> & { phase?: AppPhase } }
  | { type: 'START_FRESH'; skipFiltering?: boolean }
  | { type: 'RESET_TO_SETUP' };

/** Two sources are the same sift source: library, or the same playlist. */
function sameSource(a: SiftSource, b: SiftSource): boolean {
  return a.type === 'playlist' && b.type === 'playlist' ? a.playlist.id === b.playlist.id : a.type === b.type;
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
        tracks: action.tracks,
        cursor: 0,
        kept: [],
        removed: [],
        skipped: [],
        removalErrors: [],
        failedRemovalIds: [],
        // Intentional discard: loading a fresh track list abandons the
        // previous sift wholesale (kept/removed/skipped included), so any
        // still-buffered keeps from it are deliberately dropped with it.
        // Mid-sift cleanup must use REMOVE_PENDING_KEEPS instead.
        pendingKeeps: [],
        pending: null,
        // The last sift's save status: a stale error would also stop Done's
        // fallback save for this sift's keeps (Review N skipped, #142).
        removalPlaylistCreated: false,
        removalPlaylistError: null,
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

    case 'SET_PLAYBACK_POSITION':
      return { ...state, playbackPosition: action.position };

    case 'SET_IS_PLAYING':
      return { ...state, isPlaying: action.isPlaying };

    case 'SET_CONNECTION_STATUS':
      return { ...state, connectionStatus: action.status };

    case 'SET_PLAYLIST_CREATED':
      return { ...state, removalPlaylistCreated: action.created };

    case 'SET_PLAYLIST_ERROR':
      return { ...state, removalPlaylistError: action.error };

    case 'SET_CREATING_PLAYLIST':
      return { ...state, isCreatingPlaylist: action.creating };

    case 'ADD_REMOVAL_ERROR':
      return {
        ...state,
        removalErrors: [...state.removalErrors, action.error],
        ...(action.failedRemovalId != null && {
          failedRemovalIds: [...state.failedRemovalIds, action.failedRemovalId],
        }),
      };

    case 'ADD_PENDING_KEEP': {
      if (state.pendingKeeps.some((t) => t.id === action.track.id)) return state;
      return { ...state, pendingKeeps: [...state.pendingKeeps, action.track] };
    }

    case 'REMOVE_PENDING_KEEPS': {
      // Remove exactly the tracks the caller persisted — never the whole
      // array. A keep that gets buffered while a save is in flight must
      // survive that save's cleanup so the Done fallback can fire again.
      const ids = new Set(action.trackIds);
      const remaining = state.pendingKeeps.filter((t) => !ids.has(t.id));
      return remaining.length === state.pendingKeeps.length
        ? state
        : { ...state, pendingKeeps: remaining };
    }

    case 'SET_SIFTED_PLAYLIST_ID':
      return state.siftedPlaylistId === action.id
        ? state
        : { ...state, siftedPlaylistId: action.id };

    case 'RESTORE_TRACK': {
      const track = state.removed.find((t) => t.id === action.trackId);
      if (!track) return state;
      return {
        ...state,
        removed: state.removed.filter((t) => t.id !== action.trackId),
        kept: [...state.kept, track],
      };
    }

    case 'SET_SOURCE': {
      // The sifted-playlist id is only meaningful for the playlist it was
      // resolved for — switching to a different source must not let a stale
      // id point id-first lookups at the wrong "<name> - Sifted" playlist.
      const samePlaylist =
        action.source.type === 'playlist' &&
        state.source.type === 'playlist' &&
        action.source.playlist.id === state.source.playlist.id;
      return {
        ...state,
        source: action.source,
        siftedPlaylistId: samePlaylist ? state.siftedPlaylistId : null,
      };
    }

    case 'SET_START_AT_CHORUS':
      return state.startAtChorus === action.enabled ? state : { ...state, startAtChorus: action.enabled };

    case 'RESUME_SESSION':
      return {
        ...state,
        ...action.session,
        phase: action.session.phase ?? 'sifting',
        activeSource: action.session.source ?? state.source,
        // A preference, not part of the session being resumed.
        startAtChorus: state.startAtChorus,
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
        removalPlaylistCreated: false,
        removalPlaylistError: null,
        removalErrors: [],
        failedRemovalIds: [],
        // Intentional discard — START_FRESH is a deliberate abandonment of
        // the previous sift (its kept list included), not mid-sift cleanup.
        pendingKeeps: [],
        pending: null,
        phase: 'loading',
        skipFiltering: action.skipFiltering ?? false,
        isPlaying: false,
        playbackPosition: 0,
        isCreatingPlaylist: false,
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
        removalPlaylistCreated: false,
        removalPlaylistError: null,
        removalErrors: [],
        failedRemovalIds: [],
        // Intentional discard — RESET_TO_SETUP abandons the finished sift
        // entirely; see the LOAD_TRACKS note above.
        pendingKeeps: [],
        pending: null,
        phase: 'setup',
        skipFiltering: false,
        isPlaying: false,
        playbackPosition: 0,
        isCreatingPlaylist: false,
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
}

const SiftContext = createContext<SiftContextValue | null>(null);

export function SiftProvider({ children, initialTracks }: { children: ReactNode; initialTracks?: Track[] }) {
  const init = initialTracks
    ? { ...initialState, tracks: initialTracks, phase: 'sifting' as AppPhase }
    : initialState;

  const [state, dispatch] = useReducer(siftReducer, init);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSessionRef = useRef<SiftSession | null>(null);
  // Set once the user changes a preference, so a slow initial load can't
  // overwrite their choice with the stored value.
  const preferencesChangedRef = useRef(false);

  // Load saved preferences once.
  useEffect(() => {
    let cancelled = false;
    loadPreferences().then((preferences) => {
      if (cancelled || preferencesChangedRef.current) return;
      dispatch({ type: 'SET_START_AT_CHORUS', enabled: preferences.startAtChorus });
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
  }, [state.phase, state.provider, state.cursor, state.tracks.length, state.kept.length, state.removed.length, state.skipped.length, state.sortOrder]);

  // Auto-save session after every decision (debounced to avoid rapid-fire writes during fast swiping)
  useEffect(() => {
    // Setup with tracks is a sift backed out of: still saved, so a held
    // decision sent on the way out (#152) isn't left on disk to come back.
    // Only while Setup shows that sift's own source: picking another one
    // changes the source and drops the sifted-playlist id in state.
    const backedOut = state.phase === 'setup'
      && state.activeSource != null
      && sameSource(state.activeSource, state.source);
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
      // Persisted so the never-silently-dropped guarantee survives an app
      // kill/relaunch: without these, a resumed session forgets the repair
      // signal and Done's fallback save never fires.
      pendingKeeps: state.pendingKeeps,
      removalErrors: state.removalErrors,
      failedRemovalIds: state.failedRemovalIds,
      // Persisted so a resumed session keeps resolving its sifted playlist
      // by id (rename-proof) instead of falling back to the name match.
      siftedPlaylistId: state.siftedPlaylistId,
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
  }, [state.cursor, state.kept, state.removed, state.skipped, state.tracks, state.phase, state.sortOrder, state.provider, state.source, state.activeSource, state.pendingKeeps, state.removalErrors, state.failedRemovalIds, state.siftedPlaylistId, state.pending]);

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
    [dispatch, state.tracks.length, state.cursor]
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

  const startFresh = useCallback((skipFiltering?: boolean) => {
    Sentry.addBreadcrumb({ category: 'user-action', message: 'Started fresh session', level: 'info' });
    dropPendingSave();
    clearSession().then(() => {
      dispatch({ type: 'START_FRESH', skipFiltering });
    });
  }, [dispatch, dropPendingSave]);

  const resetToSetup = useCallback(() => {
    Sentry.addBreadcrumb({ category: 'user-action', message: 'Reset to setup', level: 'info' });
    dropPendingSave();
    clearSession().then(() => {
      dispatch({ type: 'RESET_TO_SETUP' });
    });
  }, [dispatch, dropPendingSave]);

  const setStartAtChorus = useCallback(
    (enabled: boolean) => {
      preferencesChangedRef.current = true;
      Sentry.addBreadcrumb({ category: 'user-action', message: `Start at chorus: ${enabled}`, level: 'info' });
      dispatch({ type: 'SET_START_AT_CHORUS', enabled });
      savePreferences({ startAtChorus: enabled });
    },
    [dispatch]
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
    }),
    [state, dispatch, currentTrack, nextTrack, nextNextTrack, remaining, total, decide, startFresh, resetToSetup, flushPendingSave, setStartAtChorus]
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
