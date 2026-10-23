import { useEffect, useRef, useCallback } from 'react';
import { Alert, Linking } from 'react-native';
import * as Sentry from '@sentry/react-native';
import { useSift } from '../context/SiftContext';
import { useMusicProviderService } from '../context/MusicProviderContext';
import {
  forgetRemovals,
  logRemoval,
  loadHistory,
  removeFromHistory,
} from '../services/RemovalHistoryStore';
import { sortTracks } from '../utils/sorting';
import { TrackIndex } from '../utils/trackIdentity';
import {
  APPLE_REMOVED_PLAYLIST,
  collectedRemovalIds,
  collectsRemovals,
} from '../utils/libraryRemovals';
import { ledgerKey } from '../utils/reviewedLedger';
import { AddShortfallError, batches } from '../utils/musicKit';
import {
  ACCESS_REQUIRED,
  keptSaveRetryable,
  loadFailureMessage,
  siftedPlaylistName,
} from '../utils/sessionCopy';
import { isFiltering, matchesFilter } from '../utils/trackFilter';
import { withoutIds } from '../utils/withoutIds';
import { loadReviewedIds, markReviewed, unmarkReviewed } from '../services/ReviewedLedgerStore';
import { importSiftedKeeps } from '../services/SiftedImport';
import { deletedInMusicCount } from '../services/DeletedInMusic';
import { loadPlaylistTracksOnce } from '../services/playlistLoads';
import { trace } from '../services/trace';
import type { MusicProvider, Playlist, SiftSource, Track } from '../types';

const SKIP_SECONDS = 15;

// Done's "Save kept songs as a playlist" adds the songs this many at a time.
// Each batch is one queued library write with its own stall timeout
// (AppleMusicProvider adds one item at a time), so a few hundred kept songs
// don't add up to one write that times out while it's still working, and a
// batch that does time out leaves few songs still landing behind it.
export const KEPT_SAVE_BATCH = 10;

// How long a save waits for earlier library writes to finish before it
// reads "<name> - Sifted". One that timed out may still be adding songs; a
// save that read the playlist meanwhile would add them again.
export const KEPT_SAVE_SETTLE_MS = 15000;

export const STILL_FINISHING = 'Music is still finishing an earlier change. Try again in a moment.';

// One kept-songs save at a time, launch-wide: two would each read
// "<name> - Sifted" before the other's adds landed and add the same songs
// twice, or each create the playlist. Module-scoped because a Done screen
// left mid-save and shown again is a new hook instance. Links never reject.
let keptSaveQueue: Promise<unknown> = Promise.resolve();
// The "<name> - Sifted" playlists saves made this launch, by name: when the
// lookup lists more than one, it's the one to add to. Without a provider
// lookup that knows new playlists (findPlaylists), it's used even while
// the library doesn't list it yet.
const createdKeptPlaylists = new Map<string, string>();

/** Forget the playlists saves made, as a fresh launch would. For tests. */
export function resetKeptSaves(): void {
  createdKeptPlaylists.clear();
  keptSaveQueue = Promise.resolve();
}

/** What a kept-songs save did (Done's message says it). */
export interface KeptSaveResult {
  /** The "<name> - Sifted" playlist saved to. */
  playlistName: string;
  /** The playlist sifted. */
  sourceName: string;
  /** Songs remembered as kept that are still in the source playlist. */
  kept: number;
  /** How many of them this save added. */
  added: number;
  /** How many had no song for Music to add (couldn't be found): not worth retrying. */
  notAdded: number;
  /** Songs remembered as kept that are no longer in the source playlist. */
  leftOut: number;
}

