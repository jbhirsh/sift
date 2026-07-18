import React, { createContext, useContext, useReducer, useMemo, useCallback, useEffect, useRef, ReactNode } from 'react';
import * as Sentry from '@sentry/react-native';
import {
  Track,
  Decision,
  AppPhase,
  SortOrder,
  MusicProvider,
  ConnectionStatus,
  SiftSession,
  SiftSource,
} from '../types';
import { saveSession, clearSession } from '../services/SessionStore';
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
  connectionStatus: 'unknown',
  pendingKeeps: [],
  skipFiltering: false,
  siftedPlaylistId: null,
};

// ── Actions ────────────────────────────────────────────

type SiftAction =
  | { type: 'DECIDE'; decision: Decision }
  | { type: 'SET_PHASE'; phase: AppPhase }
  | { type: 'SET_PROVIDER'; provider: MusicProvider }
  | { type: 'SET_SORT_ORDER'; sortOrder: SortOrder }
  | { type: 'LOAD_TRACKS'; tracks: Track[] }
  | { type: 'SET_LOAD_PROGRESS'; progress: number; message?: string }
  | { type: 'SET_LOAD_ERROR'; error: string }
  | { type: 'SET_PLAYBACK_POSITION'; position: number }
  | { type: 'SET_IS_PLAYING'; isPlaying: boolean }
  | { type: 'TOGGLE_PLAY_PAUSE' }
  | { type: 'SET_CONNECTION_STATUS'; status: ConnectionStatus }
  | { type: 'SET_PLAYLIST_CREATED'; created: boolean }
  | { type: 'SET_PLAYLIST_ERROR'; error: string | null }
  | { type: 'SET_CREATING_PLAYLIST'; creating: boolean }
  | { type: 'ADD_REMOVAL_ERROR'; error: string }
  | { type: 'ADD_PENDING_KEEP'; track: Track }
  | { type: 'REMOVE_PENDING_KEEPS'; trackIds: string[] }
  | { type: 'SET_SIFTED_PLAYLIST_ID'; id: string | null }
  | { type: 'RESTORE_TRACK'; trackId: string }
  | { type: 'SET_SOURCE'; source: SiftSource }
  | { type: 'RESUME_SESSION'; session: Omit<SiftState, 'phase'> & { phase?: AppPhase } }
  | { type: 'START_FRESH'; skipFiltering?: boolean }
  | { type: 'RESET_TO_SETUP' };

// ── Reducer ────────────────────────────────────────────

