import React, { createContext, useContext, useReducer, useMemo, useCallback, useEffect, ReactNode } from 'react';
import * as Sentry from '@sentry/react-native';
import {
  Track,
  Decision,
  AppPhase,
  SortOrder,
  MusicProvider,
  ConnectionStatus,
  SiftSession,
} from '../types';
import { saveSession, loadSession, clearSession, hasSession } from '../services/SessionStore';

// ── State ──────────────────────────────────────────────

export interface SiftState {
  phase: AppPhase;
  provider: MusicProvider;
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
  hasSavedSession: boolean;
  removalPlaylistCreated: boolean;
  removalPlaylistError: string | null;
  isCreatingPlaylist: boolean;
  connectionStatus: ConnectionStatus;
}

const initialState: SiftState = {
  phase: 'setup',
  provider: 'apple-music',
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
  hasSavedSession: false,
  removalPlaylistCreated: false,
  removalPlaylistError: null,
  isCreatingPlaylist: false,
  connectionStatus: 'unknown',
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
  | { type: 'SET_HAS_SAVED_SESSION'; has: boolean }
  | { type: 'RESUME_SESSION'; session: Omit<SiftState, 'phase'> & { phase?: AppPhase } }
  | { type: 'START_FRESH' };

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

    case 'SET_SORT_ORDER':
      return { ...state, sortOrder: action.sortOrder };

    case 'LOAD_TRACKS':
      return {
        ...state,
        tracks: action.tracks,
        cursor: 0,
        kept: [],
        removed: [],
        skipped: [],
        phase: 'sifting',
        loadProgress: 1,
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

    case 'SET_HAS_SAVED_SESSION':
      return { ...state, hasSavedSession: action.has };

    case 'RESUME_SESSION':
      return {
        ...state,
        ...action.session,
        phase: action.session.phase ?? 'sifting',
      };

    case 'START_FRESH':
      return {
        ...state,
        tracks: [],
        cursor: 0,
        kept: [],
        removed: [],
        skipped: [],
        loadProgress: 0,
        loadError: null,
        loadMessage: 'Loading library…',
        removalPlaylistCreated: false,
        removalPlaylistError: null,
        phase: 'loading',
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
  stopSession: () => void;
  resumeFromPause: () => void;
  startFresh: () => void;
  resumeSession: () => void;
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

  // Check for saved session on mount
  useEffect(() => {
    hasSession().then((exists) => {
      dispatch({ type: 'SET_HAS_SAVED_SESSION', has: exists });
    });
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

  // Auto-save session after every decision (when sifting state changes)
  useEffect(() => {
    if (state.phase !== 'sifting' && state.phase !== 'paused' && state.phase !== 'done') return;
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
    };
    saveSession(session);
  }, [state.cursor, state.kept, state.removed, state.skipped, state.tracks, state.phase, state.sortOrder, state.provider]);

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

  const stopSession = useCallback(() => {
    Sentry.addBreadcrumb({ category: 'user-action', message: 'Session stopped', level: 'info' });
    const session: SiftSession = {
      tracks: state.tracks,
      cursor: state.cursor,
      kept: state.kept,
      removed: state.removed,
      skipped: state.skipped,
      sortOrder: state.sortOrder,
      savedAt: new Date().toISOString(),
      provider: state.provider,
    };
    saveSession(session);
    dispatch({ type: 'SET_IS_PLAYING', isPlaying: false });
    dispatch({ type: 'SET_PHASE', phase: 'paused' });
  }, [dispatch, state.tracks, state.cursor, state.kept, state.removed, state.skipped, state.sortOrder, state.provider]);

  const resumeFromPause = useCallback(() => {
    Sentry.addBreadcrumb({ category: 'user-action', message: 'Session resumed from pause', level: 'info' });
    dispatch({ type: 'SET_PHASE', phase: 'sifting' });
  }, [dispatch]);

  const startFresh = useCallback(() => {
    Sentry.addBreadcrumb({ category: 'user-action', message: 'Started fresh session', level: 'info' });
    clearSession().then(() => {
      dispatch({ type: 'SET_HAS_SAVED_SESSION', has: false });
      dispatch({ type: 'START_FRESH' });
    });
  }, [dispatch]);

  const resumeSession = useCallback(() => {
    Sentry.addBreadcrumb({ category: 'user-action', message: 'Resumed saved session', level: 'info' });
    loadSession().then((session) => {
      if (session) {
        dispatch({
          type: 'RESUME_SESSION',
          session: {
            tracks: session.tracks,
            cursor: session.cursor,
            kept: session.kept,
            removed: session.removed,
            skipped: session.skipped,
            sortOrder: session.sortOrder,
            provider: session.provider ?? state.provider,
            phase: 'sifting',
            loadProgress: 1,
            loadMessage: '',
            loadError: null,
            playbackPosition: 0,
            isPlaying: false,
            hasSavedSession: true,
            removalPlaylistCreated: false,
            removalPlaylistError: null,
            isCreatingPlaylist: false,
            connectionStatus: state.connectionStatus,
          },
        });
      }
    });
  }, [dispatch, state.provider, state.connectionStatus]);

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
      stopSession,
      resumeFromPause,
      startFresh,
      resumeSession,
      togglePlayPause,
      seek,
      skipBackward,
      skipForward,
    }),
    [state, dispatch, currentTrack, nextTrack, nextNextTrack, remaining, total, decide, stopSession, resumeFromPause, startFresh, resumeSession, togglePlayPause, seek, skipBackward, skipForward]
  );

  return <SiftContext.Provider value={value}>{children}</SiftContext.Provider>;
}

export function useSift(): SiftContextValue {
  const ctx = useContext(SiftContext);
  if (!ctx) throw new Error('useSift must be used within a SiftProvider');
  return ctx;
}