/** Whether the promise settles within ms; the timer never outlives it. */
async function settlesWithin(promise: Promise<unknown>, ms: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), ms);
  });
  try {
    return await Promise.race([
      promise.then(
        () => true,
        () => true,
      ),
      timeout,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

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
// Restores under way, by song: a second Restore of the same song (Done's
// button, then the decisions list) joins the first instead of adding the
// song back twice.
const restoresInFlight = new Map<string, Promise<boolean>>();
// Which track load counts (#177). Each load takes the next number and
// dispatches only while it's still the latest; Cancel moves the number on,
// so a load that finishes after it changes nothing. Launch-wide, like the
// rest: a new Loading screen's load supersedes one an earlier one started.
let loadGeneration = 0;

/** Forget the retry bookkeeping, as a fresh launch would. Exported for tests. */
export function resetRemovalRetries(): void {
  removalRetryAttempts.clear();
  removalRetryInFlight = null;
  restoringIds.clear();
  removalsInFlight.clear();
  restoresInFlight.clear();
}

/**
 * The music provider's operations, wired to SiftContext. The provider itself
 * and the playback poller are shared, owned by MusicProviderHost (#144).
 */
export function useMusicProvider() {
  const { state, dispatch } = useSift();
  const providerRef = useMusicProviderService();

  // The load this instance has under way (its generation), if any.
  const loadingInProgressRef = useRef<number | null>(null);
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
  const ensureAccess = useCallback(
    async (stillWanted: () => boolean = () => true): Promise<boolean> => {
      if (await providerRef.current.isAuthorized()) return true;
      if (await providerRef.current.requestAuthorization()) return true;
      // Asked for by a load that was cancelled since: say nothing.
      if (!stillWanted()) return false;
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
    },
    [providerRef, dispatch],
  );

  const play = useCallback(
    async (trackID: string, position?: number) => {
      try {
        await providerRef.current.play(trackID, position);
        dispatch({ type: 'SET_PLAYBACK_FAILED', trackId: null });
        dispatch({ type: 'SET_IS_PLAYING', isPlaying: true });
        dispatch({ type: 'SET_PLAYBACK_POSITION', position: position ?? 0 });
      } catch (err) {
        Sentry.addBreadcrumb({
          category: 'playback',
          message: `Play failed: ${err}`,
          level: 'warning',
        });
        // The player says so, rather than sitting at 0:00.
        dispatch({ type: 'SET_PLAYBACK_FAILED', trackId: trackID });
      }
    },
    [providerRef, dispatch],
  );

  const pause = useCallback(async () => {
    try {
      await providerRef.current.pause();
      dispatch({ type: 'SET_IS_PLAYING', isPlaying: false });
    } catch (err) {
      Sentry.addBreadcrumb({
        category: 'playback',
        message: `Pause failed: ${err}`,
        level: 'warning',
      });
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
      Sentry.addBreadcrumb({
        category: 'playback',
        message: `Resume failed: ${err}`,
        level: 'warning',
      });
    }
  }, [providerRef, dispatch]);

  const seek = useCallback(
    (position: number) => {
      providerRef.current.seek(position);
      dispatch({ type: 'SET_PLAYBACK_POSITION', position });
    },
    [providerRef, dispatch],
  );

  /** Where a track's preview sits in the full track (a chorus hint); null when unknown. */
  const previewOffset = useCallback(
    async (trackID: string): Promise<number | null> =>
      (await providerRef.current.previewOffset?.(trackID)) ?? null,
    [providerRef],
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

  const loadTracks = useCallback(
    async (options?: { skipFiltering?: boolean }) => {
      if (loadingInProgressRef.current !== null) {
        Sentry.addBreadcrumb({
          category: 'music-provider',
          message: 'loadTracks skipped — already in progress',
          level: 'debug',
        });
        return;
      }
      loadGeneration += 1;
      const generation = loadGeneration;
      loadingInProgressRef.current = generation;
      // Every dispatch below goes through send: once Cancel (or a newer load)
      // has moved the generation on, this load changes nothing.
      const current = () => generation === loadGeneration;
      const send: typeof dispatch = (action) => {
        if (current()) dispatch(action);
        // In the E2E trace, so a flow can show a late result was dropped.
        else trace('load-dropped', { type: action.type });
      };

      const shouldFilter = !options?.skipFiltering;
      const source = state.source;
      const filter = state.filter;
      const label = source.type === 'playlist' ? `"${source.playlist.name}"` : 'library';

      send({ type: 'SET_LOAD_PROGRESS', progress: 0, message: `Loading ${label}…` });
      send({ type: 'SET_PHASE', phase: 'loading' });

      try {
        if (!(await ensureAccess(current))) {
          send({ type: 'SET_LOAD_ERROR', error: ACCESS_REQUIRED });
          return;
        }
        if (!current()) return;

        send({ type: 'SET_LOAD_PROGRESS', progress: 0.3, message: 'Fetching tracks…' });

        let tracks: Track[];
        let unfilteredCount: number;
        // How many tracks each independent filter dropped — the zero-track
        // message below distinguishes "already sifted" from "previously
        // removed" instead of blaming the ledger filter for both.
        let filteredAsRemoved = 0;
        let filteredAsReviewed = 0;
        if (source.type === 'playlist') {
          // Shared with Setup's "- Sifted" import of it, if that's loading
          // it now (#179): the playlist is fetched once.
          const result = await loadPlaylistTracksOnce(providerRef.current, source.playlist.id);
          if (!result) throw new Error('This provider does not support playlist loading');
          tracks = result;
          unfilteredCount = tracks.length;
          // Cancelled while it loaded: leave the rest (the import included).
          if (!current()) return;
          // Keeps an older build saved to "<name> - Sifted", into the ledger
          // first (once per playlist), so the filter below counts them.
          await importSiftedKeeps(providerRef.current, state.provider, source, result);

          if (shouldFilter) {
            // Leave out songs kept in earlier sifts of this playlist, as a
            // library sift does (#143): a keep leaves the song in the playlist.
            // By id: the ids the keeps recorded came from this same load.
            const reviewedIds = await loadReviewedIds(ledgerKey(state.provider, source));
            ({ tracks, dropped: filteredAsReviewed } = withoutIds(tracks, reviewedIds));

            if (!collectsRemovals(state.provider)) {
              // Exclude tracks previously removed from this playlist
              const history = await loadHistory();
              const removedIds = new Set(
                history
                  .filter(
                    (r) =>
                      r.source.type === 'playlist' && r.source.playlist.id === source.playlist.id,
                  )
                  .map((r) => r.track.id),
              );
              ({ tracks, dropped: filteredAsRemoved } = withoutIds(tracks, removedIds));
            }
          }
          if (collectsRemovals(state.provider)) {
            // Skip songs removed in any earlier sift: they wait in "Sift —
            // Removed" to be deleted from the library (Remove means that,
            // whatever the sift). Applies with skipFiltering, as for the
            // library: starting over un-removes nothing.
            const removedIds = collectedRemovalIds(await loadHistory(), state.provider);
            ({ tracks, dropped: filteredAsRemoved } = withoutIds(tracks, removedIds));
          }
        } else {
          tracks = await providerRef.current.loadLibrary();
          unfilteredCount = tracks.length;
          if (collectsRemovals(state.provider)) {
            // Skip songs removed in an earlier sift (#139). On Apple Music
            // they never left the library (they sit in "Sift — Removed"), so
            // without this every library sift offered them again. Applies
            // with skipFiltering too: a library Start Over starts the decisions
            // over but un-removes nothing. A provider whose Remove really
            // deletes the song wouldn't need this: a song back in its library
            // was re-added on purpose.
            const removedIds = collectedRemovalIds(await loadHistory(), state.provider);
            ({ tracks, dropped: filteredAsRemoved } = withoutIds(tracks, removedIds));
          }
          if (shouldFilter) {
            // Leave out songs kept in earlier library sifts (#143), so a big
            // library gets through over many sittings. By id, like the removal
            // filter above. Skipped songs were never recorded, so they come
            // back. Setup's "Include songs I've already sifted" switch passes
            // skipFiltering to bring them all back.
            const reviewedIds = await loadReviewedIds(ledgerKey(state.provider, source));
            ({ tracks, dropped: filteredAsReviewed } = withoutIds(tracks, reviewedIds));
          }
        }

        // Setup's Plays and Added limits, after the rest: the messages below
        // blame these only for what they themselves left out.
        let filteredByLimits = 0;
        if (isFiltering(filter)) {
          const now = new Date();
          const beforeLimits = tracks.length;
          tracks = tracks.filter((t) => matchesFilter(t, filter, now));
          filteredByLimits = beforeLimits - tracks.length;
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
            filteredByLimits > 0
              ? `No songs ${source.type === 'playlist' ? 'in this playlist ' : ''}match your Plays and Added choices.`
              : source.type === 'playlist' &&
                  unfilteredCount > 0 &&
                  (shouldFilter || filteredAsRemoved > 0)
                ? filteredAsRemoved === 0
                  ? 'You\u2019ve sifted every song in this playlist. Turn on \u201cInclude songs I\u2019ve already sifted\u201d to go through them again.'
                  : filteredAsReviewed === 0
                    ? 'All tracks in this playlist were removed in a previous sift.'
                    : 'All tracks in this playlist have already been sifted or removed.'
                : source.type === 'playlist'
                  ? 'This playlist has no tracks to sift.'
                  : filteredAsReviewed > 0
                    ? 'You\u2019ve sifted every song in your library. Turn on \u201cInclude songs I\u2019ve already sifted\u201d to go through them again.'
                    : filteredAsRemoved > 0
                      ? 'Every song in your library was removed in a previous sift.'
                      : 'Your library has no tracks to sift.';
          send({ type: 'SET_LOAD_ERROR', error });
          return;
        }

        send({ type: 'SET_LOAD_PROGRESS', progress: 0.9, message: 'Sorting tracks…' });
        send({ type: 'LOAD_TRACKS', tracks: sortTracks(tracks, state.sortOrder) });
      } catch (err) {
        // The raw error goes to Sentry; the user gets plain words (#174).
        Sentry.captureException(err, { tags: { flow: 'load-tracks' } });
        send({ type: 'SET_LOAD_ERROR', error: loadFailureMessage(source, err) });
      } finally {
        if (loadingInProgressRef.current === generation) loadingInProgressRef.current = null;
      }
    },
    [
      providerRef,
      dispatch,
      ensureAccess,
      state.source,
      state.sortOrder,
      state.provider,
      state.filter,
    ],
  );

  /**
   * Loading's Cancel (#177): back to Setup, and whatever the load under way
   * finds later is dropped (it no longer holds the latest generation).
   */
  const cancelLoad = useCallback(() => {
    loadGeneration += 1;
    loadingInProgressRef.current = null;
    dispatch({ type: 'CANCEL_LOAD' });
  }, [dispatch]);

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
    const collecting = collectsRemovals(provider);
    // Nothing to retry with: a missing call must not count as a removal.
    let remove: ((id: string) => Promise<void>) | undefined;
    if (source.type === 'playlist' && !collecting) {
      if (removeFromPlaylist)
        remove = async (id) => {
          await removeFromPlaylist.call(service, source.playlist.id, [id]);
        };
    } else if (removeFromLibrary) {
      remove = (id) => removeFromLibrary.call(service, [id]);
    }
    if (!remove) return;
    const due = removed.filter(
      (track) =>
        failedRemovalIds.includes(track.id) &&
        (removalRetryAttempts.get(track.id) ?? 0) < MAX_REMOVAL_RETRIES,
    );
    if (due.length === 0) return;
    // Still removed and still failed, read now: a Restore (or another
    // screen's retry) may have settled it since this retry started.
    const stillDue = (id: string) =>
      !restoringIds.has(id) &&
      removalStateRef.current.failedRemovalIds.includes(id) &&
      removalStateRef.current.removed.some((t) => t.id === id);
    const run = async () => {
      for (const track of due) {
        if (!stillDue(track.id)) continue;
        const attempt = (removalRetryAttempts.get(track.id) ?? 0) + 1;
        removalRetryAttempts.set(track.id, attempt);
        try {
          const landed = (await service.removalLanded?.(source, track.id)) ?? false;
          if (!landed) await remove(track.id);
          // The failed collected removal dropped its history record; now
          // it has landed, record it again so later sifts leave it out.
          if (collecting) {
            await logRemoval({
              track,
              source,
              provider,
              removedAt: new Date().toISOString(),
              collected: true,
            });
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
      const collecting = collectsRemovals(provider);
      // A song removed in an earlier sift is already recorded and already in
      // "Sift — Removed"; removing it again (if a sift offers it anyway)
      // would add a duplicate there (#139).
      if (collecting && collectedRemovalIds(await loadHistory(), provider).has(track.id)) return;
      // Log the removal before attempting it — the user's intent is what
      // matters, and a playlist's failed removal stays filtered out.
      await logRemoval({
        track,
        source,
        provider,
        removedAt: new Date().toISOString(),
        ...(collecting ? { collected: true } : {}),
      });
      try {
        if (source.type === 'playlist' && !collecting) {
          await providerRef.current.removeFromPlaylist?.(source.playlist.id, [track.id]);
        } else {
          await providerRef.current.removeFromLibrary?.([track.id]);
        }
      } catch (err) {
        Sentry.captureException(err, { tags: { flow: 'remove-track' } });
        if (report)
          dispatch({ type: 'ADD_REMOVAL_ERROR', error: track.name, failedRemovalId: track.id });
        // A failed collected removal left the song where it was and out of
        // "Sift — Removed": drop its record so the next sift offers it
        // again rather than hiding it for good.
        if (collecting) await removeFromHistory(track.id, source);
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

  /** Undo a song's removal. Resolves to whether it worked; a failure is shown as a removal error. */
  const restoreNow = useCallback(
    async (track: Track): Promise<boolean> => {
      // A retry of this song's failed removal (#151) must not land after
      // the restore: wait out one under way, and keep new ones off it.
      restoringIds.add(track.id);
      try {
        await removalRetryInFlight;
        await removalsInFlight.get(track.id);
        const source = state.source;
        const service = providerRef.current;
        if (collectsRemovals(state.provider)) {
          // An Apple Music Remove never took the song out of the library or
          // the playlist: it put it in "Sift — Removed". Restoring means
          // taking it back out of there (#139). Nothing came out is fine
          // when it never went in (its removal failed); not when it's still
          // there (filed under an id the take-out didn't match): then the
          // Restore failed, and says so rather than forget a song the user
          // would later delete.
          const out = (await service.restoreRemoved?.([track.id])) ?? 0;
          if (out === 0 && (await service.removalLanded?.(source, track.id))) {
            throw new Error(`Couldn\u2019t take it out of "${APPLE_REMOVED_PLAYLIST}". Try again.`);
          }
          // Removed in any sift, it's restored for every sift.
          await forgetRemovals(track.id, state.provider);
        } else {
          // A playlist removal that failed may never have taken effect: then
          // the song is still in the playlist, and adding it back would make
          // a second copy, so restoring it is only forgetting the removal.
          // Asked rather than read from failedRemovalIds: one can fail after
          // taking effect, and a failure that just came in may not be in
          // this screen's state yet.
          const stillThere =
            source.type === 'playlist' &&
            service.removalLanded != null &&
            !(await service.removalLanded(source, track.id));
          if (source.type === 'playlist') {
            if (!stillThere) await service.addToPlaylist?.(source.playlist.id, [track.id]);
          } else {
            await service.addToLibrary?.([track.id]);
          }
          // Purge the removal-history record so the restored track is no
          // longer filtered out as removed (a Restore on Done then records
          // it as kept, which the ledger filter decides).
          await removeFromHistory(track.id, source);
        }
        // Nothing left to retry: the song is back where it was.
        dispatch({ type: 'CLEAR_REMOVAL_FAILURE', trackId: track.id, error: track.name });
        dispatch({ type: 'RESTORE_TRACK', trackId: track.id });
        return true;
      } catch (err) {
        Sentry.captureException(err, { tags: { flow: 'restore-track' } });
        const message = err instanceof Error ? err.message : 'Failed to restore track';
        dispatch({ type: 'ADD_REMOVAL_ERROR', error: `${track.name}: ${message}` });
        return false;
      } finally {
        restoringIds.delete(track.id);
      }
    },
    [providerRef, dispatch, state.source, state.provider],
  );

  /** Whether a restore of this song is running (from Done or the decisions list). */
  const restoreUnderWay = useCallback(
    (trackId: string): boolean => restoresInFlight.has(trackId),
    [],
  );

  const restoreTrack = useCallback(
    (track: Track): Promise<boolean> => {
      const running = restoresInFlight.get(track.id);
      if (running) return running;
      const run = restoreNow(track).finally(() => restoresInFlight.delete(track.id));
      restoresInFlight.set(track.id, run);
      return run;
    },
    [restoreNow],
  );

  /**
   * Done's "Save kept songs as a playlist": every song remembered as kept
   * from the playlist being sifted (the reviewed ledger, so every sift of it
   * so far, not just this one) and still in it goes into "<name> - Sifted".
   * The playlist is made, empty, when there isn't one by that name, so its
   * id is known before any add; then only the songs not in it yet are added.
   * A song Music can't add is counted, not retried forever. Rejects when a
   * write fails or times out: the songs that landed stay, and saving again
   * adds only the rest.
   */
  const saveKeptPlaylist = useCallback((): Promise<KeptSaveResult> => {
    const source = state.activeSource ?? state.source;
    const provider = state.provider;
    if (source.type !== 'playlist') {
      return Promise.reject(new Error('Only a playlist sift saves its kept songs as a playlist'));
    }
    const run = keptSaveQueue.then(async (): Promise<KeptSaveResult> => {
      const playlistName = siftedPlaylistName(source.playlist.name);
      const sourceName = source.playlist.name;
      try {
        const service = providerRef.current;
        // An earlier write that timed out may still be landing: wait for the
        // library writes to finish rather than read the playlist under them.
        if (
          service.writesSettled &&
          !(await settlesWithin(service.writesSettled(), KEPT_SAVE_SETTLE_MS))
        ) {
          throw new Error(STILL_FINISHING);
        }
        // Read after the queue: keeps recorded while an earlier save ran count.
        const remembered = [...(await loadReviewedIds(ledgerKey(provider, source)))];
        if (remembered.length === 0)
          return { playlistName, sourceName, kept: 0, added: 0, notAdded: 0, leftOut: 0 };
        // Only songs still in the playlist: the ledger's ids came from its
        // loads, and a song taken out of it since can't be matched by song.
        const sourceTracks = await service.loadPlaylistTracks?.(source.playlist.id);
        if (!sourceTracks) throw new Error('This provider does not support playlist loading');
        const inSource = new Map(sourceTracks.map((t) => [t.id, t]));
        const kept = remembered.flatMap((id) => inSource.get(id) ?? []);
        const leftOut = remembered.length - kept.length;
        if (kept.length === 0)
          return { playlistName, sourceName, kept: 0, added: 0, notAdded: 0, leftOut };
        const addToPlaylist = service.addToPlaylist?.bind(service);
        if (!addToPlaylist) throw new Error('This provider does not support adding to playlists');

        const listed = service.findPlaylists
          ? await service.findPlaylists(playlistName)
          : ((await service.loadPlaylists?.()) ?? [])
              .filter((p) => p.name === playlistName)
              .map((p) => p.id);
        const mine = createdKeptPlaylists.get(playlistName);
        let playlistId =
          mine != null && (listed.includes(mine) || !service.findPlaylists) ? mine : listed[0];
        let entries: Track[] = [];
        if (playlistId == null) {
          playlistId = await service.createPlaylist(playlistName);
          createdKeptPlaylists.set(playlistName, playlistId);
        } else {
          entries = (await service.loadPlaylistTracks?.(playlistId)) ?? [];
        }
        // Apple Music files a song under a new id when it lands in a
        // playlist: compare by song (name, artist, duration).
        const present = new TrackIndex(entries);
        const missing = kept.filter((t) => !present.has(t)).map((t) => t.id);
        // Every batch is tried, so a batch that fails doesn't keep the ones
        // after it out. Songs with nothing to add (unresolved) are counted:
        // retrying won't find them. Songs the add refused (failed) make the
        // save fail, so Done offers Retry for them. A batch that timed out
        // (QueueStallError) may still be adding while later batches go; the
        // next save waits for it (writesSettled) before reading the playlist,
        // so nothing it lands is added twice.
        let added = 0;
        let notAdded = 0;
        let refused = 0;
        let failure: unknown = null;
        for (const batch of batches(missing, KEPT_SAVE_BATCH)) {
          try {
            await addToPlaylist(playlistId, batch);
            added += batch.length;
          } catch (err) {
            if (err instanceof AddShortfallError) {
              added += err.added;
              notAdded += err.unresolved;
              refused += err.failed;
            } else {
              failure ??= err;
            }
          }
        }
        if (failure != null) throw failure;
        if (refused > 0) throw new Error(keptSaveRetryable({ added, refused, notAdded }));
        return { playlistName, sourceName, kept: kept.length, added, notAdded, leftOut };
      } catch (err) {
        Sentry.captureException(err, { tags: { flow: 'save-kept-playlist' } });
        throw err;
      }
    });
    keptSaveQueue = run.catch(() => undefined);
    return run;
  }, [providerRef, state.activeSource, state.source, state.provider]);

  /**
   * Keep a song: it stays where it is, and the reviewed ledger remembers it
   * for its source, so later sifts of that library or playlist leave it out
   * (#143). Nothing is written to the music service; Done's "Save kept songs
   * as a playlist" copies a playlist's keeps when asked.
   */
  const keepTrack = useCallback(
    (track: Track): Promise<void> =>
      markReviewed(ledgerKey(state.provider, state.activeSource ?? state.source), track.id),
    [state.provider, state.activeSource, state.source],
  );

  /**
   * Take back a keep that was sent (its decision changed): out of the
   * reviewed ledger, so later sifts offer the song again. Resolves to
   * whether it worked, which it always does: the ledger reports its own
   * write failures. A song already saved to "<name> - Sifted" stays there.
   */
  const unkeepTrack = useCallback(
    async (track: Track): Promise<boolean> => {
      await unmarkReviewed(ledgerKey(state.provider, state.activeSource ?? state.source), track.id);
      return true;
    },
    [state.provider, state.activeSource, state.source],
  );

  /**
   * Setup's count of a playlist's remembered keeps, before a sift loads it:
   * includes the ones an older build saved to "<name> - Sifted"
   * (services/SiftedImport). Never rejects.
   */
  const rememberSiftedKeeps = useCallback(
    (source: SiftSource): Promise<void> =>
      importSiftedKeeps(providerRef.current, state.provider, source),
    [providerRef, state.provider],
  );

  /**
   * Setup's count of songs Sift collected that the user has since deleted
   * from their library in Music (#183), until a Setup shows it
   * (services/DeletedInMusic markDeletedInMusicShown). Never rejects.
   */
  const deletedInMusic = useCallback(
    (): Promise<number> => deletedInMusicCount(providerRef.current, state.provider),
    [providerRef, state.provider],
  );

  const warmCache = useCallback(
    async (trackIDs: string[], playlistID?: string): Promise<void> => {
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
    },
    [providerRef],
  );

  return {
    authorize,
    isAuthorized,
    ensureAccess,
    loadPlaylists,
    loadTracks,
    cancelLoad,
    play,
    pause,
    stop,
    resume,
    seek,
    togglePlayPause,
    skipForward,
    skipBackward,
    saveKeptPlaylist,
    rememberSiftedKeeps,
    deletedInMusic,
    keepTrack,
    unkeepTrack,
    removeTrack,
    retryFailedRemovals,
    restoreTrack,
    restoreUnderWay,
    warmCache,
    previewOffset,
  };
}
