import { useEffect, useRef, useCallback } from 'react';
import { Alert, Linking } from 'react-native';
import * as Sentry from '@sentry/react-native';
import { useSift } from '../context/SiftContext';
import { useMusicProviderService } from '../context/MusicProviderContext';
import { logRemoval, loadHistory, removeFromHistory } from '../services/RemovalHistoryStore';
import { sortTracks } from '../utils/sorting';
import { TrackIndex } from '../utils/trackIdentity';
import { APPLE_REMOVED_PLAYLIST, libraryRemovedIds } from '../utils/libraryRemovals';
import { ledgerKey } from '../utils/reviewedLedger';
import { loadReviewedIds, markReviewed } from '../services/ReviewedLedgerStore';
import type { MusicProvider, Playlist, SiftSource, Track } from '../types';

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

// Failed removals are retried (#151) at most this many times per song per
// launch, so a song that can't be removed doesn't retry forever.
export const MAX_REMOVAL_RETRIES = 3;
// Launch-wide, like the keep queue: retries run from whichever screen's hook
// instance triggers them, and must not overlap or reset per screen.
const removalRetryAttempts = new Map<string, number>();
// The retry under way, if any. A Restore waits for it, so a retry's remove
// can't land after the song was restored.
let removalRetryInFlight: Promise<void> | null = null;
// Songs a Restore is undoing right now: a retry leaves them alone.
const restoringIds = new Set<string>();
// Removals under way, by song. A Restore of the song waits for its removal
// to finish first: the last card's Remove is still running when Done
// appears, and a Restore landing before it would be undone by it.
const removalsInFlight = new Map<string, Promise<void>>();

/** Forget the retry bookkeeping, as a fresh launch would. Exported for tests. */
export function resetRemovalRetries(): void {
  removalRetryAttempts.clear();
  removalRetryInFlight = null;
  restoringIds.clear();
  removalsInFlight.clear();
}

/**
 * The music provider's operations, wired to SiftContext. The provider itself
 * and the playback poller are shared, owned by MusicProviderHost (#144).
 */
