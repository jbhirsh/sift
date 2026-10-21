import type { Decision, MusicProvider, SiftSource, Track } from '../types';
import { APPLE_REMOVED_PLAYLIST, collectsRemovals } from './libraryRemovals';
import { loadFailureKind } from './musicKit';

// What Remove and Keep actually do, said the same way everywhere: the Setup
// footnote, the first-remove note, the discard confirmation and Done. One
// place, so the screens can't drift apart (#141, #137).

// The playlist name lives with the code that reads the playlist; it's
// re-exported here for the copy and its tests.
export { APPLE_REMOVED_PLAYLIST };

/** The playlist Done's "Save kept songs as a playlist" fills. */
export function siftedPlaylistName(playlistName: string): string {
  return `${playlistName} - Sifted`;
}

/** One line under Setup's source picker, before the first irreversible swipe. */
export function removeExplanation(provider: MusicProvider, source: SiftSource): string {
  const removed = collectsRemovals(provider)
    ? `Removed songs are collected in "${APPLE_REMOVED_PLAYLIST}" for you to delete from your library in Music`
    : source.type === 'playlist'
      ? 'Removed songs leave this playlist'
      : 'Removed songs are taken out of your library';
  return source.type === 'playlist'
    ? `${removed}. Kept songs stay, and you can save them as a playlist when you\u2019re done.`
    : `${removed}.`;
}

/** Setup's words when Music won't let Sift read the library. */
export const ACCESS_REQUIRED = 'Music library access is required to use Sift.';

/**
 * What Setup says when loading the songs failed outright (#174). The
 * service's own error text ("No tracks found for the given IDs.") means
 * nothing to the user: it says what didn't load and what will help, which
 * is not always trying again (`loadFailureKind`).
 */
export function loadFailureMessage(source: SiftSource, error: unknown): string {
  const what = source.type === 'playlist' ? `"${source.playlist.name}"` : 'your library';
  switch (loadFailureKind(error)) {
    case 'gone':
      if (source.type === 'playlist') {
        return `Couldn\u2019t find ${what} in your library. Pick another playlist.`;
      }
      break;
    case 'denied':
      return `${ACCESS_REQUIRED} Allow it in Settings, under Privacy & Security, Media & Apple Music.`;
    case 'offline':
      return `Couldn\u2019t load ${what}: Music can\u2019t be reached. Check your connection, then try again.`;
    case 'other':
      break;
  }
  return `Couldn\u2019t load ${what}. Try again in a moment.`;
}

/** The first card's one-time hint: nothing else says which way is which. */
export const SWIPE_HINT = 'Swipe right to keep, left to remove.';

/**
 * The one-time note on the first Apple Music remove: Apple doesn't let apps
 * delete library songs or edit your playlists, so Remove only collects them.
 */
export const FIRST_REMOVE_NOTE =
  `Removed songs stay where they are for now: they're collected in "${APPLE_REMOVED_PLAYLIST}" so you can delete them from your library in Music.`;

/**
 * Done's "Finish in Music" card (#173): Sift can only collect removed songs,
 * so the deleting happens in Music. Two steps; the second has one way per
 * device, since Music on a Mac deletes a selection at once and on iPhone
 * it's one song at a time.
 */
export const FINISH_IN_MUSIC_TITLE = 'Finish in Music';
export const FINISH_IN_MUSIC_STEPS: readonly string[] = [
  `1. Open the "${APPLE_REMOVED_PLAYLIST}" playlist.`,
  '2. Delete its songs from your library:',
];
export const FINISH_IN_MUSIC_WAYS: readonly string[] = [
  'On a Mac, select them all, then choose Delete from Library.',
  'On iPhone, press and hold each song, then choose Delete from Library.',
];
/**
 * Apple Music's "Add & Delete Playlist Songs" setting (which Sift can't
 * read) decides whether deleting from the library also empties the user's
 * playlists.
 */
export const FINISH_IN_MUSIC_NOTE =
  'Deleting from your library also takes them out of your playlists when Add & Delete Playlist Songs is on (in Settings, under Music). A song that isn\u2019t in your library has to be removed from its playlist instead.';
export const OPEN_MUSIC_TITLE = 'Open Music';
export const OPEN_MUSIC_FAILED = {
  title: 'Couldn\u2019t open Music',
  message: 'Open the Music app yourself to finish.',
};
export const SHARE_LIST_TITLE = 'Share List';

