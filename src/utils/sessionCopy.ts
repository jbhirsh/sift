import type { MusicProvider, SiftSource, Track } from '../types';
import { APPLE_REMOVED_PLAYLIST } from './libraryRemovals';

// What Remove and Keep actually do, said the same way everywhere: the Setup
// footnote, the first-remove note, the discard confirmation and Done. One
// place, so the screens can't drift apart (#141, #137).

// The playlist name lives with the code that reads the playlist; it's
// re-exported here for the copy and its tests.
export { APPLE_REMOVED_PLAYLIST };

export function siftedPlaylistName(playlistName: string): string {
  return `${playlistName} - Sifted`;
}

function isAppleLibrary(provider: MusicProvider, source: SiftSource): boolean {
  return provider === 'apple-music' && source.type === 'library';
}

/** One line under Setup's source picker, before the first irreversible swipe. */
export function removeExplanation(provider: MusicProvider, source: SiftSource): string {
  if (source.type === 'playlist') {
    return `Removed songs leave this playlist; kept songs are collected in "${siftedPlaylistName(source.playlist.name)}".`;
  }
  if (isAppleLibrary(provider, source)) {
    return `Removed songs are collected in "${APPLE_REMOVED_PLAYLIST}" for you to delete in Music.`;
  }
  return 'Removed songs are taken out of your Liked Songs.';
}

/**
 * The one-time note on the first Apple Music library remove: Apple doesn't
 * let apps delete library songs, so Remove only collects them.
 */
export const FIRST_REMOVE_NOTE =
  `Removed songs stay in your library for now: they're collected in "${APPLE_REMOVED_PLAYLIST}" so you can delete them in Music.`;

export interface DecisionCounts {
  kept: number;
  removed: number;
  skipped: number;
  total: number;
  /** Keeps whose add to "<name> - Sifted" never landed (playlist sifts). */
  pendingKeeps: number;
}

export function decisionCounts(session: {
  kept: readonly unknown[];
  removed: readonly unknown[];
  skipped: readonly unknown[];
  pendingKeeps?: readonly unknown[];
}): DecisionCounts {
  const kept = session.kept.length;
  const removed = session.removed.length;
  const skipped = session.skipped.length;
  return { kept, removed, skipped, total: kept + removed + skipped, pendingKeeps: session.pendingKeeps?.length ?? 0 };
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
}

/**
 * The confirmation before a session with decisions is thrown away (#137).
 * `source` and `provider` are the session's own, not whatever Setup has
 * selected now. `kind` says what discards it:
 * - start-over: starting this source over (for a playlist that also empties
 *   its "- Sifted" companion and removal history);
 * - new-sift: starting another sift, which replaces the only saved session
 *   (`alsoEmpties` names a playlist whose re-sift also clears its companion);
 * - done: leaving a finished sift's Done screen.
 */
export function discardConfirmation(
  provider: MusicProvider,
  source: SiftSource,
  counts: DecisionCounts,
  kind: 'start-over' | 'new-sift' | 'done',
  { alsoEmpties }: { alsoEmpties?: string } = {},
): { title: string; message: string; confirm: string } {
  const name = source.type === 'playlist' ? `"${source.playlist.name}"` : 'your library';
  const n = (x: number) => x.toLocaleString('en-US');
  const breakdown = `(${n(counts.kept)} kept, ${n(counts.removed)} removed, ${n(counts.skipped)} skipped)`;
  const lines = [kind === 'done'
    ? `You made ${plural(counts.total, 'decision')} ${breakdown} in your sift of ${name}.`
    : `You have ${plural(counts.total, 'decision')} so far ${breakdown} in your sift of ${name}.`];
  if (kind === 'start-over' && source.type === 'playlist') {
    lines.push(`Starting over empties "${siftedPlaylistName(source.playlist.name)}" and clears this playlist's removal history.`);
  } else if (isAppleLibrary(provider, source) && counts.removed > 0) {
    lines.push(`Songs you removed stay in "${APPLE_REMOVED_PLAYLIST}".`);
  } else if (counts.removed > 0) {
    lines.push('Songs you removed stay removed.');
  }
  if (counts.pendingKeeps > 0 && source.type === 'playlist') {
    lines.push(`${plural(counts.pendingKeeps, 'kept song')} never reached "${siftedPlaylistName(source.playlist.name)}" and would be lost.`);
  }
  if (alsoEmpties) {
    lines.push(`It also empties "${siftedPlaylistName(alsoEmpties)}" and clears that playlist's removal history.`);
  }
  lines.push({
    'start-over': 'You won\u2019t be able to resume it.',
    'new-sift': 'Starting a new sift replaces it, and you won\u2019t be able to resume it.',
    done: 'Starting over clears this summary and its Restore buttons.',
  }[kind]);
  return {
    title: kind === 'new-sift' ? 'Discard your current sift?' : 'Start Over?',
    message: lines.join(' '),
    // Never just "Start Over": the screen behind the alert has its own Start
    // Over button, and the alert's must read as the destructive step it is.
    confirm: kind === 'new-sift' ? 'Discard' : 'Discard and Start Over',
  };
}

/**
 * Removed tracks whose removal failed, by id: two songs can share a name,
 * and removalErrors (names, for display) also collects failed restores and
 * keeps a failed removal's entry after a successful restore takes the track
 * off the removed list.
 */
export function failedRemovalCount(removed: readonly Track[], failedRemovalIds: readonly string[]): number {
  const ids = new Set(failedRemovalIds);
  return removed.filter((t) => ids.has(t.id)).length;
}

/**
 * failedRemovalIds for a session saved before they were recorded: the
 * removed tracks whose name is a removal error. A name shared by another
 * removed track over-counts, the best a names-only session allows.
 */
export function legacyFailedRemovalIds(removed: readonly Track[], removalErrors: readonly string[]): string[] {
  const names = new Set(removalErrors);
  return removed.filter((t) => names.has(t.name)).map((t) => t.id);
}

/** Changes that didn't reach Apple Music/Spotify: failed removals and parked keeps. */
export function unsyncedCount(
  removed: readonly Track[],
  failedRemovalIds: readonly string[],
  pendingKeeps: readonly Track[],
): number {
  return failedRemovalCount(removed, failedRemovalIds) + pendingKeeps.length;
}

/** Done's subtitle over the removed list, with real counts when some failed. */
export function removedListSubtitle(
  provider: MusicProvider,
  source: SiftSource,
  removedCount: number,
  failures: number,
): string {
  // A track can fail more than once (retries); never claim more failures
  // than removals.
  const failedCount = Math.min(failures, removedCount);
  const where = isAppleLibrary(provider, source)
    ? `moved to "${APPLE_REMOVED_PLAYLIST}" in Music`
    : `removed from ${source.type === 'playlist' ? `"${source.playlist.name}"` : 'your library'}`;
  if (failedCount === 0) return `These tracks have been ${where}.`;
  if (failedCount >= removedCount) {
    return `${failedCount.toLocaleString('en-US')} of ${removedCount.toLocaleString('en-US')} could not be ${where}; ${failedCount === 1 ? 'it is' : 'they are'} still in place.`;
  }
  return `${(removedCount - failedCount).toLocaleString('en-US')} of ${removedCount.toLocaleString('en-US')} have been ${where}; ${failedCount.toLocaleString('en-US')} could not be.`;
}