export function useMusicProvider() {
  const { state, dispatch } = useSift();
  const providerRef = useMusicProviderService();

  const siftedPlaylistIdRef = useRef<string | null>(null);
  const siftedPlaylistForRef = useRef<string | null>(null);
  // Ids of the "Sift — Removed" playlists, looked up on the first Apple
  // library restore. Restores run on the Done screen, so this lives as long
  // as that screen's hook instance does.
  const removedPlaylistIdsRef = useRef<string[] | null>(null);
  // Once-per-session readback of the sifted playlist's contents (ids and
  // identities), consulted before keepTrack's direct add so re-keeping a
  // song that already landed can't double-add it. Kept current as adds
  // land; invalidated by clearSiftedPlaylist. A fresh sift (START_FRESH)
  // remounts the sifting screen, which discards this cache with the
  // instance.
  const siftedContentsRef = useRef<TrackIndex | null>(null);
  const loadingInProgressRef = useRef(false);
  // Pending sifted-playlist retry delays, keyed by timer with the awaiting
  // promise's resolver as the value so unmount can settle the promise.
  const retryTimersRef = useRef<Map<ReturnType<typeof setTimeout>, () => void>>(new Map());
  const unmountedRef = useRef(false);
  // What a removal retry needs, read when it runs rather than when it was
  // scheduled. The source is the one the removed songs came from.
  const removalStateRef = useRef({
    failedRemovalIds: state.failedRemovalIds,
    removed: state.removed,
    source: state.activeSource ?? state.source,
    provider: state.provider,
  });
  useEffect(() => {
    removalStateRef.current = {
      failedRemovalIds: state.failedRemovalIds,
      removed: state.removed,
      source: state.activeSource ?? state.source,
      provider: state.provider,
    };
  });

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

  // ── Provider methods ──────────────────────────────────

  /** Whether the provider is already authorized (no prompt). */
  const isAuthorized = useCallback(async (): Promise<boolean> => {
    return providerRef.current.isAuthorized();
  }, [providerRef]);

  /**
   * Prompt for authorization and mirror the result into connectionStatus.
   * Only call this when {@link isAuthorized} is false — it opens the provider's
   * consent flow (e.g. Apple Music's permission prompt).
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
  }, [providerRef, dispatch]);

  /**
   * Make sure Sift can reach the music library, asking if it hasn't yet.
   * When access is refused, say so and offer Settings: iOS asks only once,
   * so after that Settings is the only way to grant it.
   */
  const ensureAccess = useCallback(async (): Promise<boolean> => {
    if (await providerRef.current.isAuthorized()) return true;
    if (await providerRef.current.requestAuthorization()) return true;
    dispatch({ type: 'SET_CONNECTION_STATUS', status: 'disconnected' });
    Alert.alert(
      'Music Access Required',
      'Sift needs access to your music library. Please enable it in Settings.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Settings', onPress: () => Linking.openSettings() },
      ],
    );
    return false;
  }, [providerRef, dispatch]);

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
    [providerRef, dispatch]
  );

  const pause = useCallback(async () => {
    try {
      await providerRef.current.pause();
      dispatch({ type: 'SET_IS_PLAYING', isPlaying: false });
    } catch (err) {
      Sentry.addBreadcrumb({ category: 'playback', message: `Pause failed: ${err}`, level: 'warning' });
    }
  }, [providerRef, dispatch]);

  /** Pause and reset the position: the current track is being replaced. */
  const stop = useCallback(async () => {
    await pause();
    dispatch({ type: 'SET_PLAYBACK_POSITION', position: 0 });
  }, [pause, dispatch]);

  const resume = useCallback(async () => {
    try {
      await providerRef.current.resume();
      dispatch({ type: 'SET_IS_PLAYING', isPlaying: true });
    } catch (err) {
      Sentry.addBreadcrumb({ category: 'playback', message: `Resume failed: ${err}`, level: 'warning' });
    }
  }, [providerRef, dispatch]);

  const seek = useCallback(
    (position: number) => {
      providerRef.current.seek(position);
      dispatch({ type: 'SET_PLAYBACK_POSITION', position });
    },
    [providerRef, dispatch]
  );

  /** Where a track's preview sits in the full track (a chorus hint); null when unknown. */
  const previewOffset = useCallback(
    async (trackID: string): Promise<number | null> =>
      (await providerRef.current.previewOffset?.(trackID)) ?? null,
    [providerRef]
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
  }, [providerRef, state.tracks, state.cursor, dispatch]);

  const skipBackward = useCallback(() => {
    const { position } = providerRef.current.getPlaybackState();
    const newPos = Math.max(0, position - SKIP_SECONDS);
    providerRef.current.seek(newPos);
    dispatch({ type: 'SET_PLAYBACK_POSITION', position: newPos });
  }, [providerRef, dispatch]);

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
  }, [providerRef]);

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
      if (!(await ensureAccess())) {
        dispatch({ type: 'SET_LOAD_ERROR', error: 'Music library access is required to use Sift.' });
        return;
      }

      dispatch({ type: 'SET_LOAD_PROGRESS', progress: 0.3, message: 'Fetching tracks…' });

      let tracks: Track[];
      let unfilteredCount: number;
      // How many tracks each independent filter dropped — the zero-track
      // message below distinguishes "already sifted" from "previously
      // removed" instead of blaming the sifted filter for both.
      let filteredAsSifted = 0;
      let filteredAsRemoved = 0;
      let filteredAsReviewed = 0;
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
            const alreadySifted = new TrackIndex(siftedTracks);
            const beforeSiftedFilter = tracks.length;
            tracks = tracks.filter((t) => !alreadySifted.has(t));
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
        if (state.provider === 'apple-music') {
          // Skip songs removed in an earlier library sift (#139). On Apple
          // Music they never left the library (they sit in "Sift — Removed"),
          // so without this every library sift offered them again. Applies
          // with skipFiltering too: a library Start Over starts the decisions
          // over but un-removes nothing. A provider whose Remove really
          // deletes the song wouldn't need this: a song back in its library
          // was re-added on purpose.
          const removedIds = libraryRemovedIds(await loadHistory(), state.provider);
          const beforeRemovedFilter = tracks.length;
          tracks = tracks.filter((t) => !removedIds.has(t.id));
          filteredAsRemoved = beforeRemovedFilter - tracks.length;
        }
        if (shouldFilter) {
          // Leave out songs kept in earlier library sifts (#143), so a big
          // library gets through over many sittings. By id, like the removal
          // filter above. Skipped songs were never recorded, so they come
          // back. Setup's "Include songs I've already sifted" switch passes
          // skipFiltering to bring them all back.
          const reviewedIds = await loadReviewedIds(ledgerKey(state.provider, source));
          const beforeReviewedFilter = tracks.length;
          tracks = tracks.filter((t) => !reviewedIds.has(t.id));
          filteredAsReviewed = beforeReviewedFilter - tracks.length;
        }
      }

      Sentry.addBreadcrumb({
        category: 'music-provider',
        // Not the playlist's name (#147).
        message: `Loaded ${tracks.length} tracks from ${source.type === 'playlist' ? 'a playlist' : 'the library'}`,
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
              : filteredAsReviewed > 0
                ? 'You\u2019ve sifted every song in your library. Turn on \u201cInclude songs I\u2019ve already sifted\u201d to go through them again.'
                : filteredAsRemoved > 0
                  ? 'Every song in your library was removed in a previous sift.'
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
  }, [providerRef, dispatch, ensureAccess, state.source, state.sortOrder, state.siftedPlaylistId, state.provider]);

  /**
   * Retry the removals that failed (#151). Each is checked first: a removal
   * can fail after taking effect, and repeating a library Remove would put
   * the song in "Sift — Removed" twice. One that landed (now or before) is
   * cleared; one that fails again stays failed, up to MAX_REMOVAL_RETRIES.
   */
  const retryFailedRemovals = useCallback(async (): Promise<void> => {
    if (removalRetryInFlight) return;
    const { failedRemovalIds, removed, source, provider } = removalStateRef.current;
    const service = providerRef.current;
    const { removeFromPlaylist, removeFromLibrary } = service;
    // Nothing to retry with: a missing call must not count as a removal.
    let remove: ((id: string) => Promise<void>) | undefined;
    if (source.type === 'playlist') {
      if (removeFromPlaylist) remove = (id) => removeFromPlaylist.call(service, source.playlist.id, [id]);
    } else if (removeFromLibrary) {
      remove = (id) => removeFromLibrary.call(service, [id]);
    }
    if (!remove) return;
    const due = removed.filter((track) =>
      failedRemovalIds.includes(track.id) && (removalRetryAttempts.get(track.id) ?? 0) < MAX_REMOVAL_RETRIES);
    if (due.length === 0) return;
    // Still removed and still failed, read now: a Restore (or another
    // screen's retry) may have settled it since this retry started.
    const stillDue = (id: string) => !restoringIds.has(id)
      && removalStateRef.current.failedRemovalIds.includes(id)
      && removalStateRef.current.removed.some((t) => t.id === id);
    const run = async () => {
      for (const track of due) {
        if (!stillDue(track.id)) continue;
        const attempt = (removalRetryAttempts.get(track.id) ?? 0) + 1;
        removalRetryAttempts.set(track.id, attempt);
        try {
          const landed = (await service.removalLanded?.(source, track.id)) ?? false;
          if (!landed) await remove(track.id);
          // The failed Apple library removal dropped its history record;
          // now it has landed, record it again so later sifts leave it out.
          if (source.type === 'library' && provider === 'apple-music') {
            await logRemoval({ track, source, provider, removedAt: new Date().toISOString() });
          }
          dispatch({ type: 'CLEAR_REMOVAL_FAILURE', trackId: track.id, error: track.name });
        } catch (err) {
          Sentry.addBreadcrumb({
            category: 'music-provider',
            message: `retryFailedRemovals: ${track.id} still failing (attempt ${attempt} of ${MAX_REMOVAL_RETRIES}): ${err instanceof Error ? err.message : String(err)}`,
            level: 'warning',
          });
        }
      }
    };
    removalRetryInFlight = run();
    try {
      await removalRetryInFlight;
    } finally {
      removalRetryInFlight = null;
    }
  }, [providerRef, dispatch]);

  const removeNow = useCallback(
    // report: whether this removal belongs to the sift in state, whose
    // failures it shows and retries.
    async (track: Track, source: SiftSource, provider: MusicProvider, report: boolean) => {
      const appleLibrary = source.type === 'library' && provider === 'apple-music';
      // An Apple Music song removed in an earlier library sift is already
      // recorded and already in "Sift — Removed"; removing it again (if a
      // sift offers it anyway) would add a duplicate there (#139).
      if (appleLibrary && libraryRemovedIds(await loadHistory(), provider).has(track.id)) return;
      // Log the removal before attempting it — the user's intent is what
      // matters, and a playlist's failed removal stays filtered out.
      await logRemoval({
        track,
        source,
        provider,
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
        if (report) dispatch({ type: 'ADD_REMOVAL_ERROR', error: track.name, failedRemovalId: track.id });
        // A failed Apple library removal left the song in the library and
        // out of "Sift — Removed": drop its record so the next library sift
        // offers it again rather than hiding it for good.
        if (appleLibrary) await removeFromHistory(track.id, source);
        return;
      }
      // This one landed, so the connection works: retry any that failed.
      if (report) await retryFailedRemovals();
    },
    [providerRef, dispatch, retryFailedRemovals],
  );

  /**
   * Remove the song from the source being sifted, or from `from`: a saved
   * session's source and provider, for a session being discarded, whose
   * failure is reported to Sentry only.
   */
  const removeTrack = useCallback(
    (track: Track, from?: { source: SiftSource; provider: MusicProvider }): Promise<void> => {
      const run = from
        ? removeNow(track, from.source, from.provider, false)
        : removeNow(track, state.source, state.provider, true);
      const settled = run.finally(() => {
        if (removalsInFlight.get(track.id) === settled) removalsInFlight.delete(track.id);
      });
      removalsInFlight.set(track.id, settled);
      return settled;
    },
    [removeNow, state.source, state.provider],
  );

  const restoreTrack = useCallback(
    async (track: Track) => {
      // A retry of this song's failed removal (#151) must not land after
      // the restore: wait out one under way, and keep new ones off it.
      restoringIds.add(track.id);
      try {
        await removalRetryInFlight;
        await removalsInFlight.get(track.id);
        const source = state.source;
        // A playlist removal that failed may never have taken effect: then
        // the song is still in the playlist, and adding it back would make
        // a second copy, so restoring it is only forgetting the removal.
        // Asked rather than read from failedRemovalIds: one can fail after
        // taking effect, and a failure that just came in may not be in this
        // screen's state yet. (Taking a library song out of "Sift — Removed"
        // is harmless when it never went in.)
        const service = providerRef.current;
        const stillThere = source.type === 'playlist' && service.removalLanded != null
          && !(await service.removalLanded(source, track.id));
        if (source.type === 'playlist') {
          if (!stillThere) await service.addToPlaylist?.(source.playlist.id, [track.id]);
        } else if (state.provider === 'apple-music') {
          // An Apple Music library Remove never took the song out of the
          // library: it put it in "Sift — Removed". Restoring means taking it
          // back out of there (#139); addToLibrary did nothing for a song
          // that never left, yet reported success.
          // Every playlist by that name (the user, or a missed lookup in the
          // native remove, can make a second), found once per screen:
          // loadPlaylists reads every playlist's tracks. An empty result
          // isn't kept: a removal still landing can create the playlist.
          let removedIds = removedPlaylistIdsRef.current;
          if (removedIds == null) {
            const playlists = await providerRef.current.loadPlaylists?.() ?? [];
            removedIds = playlists
              .filter((p) => p.name === APPLE_REMOVED_PLAYLIST)
              .map((p) => p.id);
            removedPlaylistIdsRef.current = removedIds.length > 0 ? removedIds : null;
          }
          try {
            for (const id of removedIds) {
              await providerRef.current.removeFromPlaylist?.(id, [track.id]);
            }
          } catch (err) {
            // The playlist may have been deleted since: look again next time.
            removedPlaylistIdsRef.current = null;
            throw err;
          }
        } else {
          await providerRef.current.addToLibrary?.([track.id]);
        }
        // Purge the removal-history record so the restored track is offered
        // again on the next sift of this source instead of being filtered out.
        await removeFromHistory(track.id, source);
        // Nothing left to retry: the song is back where it was.
        dispatch({ type: 'CLEAR_REMOVAL_FAILURE', trackId: track.id, error: track.name });
        dispatch({ type: 'RESTORE_TRACK', trackId: track.id });
      } catch (err) {
        Sentry.captureException(err, { tags: { flow: 'restore-track' } });
        const message = err instanceof Error ? err.message : 'Failed to restore track';
        dispatch({ type: 'ADD_REMOVAL_ERROR', error: `${track.name}: ${message}` });
      } finally {
        restoringIds.delete(track.id);
      }
    },
    [providerRef, dispatch, state.source, state.provider],
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
          // Apple Music re-identifies a track when it lands in a playlist
          // (catalog id at keep-time vs library-instance id on readback), so
          // an id-only diff re-adds exactly those tracks. Fall back to the
          // shared name/artist/duration identity so an already-present track
          // is never added twice under a second id.
          const present = new TrackIndex(existingTracks);
          const newTrackIDs = keptTracks
            .filter((t) => !present.has(t))
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
            const present = new TrackIndex(nowPresent);
            const landed = keptTracks
              .filter((t) => present.has(t))
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
    [providerRef, dispatch, state.siftedPlaylistId],
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
    [providerRef],
  );

  const keepTrack = useCallback(
    (track: Track): Promise<void> => {
      if (state.source.type !== 'playlist') {
        // A library keep leaves the song where it is; remember it so later
        // library sifts leave it out (#143).
        return markReviewed(ledgerKey(state.provider, state.source), track.id);
      }
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
                siftedContentsRef.current = new TrackIndex([track]);
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
              siftedContentsRef.current = new TrackIndex(existingTracks);
            }
            const contents = siftedContentsRef.current;
            if (!contents.has(track)) {
              // Without addToPlaylist the keep cannot land — recording it in
              // the contents cache anyway would silently drop the track.
              // Throw into the normal failure path so it gets buffered and
              // retried by the Done screen's saveSiftedPlaylist flush.
              if (!providerRef.current.addToPlaylist) {
                throw new Error('This provider does not support adding to playlists');
              }
              await providerRef.current.addToPlaylist(siftedPlaylistIdRef.current, [track.id]);
              contents.add(track);
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
    [providerRef, state.source, state.provider, state.siftedPlaylistId, findSiftedPlaylistWithRetry, dispatch],
  );

  /**
   * Keep a song for a saved session being discarded (its held decision,
   * #152): to that session's source, without touching the sift in state.
   * Queued with the keeps; a failure is reported to Sentry only.
   */
  const keepFromSavedSession = useCallback(
    (track: Track, from: { source: SiftSource; provider: MusicProvider; siftedPlaylistId: string | null }): Promise<void> => {
      const { source, provider, siftedPlaylistId } = from;
      if (source.type !== 'playlist') return markReviewed(ledgerKey(provider, source), track.id);
      const siftedName = `${source.playlist.name} - Sifted`;
      const next = keepQueue.then(async () => {
        try {
          const service = providerRef.current;
          const playlists = await service.loadPlaylists?.() ?? [];
          const sifted =
            (siftedPlaylistId != null ? playlists.find((p) => p.id === siftedPlaylistId) : undefined) ??
            playlists.find((p) => p.name === siftedName);
          if (!sifted) {
            await service.createPlaylist(siftedName, [track.id]);
            return;
          }
          // It may have landed before the app was killed.
          const present = new TrackIndex(await service.loadPlaylistTracks?.(sifted.id) ?? []);
          if (!present.has(track)) await service.addToPlaylist?.(sifted.id, [track.id]);
        } catch (err) {
          Sentry.captureException(err, { tags: { flow: 'keep-saved-session' } });
        }
      });
      keepQueue = next;
      return next;
    },
    [providerRef],
  );

  const warmCache = useCallback(async (trackIDs: string[], playlistID?: string): Promise<void> => {
    try {
      const isAuth = await providerRef.current.isAuthorized();
      if (!isAuth) {
        const granted = await providerRef.current.requestAuthorization();
        if (!granted) return;
      }
      const resolved = await providerRef.current.warmSongCache?.(trackIDs, playlistID);
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
  }, [providerRef]);

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
    [providerRef, state.siftedPlaylistId],
  );

  return {
    authorize,
    isAuthorized,
    ensureAccess,
    loadPlaylists,
    loadTracks,
    play,
    pause,
    stop,
    resume,
    seek,
    togglePlayPause,
    skipForward,
    skipBackward,
    saveSiftedPlaylist,
    keepTrack,
    keepFromSavedSession,
    removeTrack,
    retryFailedRemovals,
    restoreTrack,
    warmCache,
    clearSiftedPlaylist,
    previewOffset,
  };
}