/** The removed songs as Done's Share sends them: one "Name — Artist" a line. */
export function removedListText(removed: readonly Track[]): string {
  return removed.map((t) => `${t.name} \u2014 ${t.artist}`).join('\n');
}

/**
 * The confirmation before a playlist's Start Over from Setup or Done, when
 * no decisions would be lost. Nothing is emptied: kept songs stay
 * remembered, and collected removals stay in "Sift — Removed".
 */
export function playlistStartOverMessage(provider: MusicProvider, playlistName: string): string {
  return collectsRemovals(provider)
    ? `This starts "${playlistName}" over. Songs you removed stay in "${APPLE_REMOVED_PLAYLIST}".`
    : `This starts "${playlistName}" over and clears the removal history for this playlist. This cannot be undone.`;
}

export interface DecisionCounts {
  kept: number;
  removed: number;
  skipped: number;
  total: number;
}

export function decisionCounts(session: {
  kept: readonly unknown[];
  removed: readonly unknown[];
  skipped: readonly unknown[];
}): DecisionCounts {
  const kept = session.kept.length;
  const removed = session.removed.length;
  const skipped = session.skipped.length;
  return { kept, removed, skipped, total: kept + removed + skipped };
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
}

/**
 * The confirmation before a session with decisions is thrown away (#137).
 * `source` and `provider` are the session's own, not whatever Setup has
 * selected now. `kind` says what discards it:
 * - start-over: starting this source over (for a playlist whose removals
 *   aren't collected, that also clears its removal history);
 * - new-sift: starting another sift, which replaces the only saved session;
 * - done: leaving a finished sift's Done screen (`unfinished`: it was ended
 *   early with Finish, so cards remain), which for such a playlist also
 *   clears its removal history.
 */
export function discardConfirmation(
  provider: MusicProvider,
  source: SiftSource,
  counts: DecisionCounts,
  kind: 'start-over' | 'new-sift' | 'done',
  { unfinished }: { unfinished?: boolean } = {},
): { title: string; message: string; confirm: string } {
  const name = source.type === 'playlist' ? `"${source.playlist.name}"` : 'your library';
  const n = (x: number) => x.toLocaleString('en-US');
  const breakdown = `(${n(counts.kept)} kept, ${n(counts.removed)} removed, ${n(counts.skipped)} skipped)`;
  const lines = [kind === 'done'
    ? `You made ${plural(counts.total, 'decision')} ${breakdown} in your sift of ${name}.`
    : `You have ${plural(counts.total, 'decision')} so far ${breakdown} in your sift of ${name}.`];
  const collecting = collectsRemovals(provider);
  // A playlist whose removals aren't collected keeps them in its own
  // history, which starting over clears. Collected ones stay in "Sift —
  // Removed" whatever happens (clearHistoryForSource keeps them).
  const clearsHistory = source.type === 'playlist' && !collecting;
  if (kind === 'start-over' && clearsHistory) {
    lines.push('Starting over clears this playlist\u2019s removal history.');
  }
  if (collecting && counts.removed > 0) {
    lines.push(`Songs you removed stay in "${APPLE_REMOVED_PLAYLIST}".`);
  } else if (counts.removed > 0 && !(kind === 'start-over' && clearsHistory)) {
    lines.push('Songs you removed stay removed.');
  }
  lines.push({
    'start-over': 'You won\u2019t be able to resume it.',
    'new-sift': 'Starting a new sift replaces it, and you won\u2019t be able to resume it.',
    done: clearsHistory
      ? 'Starting over clears this summary, its Restore buttons and this playlist\u2019s removal history.'
      : 'Starting over clears this summary and its Restore buttons.',
  }[kind]);
  // Done after Finish (#142): cards remain, and they go too.
  if (kind === 'done' && unfinished) lines.push('You won\u2019t be able to resume it.');
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
  const where = collectsRemovals(provider)
    ? `added to "${APPLE_REMOVED_PLAYLIST}" in Music`
    : `removed from ${source.type === 'playlist' ? `"${source.playlist.name}"` : 'your library'}`;
  if (failedCount === 0) return `These tracks have been ${where}.`;
  if (failedCount >= removedCount) {
    return `${failedCount.toLocaleString('en-US')} of ${removedCount.toLocaleString('en-US')} could not be ${where}; ${failedCount === 1 ? 'it is' : 'they are'} still in place.`;
  }
  return `${(removedCount - failedCount).toLocaleString('en-US')} of ${removedCount.toLocaleString('en-US')} have been ${where}; ${failedCount.toLocaleString('en-US')} could not be.`;
}

