import { useEffect, useRef, useCallback } from 'react';
import { Alert, Linking } from 'react-native';
import * as Sentry from '@sentry/react-native';
import { useSift } from '../context/SiftContext';
import { createMusicProvider, MusicProviderService } from '../services';
import { logRemoval, loadHistory } from '../services/RemovalHistoryStore';
import { useProviderAuthorization } from './useProviderAuthorization';
import { sortTracks } from '../utils/sorting';
import { Playlist, Track } from '../types';

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

  // Authorization is delegated to a dedicated poll-free hook so the same logic
  // can be reused by screens (e.g. Settings) that must not spin up a second
  // playback poller.
  const authorize = useProviderAuthorization();

  const loadLibrary = useCallback(async () => {
    dispatch({ type: 'SET_LOAD_PROGRESS', progress: 0, message: 'Loading library\u2026' });
    dispatch({ type: 'SET_PHASE', phase: 'loading' });

    try {
      // Check authorization before loading
      const isAuth = await providerRef.current.isAuthorized();
      if (!isAuth) {
        const granted = await providerRef.current.requestAuthorization();
        if (!granted) {
          dispatch({ type: 'SET_LOAD_ERROR', error: 'Music library access is required to use Sift.' });
          Alert.alert(
            'Music Access Required',
            'Sift needs access to your music library. Please enable it in Settings.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open Settings', onPress: () => Linking.openSettings() },
            ],
          );
          return;
        }
      }

      dispatch({ type: 'SET_LOAD_PROGRESS', progress: 0.3, message: 'Fetching tracks\u2026' });
      const tracks = await providerRef.current.loadLibrary();
      Sentry.addBreadcrumb({
        category: 'music-provider',
        message: `Loaded ${tracks.length} tracks from library`,
        level: 'info',
      });
      dispatch({ type: 'SET_LOAD_PROGRESS', progress: 0.9, message: 'Sorting tracks\u2026' });
      dispatch({ type: 'LOAD_TRACKS', tracks: sortTracks(tracks, state.sortOrder) });
    } catch (err) {
      Sentry.captureException(err, { tags: { flow: 'load-library' } });
      const message = err instanceof Error ? err.message : 'Failed to load library';
      dispatch({ type: 'SET_LOAD_ERROR', error: message });
    }
  }, [dispatch, state.sortOrder]);

  const play = useCallback(
    async (trackID: string, position?: number) => {
      try {
        await providerRef.current.play(trackID, position);
        dispatch({ type: 'SET_IS_PLAYING', isPlaying: true });
        dispatch({ type: 'SET_PLAYBACK_POSITION', position: position ?? 0 });
      } catch (err) {
        Sentry.addBreadcrumb({ category: 'playback', message: `Play failed: ${err}`, level: 'warning' });
      }
    },
    [dispatch]
  );

  const pause = useCallback(async () => {
    try {
      await providerRef.current.pause();
      dispatch({ type: 'SET_IS_PLAYING', isPlaying: false });
    } catch (err) {
      Sentry.addBreadcrumb({ category: 'playback', message: `Pause failed: ${err}`, level: 'warning' });
    }
  }, [dispatch]);

  const resume = useCallback(async () => {
    try {
      await providerRef.current.resume();
      dispatch({ type: 'SET_IS_PLAYING', isPlaying: true });
    } catch (err) {
      Sentry.addBreadcrumb({ category: 'playback', message: `Resume failed: ${err}`, level: 'warning' });
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

  const loadPlaylists = useCallback(async (): Promise<Playlist[]> => {
    try {
      const isAuth = await providerRef.current.isAuthorized();
      if (!isAuth) {
        const granted = await providerRef.current.requestAuthorization();
        if (!granted) return [];
      }
      const playlists = await providerRef.current.loadPlaylists?.();
      return playlists ?? [];
    } catch (err) {
      Sentry.captureException(err, { tags: { flow: 'load-playlists' } });
      return [];
    }
  }, []);

  const loadTracks = useCallback(async () => {
    const source = state.source;
    const label = source.type === 'playlist' ? `"${source.playlist.name}"` : 'library';

    dispatch({ type: 'SET_LOAD_PROGRESS', progress: 0, message: `Loading ${label}…` });
    dispatch({ type: 'SET_PHASE', phase: 'loading' });

    try {
      const isAuth = await providerRef.current.isAuthorized();
      if (!isAuth) {
        const granted = await providerRef.current.requestAuthorization();
        if (!granted) {
          dispatch({ type: 'SET_LOAD_ERROR', error: 'Music library access is required to use Sift.' });
          Alert.alert(
            'Music Access Required',
            'Sift needs access to your music library. Please enable it in Settings.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open Settings', onPress: () => Linking.openSettings() },
            ],
          );
          return;
        }
      }

      dispatch({ type: 'SET_LOAD_PROGRESS', progress: 0.3, message: 'Fetching tracks…' });

      let tracks: Track[];
      if (source.type === 'playlist') {
        const result = await providerRef.current.loadPlaylistTracks?.(source.playlist.id);
        if (!result) throw new Error('This provider does not support playlist loading');
        tracks = result;

        // Exclude tracks already in the sifted playlist
        const siftedName = `${source.playlist.name} - Sifted`;
        const playlists = await providerRef.current.loadPlaylists?.() ?? [];
        const sifted = playlists.find((p) => p.name === siftedName);
        if (sifted) {
          const siftedTracks = await providerRef.current.loadPlaylistTracks?.(sifted.id) ?? [];
          const siftedIds = new Set(siftedTracks.map((t) => t.id));
          tracks = tracks.filter((t) => !siftedIds.has(t.id));
        }

        // Exclude tracks previously removed from this playlist
        const history = await loadHistory();
        const removedIds = new Set(
          history
            .filter((r) => r.source.type === 'playlist' && r.source.playlist.id === source.playlist.id)
            .map((r) => r.track.id),
        );
        tracks = tracks.filter((t) => !removedIds.has(t.id));
      } else {
        tracks = await providerRef.current.loadLibrary();
      }

      Sentry.addBreadcrumb({
        category: 'music-provider',
        message: `Loaded ${tracks.length} tracks from ${label}`,
        level: 'info',
      });
      dispatch({ type: 'SET_LOAD_PROGRESS', progress: 0.9, message: 'Sorting tracks…' });
      dispatch({ type: 'LOAD_TRACKS', tracks: sortTracks(tracks, state.sortOrder) });
    } catch (err) {
      Sentry.captureException(err, { tags: { flow: 'load-tracks' } });
      const errorMessage = err instanceof Error ? err.message : 'Failed to load tracks';
      dispatch({ type: 'SET_LOAD_ERROR', error: errorMessage });
    }
  }, [dispatch, state.source, state.sortOrder]);

  const removeTrack = useCallback(
    async (track: Track) => {
      const source = state.source;
      // Always log removal — the user's intent is what matters
      await logRemoval({
        track,
        source,
        provider: state.provider,
        removedAt: new Date().toISOString(),
      });
      try {
        if (source.type === 'playlist') {
          await providerRef.current.removeFromPlaylist?.(source.playlist.id, [track.id]);
        } else {
          await providerRef.current.removeFromLibrary?.([track.id]);
        }
      } catch (err) {
        Sentry.captureException(err, { tags: { flow: 'remove-track' } });
        dispatch({ type: 'ADD_REMOVAL_ERROR', error: track.name });
      }
    },
    [dispatch, state.source, state.provider],
  );

  const restoreTrack = useCallback(
    async (track: Track) => {
      try {
        const source = state.source;
        if (source.type === 'playlist') {
          await providerRef.current.addToPlaylist?.(source.playlist.id, [track.id]);
        } else {
          await providerRef.current.addToLibrary?.([track.id]);
        }
        dispatch({ type: 'RESTORE_TRACK', trackId: track.id });
      } catch (err) {
        Sentry.captureException(err, { tags: { flow: 'restore-track' } });
        const message = err instanceof Error ? err.message : 'Failed to restore track';
        dispatch({ type: 'ADD_REMOVAL_ERROR', error: `${track.name}: ${message}` });
      }
    },
    [dispatch, state.source],
  );

  const createPlaylist = useCallback(
    async (name: string, trackIDs: string[]) => {
      dispatch({ type: 'SET_CREATING_PLAYLIST', creating: true });
      dispatch({ type: 'SET_PLAYLIST_ERROR', error: null });
      try {
        await providerRef.current.createPlaylist(name, trackIDs);
        dispatch({ type: 'SET_PLAYLIST_CREATED', created: true });
      } catch (err) {
        Sentry.captureException(err, { tags: { flow: 'create-playlist' } });
        const message = err instanceof Error ? err.message : 'Failed to create playlist';
        dispatch({ type: 'SET_PLAYLIST_ERROR', error: message });
      } finally {
        dispatch({ type: 'SET_CREATING_PLAYLIST', creating: false });
      }
    },
    [dispatch]
  );

  const saveSiftedPlaylist = useCallback(
    async (playlistName: string, keptTracks: Track[]) => {
      if (keptTracks.length === 0) return;
      const siftedName = `${playlistName} - Sifted`;

      dispatch({ type: 'SET_CREATING_PLAYLIST', creating: true });
      dispatch({ type: 'SET_PLAYLIST_ERROR', error: null });
      try {
        const playlists = await providerRef.current.loadPlaylists?.() ?? [];
        const existing = playlists.find((p) => p.name === siftedName);

        if (existing) {
          const existingTracks = await providerRef.current.loadPlaylistTracks?.(existing.id) ?? [];
          const existingIds = new Set(existingTracks.map((t) => t.id));
          const newTrackIDs = keptTracks
            .filter((t) => !existingIds.has(t.id))
            .map((t) => t.id);
          if (newTrackIDs.length > 0) {
            await providerRef.current.addToPlaylist?.(existing.id, newTrackIDs);
          }
        } else {
          await providerRef.current.createPlaylist(siftedName, keptTracks.map((t) => t.id));
        }

        dispatch({ type: 'SET_PLAYLIST_CREATED', created: true });
      } catch (err) {
        Sentry.captureException(err, { tags: { flow: 'save-sifted-playlist' } });
        const message = err instanceof Error ? err.message : 'Failed to save sifted playlist';
        dispatch({ type: 'SET_PLAYLIST_ERROR', error: message });
      } finally {
        dispatch({ type: 'SET_CREATING_PLAYLIST', creating: false });
      }
    },
    [dispatch],
  );

  return {
    authorize,
    loadLibrary,
    loadPlaylists,
    loadTracks,
    play,
    pause,
    resume,
    seek,
    togglePlayPause,
    skipForward,
    skipBackward,
    createPlaylist,
    saveSiftedPlaylist,
    removeTrack,
    restoreTrack,
  };
}