export function siftReducer(state: SiftState, action: SiftAction): SiftState {
  switch (action.type) {
    case 'DECIDE': {
      const track = state.tracks[state.cursor];
      if (!track) return state;

      const next: SiftState = { ...state, cursor: state.cursor + 1 };

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
        // Intentional discard: loading a fresh track list abandons the
        // previous sift wholesale (kept/removed/skipped included), so any
        // still-buffered keeps from it are deliberately dropped with it.
        // Mid-sift cleanup must use REMOVE_PENDING_KEEPS instead.
        pendingKeeps: [],
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

    case 'TOGGLE_PLAY_PAUSE':
      return { ...state, isPlaying: !state.isPlaying };

    case 'SET_CONNECTION_STATUS':
      return { ...state, connectionStatus: action.status };

    case 'SET_PLAYLIST_CREATED':
      return { ...state, removalPlaylistCreated: action.created };

    case 'SET_PLAYLIST_ERROR':
      return { ...state, removalPlaylistError: action.error };

    case 'SET_CREATING_PLAYLIST':
      return { ...state, isCreatingPlaylist: action.creating };

    case 'ADD_REMOVAL_ERROR':
      return { ...state, removalErrors: [...state.removalErrors, action.error] };

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

    case 'RESUME_SESSION':
      return {
        ...state,
        ...action.session,
        phase: action.session.phase ?? 'sifting',
        activeSource: action.session.source ?? state.source,
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
        // Intentional discard — START_FRESH is a deliberate abandonment of
        // the previous sift (its kept list included), not mid-sift cleanup.
        pendingKeeps: [],
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
        // Intentional discard — RESET_TO_SETUP abandons the finished sift
        // entirely; see the LOAD_TRACKS note above.
        pendingKeeps: [],
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
  decide: (decision: Decision) => void;
  startFresh: (skipFiltering?: boolean) => void;
  resetToSetup: () => void;
  /**
   * Immediately persist any debounced-but-unsaved session write. Call before
   * navigating away from sifting (e.g. back to setup) so the last decisions
   * are not lost when the autosave effect's cleanup cancels the pending timer.
   */
  flushPendingSave: () => void;
  togglePlayPause: () => void;
  seek: (position: number) => void;
  skipBackward: () => void;
  skipForward: () => void;
}

const SiftContext = createContext<SiftContextValue | null>(null);

export function SiftProvider({ children, initialTracks }: { children: ReactNode; initialTracks?: Track[] }) {
  const init = initialTracks
    ? { ...initialState, tracks: initialTracks, phase: 'sifting' as AppPhase }
    : initialState;

  const [state, dispatch] = useReducer(siftReducer, init);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSessionRef = useRef<SiftSession | null>(null);

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
    if (state.phase !== 'sifting' && state.phase !== 'done') return;
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
      source: state.source,
      // Persisted so the never-silently-dropped guarantee survives an app
      // kill/relaunch: without these, a resumed session forgets the repair
      // signal and Done's fallback save never fires.
      pendingKeeps: state.pendingKeeps,
      removalErrors: state.removalErrors,
      // Persisted so a resumed session keeps resolving its sifted playlist
      // by id (rename-proof) instead of falling back to the name match.
      siftedPlaylistId: state.siftedPlaylistId,
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
  }, [state.cursor, state.kept, state.removed, state.skipped, state.tracks, state.phase, state.sortOrder, state.provider, state.source, state.pendingKeeps, state.removalErrors, state.siftedPlaylistId]);

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

  const currentTrack = state.tracks[state.cursor];
  const nextTrack = state.tracks[state.cursor + 1];
  const nextNextTrack = state.tracks[state.cursor + 2];
  const remaining = Math.max(0, state.tracks.length - state.cursor);
  const total = state.tracks.length;

  const decide = useCallback(
    (decision: Decision) => {
      const track = state.tracks[state.cursor];
      Sentry.addBreadcrumb({
        category: 'user-action',
        message: `Decision: ${decision} on "${track?.name ?? 'unknown'}"`,
        level: 'info',
      });
      dispatch({ type: 'DECIDE', decision });
    },
    [dispatch, state.tracks, state.cursor]
  );

  const startFresh = useCallback((skipFiltering?: boolean) => {
    Sentry.addBreadcrumb({ category: 'user-action', message: 'Started fresh session', level: 'info' });
    clearSession().then(() => {
      dispatch({ type: 'START_FRESH', skipFiltering });
    });
  }, [dispatch]);

  const resetToSetup = useCallback(() => {
    Sentry.addBreadcrumb({ category: 'user-action', message: 'Reset to setup', level: 'info' });
    clearSession().then(() => {
      dispatch({ type: 'RESET_TO_SETUP' });
    });
  }, [dispatch]);

  const togglePlayPause = useCallback(
    () => dispatch({ type: 'TOGGLE_PLAY_PAUSE' }),
    [dispatch]
  );

  const seek = useCallback(
    (position: number) => dispatch({ type: 'SET_PLAYBACK_POSITION', position }),
    [dispatch]
  );

  const skipBackward = useCallback(() => {
    const newPos = Math.max(0, state.playbackPosition - 15);
    dispatch({ type: 'SET_PLAYBACK_POSITION', position: newPos });
  }, [dispatch, state.playbackPosition]);

  const skipForward = useCallback(() => {
    const track = state.tracks[state.cursor];
    if (!track) return;
    const newPos = Math.min(track.duration, state.playbackPosition + 15);
    dispatch({ type: 'SET_PLAYBACK_POSITION', position: newPos });
  }, [dispatch, state.playbackPosition, state.tracks, state.cursor]);

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
      togglePlayPause,
      seek,
      skipBackward,
      skipForward,
    }),
    [state, dispatch, currentTrack, nextTrack, nextNextTrack, remaining, total, decide, startFresh, resetToSetup, flushPendingSave, togglePlayPause, seek, skipBackward, skipForward]
  );

  return <SiftContext.Provider value={value}>{children}</SiftContext.Provider>;
}

export function useSift(): SiftContextValue {
  const ctx = useContext(SiftContext);
  if (!ctx) throw new Error('useSift must be used within a SiftProvider');
  return ctx;
}