// ── Done screen (#142) ─────────────────────────────────

/** The sift's source as a sentence names it: your library, or "Mix". */
function sourceName(source: SiftSource): string {
  return source.type === 'playlist' ? `"${source.playlist.name}"` : 'your library';
}

/**
 * Done's title and subtitle. A sift ended early with Finish says how far it
 * got; a complete one names what was sifted, library or playlist.
 */
export function doneHeadline(source: SiftSource, reviewed: number, total: number): { title: string; subtitle: string } {
  const n = (x: number) => x.toLocaleString('en-US');
  if (reviewed < total) {
    return {
      title: 'Finished for now.',
      // "This sift", not the source: songs filtered out (#139, #143) or a
      // Review N skipped pass make the sift smaller than the source.
      subtitle: `You reviewed ${n(reviewed)} of the ${plural(total, 'song')} in this sift of ${sourceName(source)}. ${n(total - reviewed)} not reviewed.`,
    };
  }
  return {
    title: 'All done.',
    subtitle: `You reviewed every song in this sift of ${sourceName(source)}.`,
  };
}

/** Done's button that copies a playlist sift's keeps into "<name> - Sifted". */
export const SAVE_KEPT_TITLE = 'Save kept songs as a playlist';

/** Done's line once "Save kept songs as a playlist" worked. */
export function keptSaveMessage({ playlistName, sourceName, kept, added, notAdded, leftOut }: {
  playlistName: string;
  sourceName: string;
  kept: number;
  added: number;
  notAdded: number;
  leftOut: number;
}): string {
  const lines = [kept === 0
    ? leftOut > 0 ? `None of your kept songs are in "${sourceName}" any more.` : 'No kept songs to save yet.'
    : added > 0
      ? `Saved ${plural(added, 'song')} to "${playlistName}".`
      : notAdded > 0
        ? `Nothing new could be saved to "${playlistName}".`
        : `All kept songs are already in "${playlistName}".`];
  if (notAdded > 0) lines.push(`${plural(notAdded, 'song')} couldn\u2019t be added.`);
  if (kept > 0 && leftOut > 0) {
    lines.push(`${plural(leftOut, 'kept song')} no longer in "${sourceName}" ${leftOut === 1 ? 'was' : 'were'} left out.`);
  }
  return lines.join(' ');
}

/**
 * Why a save failed when Music refused some songs (worth another try),
 * after it added others; Done shows it with Retry.
 */
export function keptSaveRetryable({ added, refused, notAdded }: { added: number; refused: number; notAdded: number }): string {
  const lines = [
    `${plural(added, 'song')} added; ${plural(refused, 'song')} failed and can be tried again.`,
  ];
  if (notAdded > 0) lines.push(`${plural(notAdded, 'song')} couldn\u2019t be found.`);
  return lines.join(' ');
}

/** Done's line when that save failed; the button then says Retry. */
export function keptSaveFailure(playlistName: string, message: string): string {
  return `Couldn\u2019t save to "${playlistName}": ${message}`;
}

/** Done with nothing removed: point at the next thing to do. */
export function nothingRemovedNote(remaining: number, skipped: number): string {
  if (remaining > 0) return 'Nothing removed yet. Continue sifting to keep going.';
  if (skipped > 0) return 'Nothing removed this time. Review the songs you skipped, or start a new sift.';
  return 'Nothing removed this time. Start a new sift any time.';
}

/** What VoiceOver says after a decision (#146). */
export function decisionAnnouncement(trackName: string, decision: Decision): string {
  return `${trackName} ${{ keep: 'kept', remove: 'removed', skip: 'skipped' }[decision]}.`;
}

/** The Undo pill's message (#152): what Undo would take back. */
export function undoMessage(trackName: string, decision: Decision): string {
  return `${{ keep: 'Kept', remove: 'Removed', skip: 'Skipped' }[decision]} ${trackName}`;
}
