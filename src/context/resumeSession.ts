import type { ConnectionStatus, MusicProvider, SiftSession } from '../types';
import { legacyFailedRemovalIds } from '../utils/sessionCopy';
import type { SiftState } from './SiftContext';

/**
 * The state a saved session resumes into (RESUME_SESSION's payload). Every
 * field a newer build added to SiftSession is optional on disk, so this is
 * where an old session gets its defaults; the frozen fixtures in
 * __tests__/fixtures pin that for each saved shape (#61).
 */
export function resumeState(
  saved: SiftSession,
  { provider, connectionStatus, finish = false }: {
    /** The current provider, for sessions saved before they recorded one. */
    provider: MusicProvider;
    connectionStatus: ConnectionStatus;
    /** End the sift where it left off: resume straight to Done (#142). */
    finish?: boolean;
  },
): Omit<SiftState, 'startAtChorus'> {
  const source = saved.source ?? { type: 'library' as const };
  return {
    tracks: saved.tracks,
    cursor: saved.cursor,
    kept: saved.kept,
    removed: saved.removed,
    skipped: saved.skipped,
    sortOrder: saved.sortOrder,
    provider: saved.provider ?? provider,
    source,
    activeSource: source,
    // A FINISHED session is only offered for resume when it still has
    // unflushed pendingKeeps: resume it straight to Done so the fallback
    // save can repair them instead of replaying a sift with nothing left.
    phase: finish || saved.cursor >= saved.tracks.length ? 'done' : 'sifting',
    loadProgress: 1,
    loadMessage: '',
    loadError: null,
    playbackPosition: 0,
    isPlaying: false,
    removalPlaylistCreated: false,
    removalPlaylistError: null,
    isCreatingPlaylist: false,
    // Legacy sessions predate these fields: default to empty rather than
    // dropping the persisted repair signal on the floor.
    removalErrors: saved.removalErrors ?? [],
    failedRemovalIds:
      saved.failedRemovalIds ?? legacyFailedRemovalIds(saved.removed, saved.removalErrors ?? []),
    connectionStatus,
    pendingKeeps: saved.pendingKeeps ?? [],
    skipFiltering: false,
    // Null falls back to the name-based sifted-playlist lookup.
    siftedPlaylistId: saved.siftedPlaylistId ?? null,
    // Sent on resume by the screen that resumes (#152).
    pending: saved.pending ?? null,
  };
}
