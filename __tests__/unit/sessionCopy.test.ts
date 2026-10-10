import {
  APPLE_REMOVED_PLAYLIST,
  decisionCounts,
  discardConfirmation,
  removeExplanation,
  removedListSubtitle,
  unsyncedCount,
  failedRemovalCount,
  legacyFailedRemovalIds,
  decisionAnnouncement,
  doneHeadline,
  keptDestination,
  nothingRemovedNote,
} from '../../src/utils/sessionCopy';
import type { SiftSource, Track } from '../../src/types';

const library: SiftSource = { type: 'library' };
const playlist: SiftSource = { type: 'playlist', playlist: { id: 'p1', name: 'Workout Mix', trackCount: 10 } };
const RESUME = 'You won’t be able to resume it.';

describe('removeExplanation', () => {
  test('Apple Music library: removed songs are collected, not deleted', () => {
    expect(removeExplanation('apple-music', library)).toBe(
      `Removed songs are collected in "${APPLE_REMOVED_PLAYLIST}" for you to delete in Music.`,
    );
  });

  test('a playlist names its "- Sifted" companion', () => {
    expect(removeExplanation('apple-music', playlist)).toBe(
      'Removed songs leave this playlist; kept songs are collected in "Workout Mix - Sifted".',
    );
  });

});

describe('decisionCounts', () => {
  test('counts each list, the total and parked keeps', () => {
    expect(decisionCounts({ kept: [1, 2], removed: [3], skipped: [] })).toEqual({
      kept: 2, removed: 1, skipped: 0, total: 3, pendingKeeps: 0,
    });
    expect(decisionCounts({ kept: [1], removed: [], skipped: [], pendingKeeps: [1] }).pendingKeeps).toBe(1);
  });
});

describe('discardConfirmation', () => {
  const counts = { kept: 782, removed: 1563, skipped: 0, total: 2345, pendingKeeps: 0 };

  test('a new sift over an Apple library sift: counts, where removals are, no resume', () => {
    expect(discardConfirmation('apple-music', library, counts, 'new-sift')).toEqual({
      title: 'Discard your current sift?',
      message:
        'You have 2,345 decisions so far (782 kept, 1,563 removed, 0 skipped) in your sift of your library. '
        + `Songs you removed stay in "${APPLE_REMOVED_PLAYLIST}". `
        + 'Starting a new sift replaces it, and you won’t be able to resume it.',
      confirm: 'Discard',
    });
  });

  test('re-sifting another playlist over a sift also says what it empties', () => {
    const message = discardConfirmation('apple-music', library, counts, 'new-sift', { alsoEmpties: 'Road Trip' }).message;
    expect(message).toContain('It also empties "Road Trip - Sifted" and clears that playlist\'s removal history.');
  });

  test('keeps that never reached the "- Sifted" playlist are called out', () => {
    const message = discardConfirmation('apple-music', playlist, { ...counts, pendingKeeps: 3 }, 'new-sift').message;
    expect(message).toContain('3 kept songs never reached "Workout Mix - Sifted" and would be lost.');
  });

  test('leaving Done after Finish says the rest of the sift goes too (#142)', () => {
    const finished = discardConfirmation('apple-music', library, counts, 'done', { unfinished: true }).message;
    expect(finished.endsWith('Starting over clears this summary and its Restore buttons. You won’t be able to resume it.')).toBe(true);
    const complete = discardConfirmation('apple-music', library, counts, 'done').message;
    expect(complete).not.toContain('resume');
  });

  test('starting over a playlist says what it empties', () => {
    const copy = discardConfirmation('apple-music', playlist, counts, 'start-over');
    expect(copy.title).toBe('Start Over?');
    expect(copy.confirm).toBe('Discard and Start Over');
    expect(copy.message).toContain('in your sift of "Workout Mix".');
    expect(copy.message).toContain('Starting over empties "Workout Mix - Sifted" and clears this playlist\'s removal history.');
    expect(copy.message.endsWith(RESUME)).toBe(true);
  });

  test('no removals: no line about removed songs, and one decision is singular', () => {
    const message = discardConfirmation('apple-music', library, { kept: 1, removed: 0, skipped: 0, total: 1, pendingKeeps: 0 }, 'start-over').message;
    expect(message).toBe(`You have 1 decision so far (1 kept, 0 removed, 0 skipped) in your sift of your library. ${RESUME}`);
  });

  test('leaving a finished sift says what goes: the summary and Restore', () => {
    const copy = discardConfirmation('apple-music', library, { kept: 2, removed: 1, skipped: 0, total: 3, pendingKeeps: 0 }, 'done');
    expect(copy.title).toBe('Start Over?');
    expect(copy.message).toBe(
      `You made 3 decisions (2 kept, 1 removed, 0 skipped) in your sift of your library. Songs you removed stay in "${APPLE_REMOVED_PLAYLIST}". `
      + 'Starting over clears this summary and its Restore buttons.',
    );
  });
});

