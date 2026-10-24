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
  {
    provider,
    connectionStatus,
    finish = false,
  }: {
    /** The current provider, for sessions saved before they recorded one. */
    provider: MusicProvider;
    connectionStatus: ConnectionStatus;
    /** End the sift where it left off: resume straight to Done (#142). */
    finish?: boolean;
  },
): Omit<
  SiftState,
  'startAtChorus' | 'playbackFailedId' | 'songCacheWarming' | 'songCacheGeneration' | 'filter'
> {
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
    // A session with no cards left has nothing to sift: it resumes to Done.
    phase: finish || saved.cursor >= saved.tracks.length ? 'done' : 'sifting',
    loadProgress: 1,
    loadMessage: '',
    loadError: null,
    playbackPosition: 0,
    isPlaying: false,
    // Legacy sessions predate these fields: default to empty rather than
    // dropping the persisted repair signal on the floor.
    removalErrors: saved.removalErrors ?? [],
    failedRemovalIds:
      saved.failedRemovalIds ?? legacyFailedRemovalIds(saved.removed, saved.removalErrors ?? []),
    connectionStatus,
    skipFiltering: false,
    // Sent on resume by the screen that resumes (#152). A held playlist
    // keep from an older build goes to the reviewed ledger like any keep.
    pending: saved.pending ?? null,
  };
}
