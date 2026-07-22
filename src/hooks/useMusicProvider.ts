import { useEffect, useRef, useCallback } from 'react';
import { Alert, Linking } from 'react-native';
import * as Sentry from '@sentry/react-native';
import { useSift } from '../context/SiftContext';
import { createMusicProvider, MusicProviderService } from '../services';
import { logRemoval, loadHistory, removeFromHistory } from '../services/RemovalHistoryStore';
import { sortTracks } from '../utils/sorting';
import { trackIdentity } from '../utils/trackIdentity';
import { Playlist, Track } from '../types';

const POLL_INTERVAL_MS = 500;
const SKIP_SECONDS = 15;
// Upper bound on how long clearSiftedPlaylist waits for in-flight keeps to
// settle. A native add that never settles would otherwise park the clear's
// `await keepQueue` forever and permanently brick Start Over.
const CLEAR_KEEP_QUEUE_TIMEOUT_MS = 15000;

// The keep queue is module-scoped rather than a per-hook ref: keeps are
// queued by the sifting screen's hook instance, but clearSiftedPlaylist is
// usually called from a different screen's instance (Setup/Done). Sharing
// the chain lets the clear await any in-flight keep before reading the
// playlist, instead of racing an add that would land after the "clear".
// Links in the chain never reject (keepTrack catches internally).
let keepQueue: Promise<void> = Promise.resolve();

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

  const siftedPlaylistIdRef = useRef<string | null>(null);
  const siftedPlaylistForRef = useRef<string | null>(null);
  // Once-per-session readback of the sifted playlist's contents (ids and
  // identities), consulted before keepTrack's direct add so re-keeping a
  // song that already landed can't double-add it. Kept current as adds
  // land; invalidated by clearSiftedPlaylist. A fresh sift (START_FRESH)
  // remounts the sifting screen, which discards this cache with the
  // instance.
  const siftedContentsRef = useRef<Set<string> | null>(null);
  const loadingInProgressRef = useRef(false);
  // Pending sifted-playlist retry delays, keyed by timer with the awaiting
  // promise's resolver as the value so unmount can settle the promise.
  const retryTimersRef = useRef<Map<ReturnType<typeof setTimeout>, () => void>>(new Map());
  const unmountedRef = useRef(false);

  // Cancel any in-flight sifted-playlist retry delays on unmount so no timers
  // outlive the component (also keeps Jest workers from leaking timers).
  // Each cleared timer's resolver is invoked — clearTimeout alone would strand
  // the `await new Promise(...)` in findSiftedPlaylistWithRetry forever,
  // leaving the keepTrack continuation hanging and its pending keep silently
  // lost. After resolving, unmountedRef makes the retry loop bail out with
  // null so the caller falls through to its ADD_PENDING_KEEP buffering.
  useEffect(() => {
    unmountedRef.current = false;
    const timers = retryTimersRef.current;
    return () => {
      unmountedRef.current = true;
      timers.forEach((resolve, timer) => {
        clearTimeout(timer);
        resolve();
      });
      timers.clear();
    };
  }, []);

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

  /** Whether the provider is already authorized (no prompt). */
  const isAuthorized = useCallback(async (): Promise<boolean> => {
    return providerRef.current.isAuthorized();
  }, []);

  /**
   * Prompt for authorization and mirror the result into connectionStatus.
   * Only call this when {@link isAuthorized} is false — it opens the provider's
   * consent flow (e.g. the Spotify browser).
   */
  const authorize = useCallback(async (): Promise<boolean> => {
    dispatch({ type: 'SET_CONNECTION_STATUS', status: 'checking' });
    try {
      const granted = await providerRef.current.requestAuthorization();
      dispatch({
        type: 'SET_CONNECTION_STATUS',
        status: granted ? 'connected' : 'disconnected',
      });
      return granted;
    } catch (err) {
      Sentry.captureException(err, { tags: { flow: 'authorize' } });
      dispatch({ type: 'SET_CONNECTION_STATUS', status: 'disconnected' });
      return false;
    }
  }, [dispatch]);

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

  const loadTracks = useCallback(async (options?: { skipFiltering?: boolean }) => {
    if (loadingInProgressRef.current) {
      Sentry.addBreadcrumb({
        category: 'music-provider',
        message: 'loadTracks skipped — already in progress',
        level: 'debug',
      });
      return;
    }
    loadingInProgressRef.current = true;

    const shouldFilter = !options?.skipFiltering;
    const source = state.source;
    const knownSiftedId = state.siftedPlaylistId;
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
      let unfilteredCount: number;
      // How many tracks each independent filter dropped — the zero-track
      // message below distinguishes "already sifted" from "previously
      // removed" instead of blaming the sifted filter for both.
      let filteredAsSifted = 0;
      let filteredAsRemoved = 0;
      if (source.type === 'playlist') {
        const result = await providerRef.current.loadPlaylistTracks?.(source.playlist.id);
        if (!result) throw new Error('This provider does not support playlist loading');
        tracks = result;
        unfilteredCount = tracks.length;

        if (shouldFilter) {
          // Exclude tracks already in the sifted playlist. Resolve it by id
          // first (rename-proof); the name match is only the legacy fallback
          // for sessions that predate siftedPlaylistId.
          const siftedName = `${source.playlist.name} - Sifted`;
          const playlists = await providerRef.current.loadPlaylists?.() ?? [];
          const sifted =
            (knownSiftedId != null ? playlists.find((p) => p.id === knownSiftedId) : undefined) ??
            playlists.find((p) => p.name === siftedName);
          if (sifted) {
            const siftedTracks = await providerRef.current.loadPlaylistTracks?.(sifted.id) ?? [];
            // Match by id OR identity: a non-library track kept under its
            // catalog id reads back from the sifted playlist under a fresh
            // library-instance id, and an id-only filter would re-offer it
            // on every re-sift.
            const siftedIds = new Set(siftedTracks.map((t) => t.id));
            const siftedIdentities = new Set(siftedTracks.map(trackIdentity));
            const beforeSiftedFilter = tracks.length;
            tracks = tracks.filter(
              (t) => !siftedIds.has(t.id) && !siftedIdentities.has(trackIdentity(t)),
            );
            filteredAsSifted = beforeSiftedFilter - tracks.length;
          }

          // Exclude tracks previously removed from this playlist
          const history = await loadHistory();
          const removedIds = new Set(
            history
              .filter((r) => r.source.type === 'playlist' && r.source.playlist.id === source.playlist.id)
              .map((r) => r.track.id),
          );
          const beforeRemovedFilter = tracks.length;
          tracks = tracks.filter((t) => !removedIds.has(t.id));
          filteredAsRemoved = beforeRemovedFilter - tracks.length;
        }
      } else {
        tracks = await providerRef.current.loadLibrary();
        unfilteredCount = tracks.length;
      }

      Sentry.addBreadcrumb({
        category: 'music-provider',
        message: `Loaded ${tracks.length} tracks from ${label}`,
        level: 'info',
      });

      // Never enter the sifting phase with zero tracks — there would be no
      // card and no way out. Distinguish "everything was filtered out" from
      // "the source is genuinely empty" — and, within the filtered case,
      // which filter actually emptied it: blaming the sifted filter for
      // tracks that were removed (not kept) would be a false claim.
      if (tracks.length === 0) {
        const error =
          source.type === 'playlist' && shouldFilter && unfilteredCount > 0
            ? filteredAsRemoved === 0
              ? 'All tracks in this playlist have already been sifted.'
              : filteredAsSifted === 0
                ? 'All tracks in this playlist were removed in a previous sift.'
                : 'All tracks in this playlist have already been sifted or removed.'
            : source.type === 'playlist'
              ? 'This playlist has no tracks to sift.'
              : 'Your library has no tracks to sift.';
        dispatch({ type: 'SET_LOAD_ERROR', error });
        return;
      }

      dispatch({ type: 'SET_LOAD_PROGRESS', progress: 0.9, message: 'Sorting tracks…' });
      dispatch({ type: 'LOAD_TRACKS', tracks: sortTracks(tracks, state.sortOrder) });
    } catch (err) {
      Sentry.captureException(err, { tags: { flow: 'load-tracks' } });
      const errorMessage = err instanceof Error ? err.message : 'Failed to load tracks';
      dispatch({ type: 'SET_LOAD_ERROR', error: errorMessage });
    } finally {
      loadingInProgressRef.current = false;
    }
  }, [dispatch, state.source, state.sortOrder, state.siftedPlaylistId]);

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
        // Purge the removal-history record so the restored track is offered
        // again on the next sift of this source instead of being filtered out.
        await removeFromHistory(track.id, source);
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
      const knownSiftedId = state.siftedPlaylistId;

      dispatch({ type: 'SET_CREATING_PLAYLIST', creating: true });
      dispatch({ type: 'SET_PLAYLIST_ERROR', error: null });
      try {
        const playlists = await providerRef.current.loadPlaylists?.() ?? [];
        // Resolve by id first (rename-proof); the name match is only the
        // legacy fallback for sessions that predate siftedPlaylistId.
        const existing =
          (knownSiftedId != null ? playlists.find((p) => p.id === knownSiftedId) : undefined) ??
          playlists.find((p) => p.name === siftedName);

        if (existing) {
          const existingTracks = await providerRef.current.loadPlaylistTracks?.(existing.id) ?? [];
          const existingIds = new Set(existingTracks.map((t) => t.id));
          // Apple Music re-identifies a track when it lands in a playlist
          // (catalog id at keep-time vs library-instance id on readback), so
          // an id-only diff re-adds exactly those tracks. Fall back to the
          // shared name/artist/duration identity so an already-present track
          // is never added twice under a second id.
          const existingIdentities = new Set(existingTracks.map(trackIdentity));
          const newTrackIDs = keptTracks
            .filter((t) => !existingIds.has(t.id) && !existingIdentities.has(trackIdentity(t)))
            .map((t) => t.id);
          if (newTrackIDs.length > 0) {
            // A provider without addToPlaylist cannot land these tracks.
            // Optional-chaining past the gap would report success and clear
            // pendingKeeps for keeps that never happened — throw into the
            // normal failure path so the snapshot stays buffered for retry.
            if (!providerRef.current.addToPlaylist) {
              throw new Error('This provider does not support adding to playlists');
            }
            await providerRef.current.addToPlaylist(existing.id, newTrackIDs);
          }
        } else {
          await providerRef.current.createPlaylist(siftedName, keptTracks.map((t) => t.id));
        }

        dispatch({ type: 'SET_PLAYLIST_CREATED', created: true });
        // Exactly the snapshot this save persisted is now covered — remove
        // only those tracks from the buffer. A keep that got buffered while
        // this save was in flight was NOT part of the snapshot; it must
        // survive this cleanup so the Done fallback fires again for it.
        dispatch({ type: 'REMOVE_PENDING_KEEPS', trackIds: keptTracks.map((t) => t.id) });
      } catch (err) {
        Sentry.captureException(err, { tags: { flow: 'save-sifted-playlist' } });
        // Partial-success repair: the provider throws on ANY shortfall, but
        // by then most tracks may have landed (native adds are per-item).
        // Treating the error as "nothing was saved" would strand every kept
        // track in pendingKeeps and retry them all forever. Read the
        // playlist back and drop exactly the tracks that actually landed,
        // so the retry path only re-attempts genuine failures.
        try {
          const playlistsAfter = await providerRef.current.loadPlaylists?.() ?? [];
          const target =
            (knownSiftedId != null
              ? playlistsAfter.find((p) => p.id === knownSiftedId)
              : undefined) ??
            playlistsAfter.find((p) => p.name === siftedName);
          if (target) {
            const nowPresent = await providerRef.current.loadPlaylistTracks?.(target.id) ?? [];
            const presentIds = new Set(nowPresent.map((t) => t.id));
            const presentIdentities = new Set(nowPresent.map(trackIdentity));
            const landed = keptTracks
              .filter((t) => presentIds.has(t.id) || presentIdentities.has(trackIdentity(t)))
              .map((t) => t.id);
            if (landed.length > 0) {
              dispatch({ type: 'REMOVE_PENDING_KEEPS', trackIds: landed });
            }
          }
        } catch (readbackErr) {
          // Best-effort: with no readback the whole snapshot stays buffered
          // and the retry path still covers everything.
          Sentry.addBreadcrumb({
            category: 'music-provider',
            message: `saveSiftedPlaylist: partial-success readback failed: ${readbackErr}`,
            level: 'warning',
          });
        }
        const message = err instanceof Error ? err.message : 'Failed to save sifted playlist';
        dispatch({ type: 'SET_PLAYLIST_ERROR', error: message });
      } finally {
        dispatch({ type: 'SET_CREATING_PLAYLIST', creating: false });
      }
    },
    [dispatch, state.siftedPlaylistId],
  );

  const findSiftedPlaylistWithRetry = useCallback(
    async (name: string): Promise<string | null> => {
      const delays = [0, 250, 750];
      for (const delay of delays) {
        // Bail out promptly once the component is gone: returning null lets
        // the caller buffer the keep via ADD_PENDING_KEEP instead of hanging.
        if (unmountedRef.current) return null;
        if (delay > 0) {
          await new Promise<void>((resolve) => {
            const timer = setTimeout(() => {
              retryTimersRef.current.delete(timer);
              resolve();
            }, delay);
            retryTimersRef.current.set(timer, resolve);
          });
          if (unmountedRef.current) return null;
        }
        const refreshed = await providerRef.current.loadPlaylists?.() ?? [];
        const found = refreshed.find((p) => p.name === name);
        if (found) return found.id;
      }
      return null;
    },
    [],
  );

  const keepTrack = useCallback(
    (track: Track): Promise<void> => {
      if (state.source.type !== 'playlist') return Promise.resolve();
      const playlistName = state.source.playlist.name;
      const siftedName = `${playlistName} - Sifted`;
      const knownSiftedId = state.siftedPlaylistId;

      const next = keepQueue.then(async () => {
        try {
          if (siftedPlaylistIdRef.current == null) {
            if (knownSiftedId != null) {
              // Already resolved earlier in this session (or restored from a
              // saved one) — reuse the id instead of re-deriving it by name.
              siftedPlaylistIdRef.current = knownSiftedId;
              siftedPlaylistForRef.current = siftedName;
            } else if (siftedPlaylistForRef.current !== siftedName) {
              const playlists = await providerRef.current.loadPlaylists?.() ?? [];
              const existing = playlists.find((p) => p.name === siftedName);
              if (existing) {
                siftedPlaylistIdRef.current = existing.id;
                siftedPlaylistForRef.current = siftedName;
                dispatch({ type: 'SET_SIFTED_PLAYLIST_ID', id: existing.id });
              } else {
                await providerRef.current.createPlaylist(siftedName, [track.id]);
                siftedPlaylistForRef.current = siftedName;
                // The playlist was just created with exactly this track —
                // seed the contents cache so a later re-keep of it is a
                // no-op instead of a readback plus a duplicate add.
                siftedContentsRef.current = new Set([track.id, trackIdentity(track)]);
                siftedPlaylistIdRef.current = await findSiftedPlaylistWithRetry(siftedName);
                if (siftedPlaylistIdRef.current != null) {
                  dispatch({ type: 'SET_SIFTED_PLAYLIST_ID', id: siftedPlaylistIdRef.current });
                }
                return;
              }
            } else {
              siftedPlaylistIdRef.current = await findSiftedPlaylistWithRetry(siftedName);
              if (siftedPlaylistIdRef.current != null) {
                dispatch({ type: 'SET_SIFTED_PLAYLIST_ID', id: siftedPlaylistIdRef.current });
              }
            }
          }

          if (siftedPlaylistIdRef.current) {
            // Duplicate guard: consult a once-per-session readback of the
            // sifted playlist before the direct add. Re-keeping a song that
            // is already present — under the same id, or under the fresh
            // library-instance id Apple Music assigns on landing — must not
            // add it a second time.
            if (siftedContentsRef.current == null) {
              const existingTracks =
                await providerRef.current.loadPlaylistTracks?.(siftedPlaylistIdRef.current) ?? [];
              siftedContentsRef.current = new Set(
                existingTracks.flatMap((t) => [t.id, trackIdentity(t)]),
              );
            }
            const contents = siftedContentsRef.current;
            if (!contents.has(track.id) && !contents.has(trackIdentity(track))) {
              // Without addToPlaylist the keep cannot land — recording it in
              // the contents cache anyway would silently drop the track.
              // Throw into the normal failure path so it gets buffered and
              // retried by the Done screen's saveSiftedPlaylist flush.
              if (!providerRef.current.addToPlaylist) {
                throw new Error('This provider does not support adding to playlists');
              }
              await providerRef.current.addToPlaylist(siftedPlaylistIdRef.current, [track.id]);
              contents.add(track.id);
              contents.add(trackIdentity(track));
            }
          } else {
            // The sifted playlist could not be resolved within the retry
            // window. Buffer the track instead of silently dropping it — the
            // Done screen flushes pending keeps via saveSiftedPlaylist.
            dispatch({ type: 'ADD_PENDING_KEEP', track });
          }
        } catch (err) {
          Sentry.captureException(err, { tags: { flow: 'keep-track' } });
          // The add failed outright — buffer it so it is retried at Done.
          dispatch({ type: 'ADD_PENDING_KEEP', track });
        }
      });

      keepQueue = next;
      return next;
    },
    [state.source, state.siftedPlaylistId, findSiftedPlaylistWithRetry, dispatch],
  );

  const warmCache = useCallback(async (trackIDs: string[]): Promise<void> => {
    try {
      const isAuth = await providerRef.current.isAuthorized();
      if (!isAuth) {
        const granted = await providerRef.current.requestAuthorization();
        if (!granted) return;
      }
      const resolved = await providerRef.current.warmSongCache?.(trackIDs);
      // Observability: the native warm-up tolerates per-id failures, so a
      // shortfall here is otherwise invisible — those tracks degrade to no
      // playback/artwork until re-resolved. Breadcrumb only; not an error.
      if (resolved != null && resolved < trackIDs.length) {
        Sentry.addBreadcrumb({
          category: 'music-provider',
          message: `warmCache: ${trackIDs.length - resolved} of ${trackIDs.length} ids unresolved`,
          level: 'warning',
        });
      }
    } catch (err) {
      Sentry.captureException(err, { tags: { flow: 'warm-cache' } });
    }
  }, []);

  /**
   * Empty the "<name> - Sifted" playlist. Returns false when the clear could
   * not be completed (e.g. a network failure) so callers can stop before
   * wiping local state that would be needed to reconcile later.
   */
  const clearSiftedPlaylist = useCallback(
    async (playlistName: string): Promise<boolean> => {
      const knownSiftedId = state.siftedPlaylistId;
      try {
        const siftedName = `${playlistName} - Sifted`;
        // Let queued/in-flight keeps settle first: reading the playlist while
        // an add is still mid-flight would miss that track, leaving it behind
        // after the "clear". The chain is module-scoped precisely so this
        // works across hook instances (keeps queue on the sifting screen,
        // clears run from Setup/Done). Bounded: a native promise that never
        // settles must not brick Start Over forever, so after a generous
        // timeout the clear proceeds anyway (worst case it misses a track
        // that lands later — recoverable by another Start Over).
        await new Promise<void>((resolve) => {
          const timer = setTimeout(() => {
            Sentry.addBreadcrumb({
              category: 'music-provider',
              message: `clearSiftedPlaylist: keep queue did not settle within ${CLEAR_KEEP_QUEUE_TIMEOUT_MS}ms — proceeding with the clear`,
              level: 'warning',
            });
            resolve();
          }, CLEAR_KEEP_QUEUE_TIMEOUT_MS);
          // Links in the keep chain never reject (keepTrack catches
          // internally), so a bare then is safe here.
          keepQueue.then(() => {
            clearTimeout(timer);
            resolve();
          });
        });
        siftedPlaylistIdRef.current = null;
        siftedPlaylistForRef.current = null;
        siftedContentsRef.current = null;
        const playlists = await providerRef.current.loadPlaylists?.() ?? [];
        // Resolve by id first (rename-proof); name match is the legacy
        // fallback for sessions that predate siftedPlaylistId.
        const sifted =
          (knownSiftedId != null ? playlists.find((p) => p.id === knownSiftedId) : undefined) ??
          playlists.find((p) => p.name === siftedName);
        if (sifted) {
          const tracks = await providerRef.current.loadPlaylistTracks?.(sifted.id) ?? [];
          if (tracks.length > 0) {
            // Tracks are present but a provider without removeFromPlaylist
            // cannot clear them. Returning true here would let callers wipe
            // the local state needed to reconcile the leftover playlist —
            // throw into the normal failure path so this reports false.
            if (!providerRef.current.removeFromPlaylist) {
              throw new Error('This provider does not support removing from playlists');
            }
            await providerRef.current.removeFromPlaylist(sifted.id, tracks.map((t) => t.id));
          }
        }
        return true;
      } catch (err) {
        Sentry.captureException(err, { tags: { flow: 'clear-sifted-playlist' } });
        return false;
      }
    },
    [state.siftedPlaylistId],
  );

  return {
    authorize,
    isAuthorized,
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
    keepTrack,
    removeTrack,
    restoreTrack,
    warmCache,
    clearSiftedPlaylist,
  };
}
