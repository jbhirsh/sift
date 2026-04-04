import { useEffect, useRef, useCallback } from 'react';
import { useSift } from '../context/SiftContext';
import { createMusicProvider, MusicProviderService } from '../services';

const POLL_INTERVAL_MS = 500;
const SKIP_SECONDS = 15;

/**
 * Hook that manages the active music provider and playback polling.
 *
 * Creates/recreates the provider when `state.provider` changes, polls
 * playback position while playing, and exposes convenience methods that
 * dispatch the appropriate actions to SiftContext.
 */
export function useMusicProvider() {
  const { state, dispatch } = useSift();
  const providerRef = useRef<MusicProviderService>(createMusicProvider(state.provider));
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Recreate provider when the provider type changes
  useEffect(() => {
    providerRef.current = createMusicProvider(state.provider);
  }, [state.provider]);

  // ── Playback position polling ─────────────────────────

  const startPolling = useCallback(() => {
    if (pollingRef.current) return; // already polling
    pollingRef.current = setInterval(() => {
      const { position } = providerRef.current.getPlaybackState();
      dispatch({ type: 'SET_PLAYBACK_POSITION', position });
    }, POLL_INTERVAL_MS);
  }, [dispatch]);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  // Start/stop polling based on isPlaying state
  useEffect(() => {
    if (state.isPlaying) {
      startPolling();
    } else {
      stopPolling();
    }
    return stopPolling;
  }, [state.isPlaying, startPolling, stopPolling]);

  // Clean up on unmount
  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  // ── Provider methods ──────────────────────────────────

  const authorize = useCallback(async (): Promise<boolean> => {
    dispatch({ type: 'SET_CONNECTION_STATUS', status: 'checking' });
    try {
      const granted = await providerRef.current.requestAuthorization();
      dispatch({
        type: 'SET_CONNECTION_STATUS',
        status: granted ? 'connected' : 'disconnected',
      });
      return granted;
    } catch {
      dispatch({ type: 'SET_CONNECTION_STATUS', status: 'disconnected' });
      return false;
    }
  }, [dispatch]);

  const loadLibrary = useCallback(async () => {
    dispatch({ type: 'SET_LOAD_PROGRESS', progress: 0, message: 'Loading library\u2026' });
    dispatch({ type: 'SET_PHASE', phase: 'loading' });

    try {
      dispatch({ type: 'SET_LOAD_PROGRESS', progress: 0.3, message: 'Fetching tracks\u2026' });
      const tracks = await providerRef.current.loadLibrary();
      dispatch({ type: 'SET_LOAD_PROGRESS', progress: 0.9, message: 'Sorting tracks\u2026' });
      dispatch({ type: 'LOAD_TRACKS', tracks });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load library';
      dispatch({ type: 'SET_LOAD_ERROR', error: message });
    }
  }, [dispatch]);

  const play = useCallback(
    async (trackID: string, position?: number) => {
      try {
        await providerRef.current.play(trackID, position);
        dispatch({ type: 'SET_IS_PLAYING', isPlaying: true });
        dispatch({ type: 'SET_PLAYBACK_POSITION', position: position ?? 0 });
      } catch {
        // Playback failure is non-fatal; UI stays in current state
      }
    },
    [dispatch]
  );

  const pause = useCallback(async () => {
    try {
      await providerRef.current.pause();
      dispatch({ type: 'SET_IS_PLAYING', isPlaying: false });
    } catch {
      // Non-fatal
    }
  }, [dispatch]);

  const resume = useCallback(async () => {
    try {
      await providerRef.current.resume();
      dispatch({ type: 'SET_IS_PLAYING', isPlaying: true });
    } catch {
      // Non-fatal
    }
  }, [dispatch]);

  const seek = useCallback(
    (position: number) => {
      providerRef.current.seek(position);
      dispatch({ type: 'SET_PLAYBACK_POSITION', position });
    },
    [dispatch]
  );

  const togglePlayPause = useCallback(async () => {
    if (state.isPlaying) {
      await pause();
    } else {
      await resume();
    }
  }, [state.isPlaying, pause, resume]);

  const skipForward = useCallback(() => {
    const currentTrack = state.tracks[state.cursor];
    if (!currentTrack) return;
    const { position } = providerRef.current.getPlaybackState();
    const newPos = Math.min(currentTrack.duration, position + SKIP_SECONDS);
    providerRef.current.seek(newPos);
    dispatch({ type: 'SET_PLAYBACK_POSITION', position: newPos });
  }, [state.tracks, state.cursor, dispatch]);

  const skipBackward = useCallback(() => {
    const { position } = providerRef.current.getPlaybackState();
    const newPos = Math.max(0, position - SKIP_SECONDS);
    providerRef.current.seek(newPos);
    dispatch({ type: 'SET_PLAYBACK_POSITION', position: newPos });
  }, [dispatch]);

  const createPlaylist = useCallback(
    async (name: string, trackIDs: string[]) => {
      dispatch({ type: 'SET_CREATING_PLAYLIST', creating: true });
      dispatch({ type: 'SET_PLAYLIST_ERROR', error: null });
      try {
        await providerRef.current.createPlaylist(name, trackIDs);
        dispatch({ type: 'SET_PLAYLIST_CREATED', created: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create playlist';
        dispatch({ type: 'SET_PLAYLIST_ERROR', error: message });
      } finally {
        dispatch({ type: 'SET_CREATING_PLAYLIST', creating: false });
      }
    },
    [dispatch]
  );

  return {
    authorize,
    loadLibrary,
    play,
    pause,
    resume,
    seek,
    togglePlayPause,
    skipForward,
    skipBackward,
    createPlaylist,
  };
}