const track = (id: string, name: string): Track => ({
  id, name, artist: 'Artist', album: 'Album', duration: 200, playCount: 0, dateAdded: '2020-01-01T00:00:00.000Z',
});

describe('failedRemovalCount', () => {
  test('counts removed tracks whose removal failed, by id', () => {
    expect(failedRemovalCount([track('1', 'A'), track('2', 'B'), track('3', 'C')], ['1', '3'])).toBe(2);
    expect(failedRemovalCount([track('1', 'A')], [])).toBe(0);
  });

  test('two removed songs sharing a name count once when one failed', () => {
    expect(failedRemovalCount([track('1', 'Intro'), track('2', 'Intro')], ['2'])).toBe(1);
  });

  test('ignores a track restored after its removal failed', () => {
    // "1" failed to remove, then was restored: no longer in removed.
    expect(failedRemovalCount([track('2', 'B')], ['1'])).toBe(0);
  });
});

describe('legacyFailedRemovalIds', () => {
  test('the removed tracks whose name is a removal error', () => {
    expect(legacyFailedRemovalIds([track('1', 'A'), track('2', 'B'), track('3', 'C')], ['B', 'C: offline'])).toEqual(['2']);
    expect(legacyFailedRemovalIds([track('1', 'A')], [])).toEqual([]);
  });
});

describe('unsyncedCount', () => {
  test('adds failed removals and parked keeps', () => {
    expect(unsyncedCount([track('1', 'A'), track('2', 'B')], ['1', '2'], [track('3', 'C')])).toBe(3);
    expect(unsyncedCount([], [], [])).toBe(0);
  });

  test('counts failed removals the way Done does', () => {
    expect(unsyncedCount([track('1', 'Intro'), track('2', 'Intro')], ['2'], [])).toBe(1);
  });
});

describe('removedListSubtitle', () => {
  test('all landed', () => {
    expect(removedListSubtitle('apple-music', library, 5, 0)).toBe(`These tracks have been moved to "${APPLE_REMOVED_PLAYLIST}" in Music.`);
    expect(removedListSubtitle('apple-music', playlist, 5, 0)).toBe('These tracks have been removed from "Workout Mix".');
  });

  test('some failed: real counts, never "most"', () => {
    expect(removedListSubtitle('apple-music', playlist, 1200, 3)).toBe('1,197 of 1,200 have been removed from "Workout Mix"; 3 could not be.');
  });

  test('all failed', () => {
    expect(removedListSubtitle('apple-music', library, 3, 3)).toBe(`3 of 3 could not be moved to "${APPLE_REMOVED_PLAYLIST}" in Music; they are still in place.`);
    expect(removedListSubtitle('apple-music', library, 1, 1)).toBe(`1 of 1 could not be moved to "${APPLE_REMOVED_PLAYLIST}" in Music; it is still in place.`);
  });

  test('never claims more failures than removals', () => {
    expect(removedListSubtitle('apple-music', library, 3, 4)).toBe(`3 of 3 could not be moved to "${APPLE_REMOVED_PLAYLIST}" in Music; they are still in place.`);
  });
});

describe('Done copy (#142)', () => {
  test('doneHeadline: a sift ended early says how far it got', () => {
    expect(doneHeadline(library, 37, 2655)).toEqual({
      title: 'Finished for now.',
      subtitle: 'You reviewed 37 of the 2,655 songs in this sift of your library. 2,618 not reviewed.',
    });
    expect(doneHeadline(playlist, 1, 1).title).toBe('All done.');
  });

  test('doneHeadline: a complete sift names what was sifted', () => {
    expect(doneHeadline(library, 10, 10).subtitle).toBe('You reviewed every song in this sift of your library.');
    expect(doneHeadline(playlist, 10, 10).subtitle).toBe('You reviewed every song in this sift of "Workout Mix".');
  });

  test('keptDestination: only a playlist sift copies keeps anywhere', () => {
    expect(keptDestination(playlist, 3)).toBe('Kept songs go to "Workout Mix - Sifted".');
    expect(keptDestination(playlist, 0)).toBeNull();
    expect(keptDestination(library, 3)).toBeNull();
  });

  test('nothingRemovedNote points at the next action', () => {
    expect(nothingRemovedNote(5, 2)).toBe('Nothing removed yet. Continue sifting to keep going.');
    expect(nothingRemovedNote(0, 2)).toBe('Nothing removed this time. Review the songs you skipped, or start a new sift.');
    expect(nothingRemovedNote(0, 0)).toBe('Nothing removed this time. Start a new sift any time.');
  });
});

describe('decisionAnnouncement (#146)', () => {
  test('names the song and what happened', () => {
    expect(decisionAnnouncement('Peaches', 'keep')).toBe('Peaches kept.');
    expect(decisionAnnouncement('Peaches', 'remove')).toBe('Peaches removed.');
    expect(decisionAnnouncement('Peaches', 'skip')).toBe('Peaches skipped.');
  });
});
