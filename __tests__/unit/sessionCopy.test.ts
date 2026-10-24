import {
  APPLE_REMOVED_PLAYLIST,
  decisionCounts,
  FINISH_IN_MUSIC_NOTE,
  FINISH_IN_MUSIC_STEPS,
  FINISH_IN_MUSIC_TITLE,
  FINISH_IN_MUSIC_WAYS,
  OPEN_MUSIC_FAILED,
  OPEN_MUSIC_TITLE,
  SHARE_LIST_TITLE,
  removedListText,
  discardConfirmation,
  FIRST_REMOVE_NOTE,
  playlistStartOverMessage,
  removeExplanation,
  removedListSubtitle,
  failedRemovalCount,
  legacyFailedRemovalIds,
  decisionAnnouncement,
  undoMessage,
  doneHeadline,
  keptSaveFailure,
  keptSaveMessage,
  keptSaveRetryable,
  ACCESS_REQUIRED,
  loadFailureMessage,
  nothingRemovedNote,
  SAVE_KEPT_TITLE,
  siftedPlaylistName,
} from '../../src/utils/sessionCopy';
import type { MusicProvider, SiftSource, Track } from '../../src/types';

const library: SiftSource = { type: 'library' };
// A provider whose Remove really deletes, or edits the playlist (none today:
// Spotify was removed, #140), for the copy that isn't Apple Music's.
const deleting = 'spotify' as unknown as MusicProvider;
const playlist: SiftSource = {
  type: 'playlist',
  playlist: { id: 'p1', name: 'Workout Mix', trackCount: 10 },
};
const RESUME = 'You won’t be able to resume it.';

describe('removeExplanation', () => {
  test('Apple Music library: removed songs are collected, not deleted', () => {
    expect(removeExplanation('apple-music', library)).toBe(
      `Removed songs are collected in "${APPLE_REMOVED_PLAYLIST}" for you to delete from your library in Music.`,
    );
  });

  test('an Apple Music playlist collects removed songs the same way; kept songs stay, to save at the end', () => {
    expect(removeExplanation('apple-music', playlist)).toBe(
      `Removed songs are collected in "${APPLE_REMOVED_PLAYLIST}" for you to delete from your library in Music. ` +
        'Kept songs stay, and you can save them as a playlist when you’re done.',
    );
  });

  test('a provider that deletes says so', () => {
    expect(removeExplanation(deleting, library)).toBe(
      'Removed songs are taken out of your library.',
    );
    expect(removeExplanation(deleting, playlist)).toBe(
      'Removed songs leave this playlist. Kept songs stay, and you can save them as a playlist when you’re done.',
    );
  });
});

describe('finishing a Remove in Music', () => {
  test('the first-remove note says the song stays put until deleted in Music', () => {
    expect(FIRST_REMOVE_NOTE).toBe(
      `Removed songs stay where they are for now: they're collected in "${APPLE_REMOVED_PLAYLIST}" so you can delete them from your library in Music.`,
    );
  });

  test("Done's Finish in Music card: the playlist, one way per device, and the setting that decides whether playlists empty too (#173)", () => {
    expect(FINISH_IN_MUSIC_TITLE).toBe('Finish in Music');
    expect(FINISH_IN_MUSIC_STEPS).toEqual([
      `1. Open the "${APPLE_REMOVED_PLAYLIST}" playlist.`,
      '2. Delete its songs from your library:',
    ]);
    expect(FINISH_IN_MUSIC_WAYS).toEqual([
      'On a Mac, select them all, then choose Delete from Library.',
      'On iPhone, press and hold each song, then choose Delete from Library.',
    ]);
    expect(FINISH_IN_MUSIC_NOTE).toBe(
      'Deleting from your library also takes them out of your playlists when Add & Delete Playlist Songs is on (in Settings, under Music). ' +
        'A song that isn\u2019t in your library has to be removed from its playlist instead.',
    );
    expect(OPEN_MUSIC_TITLE).toBe('Open Music');
    expect(OPEN_MUSIC_FAILED).toEqual({
      title: 'Couldn\u2019t open Music',
      message: 'Open the Music app yourself to finish.',
    });
    expect(SHARE_LIST_TITLE).toBe('Share List');
  });

  test('the removed list to share: one "Name \u2014 Artist" a line', () => {
    const a = { id: '1', name: 'Peaches', artist: 'Justin Bieber' } as Track;
    const b = { id: '2', name: 'drivers license', artist: 'Olivia Rodrigo' } as Track;
    expect(removedListText([a, b])).toBe(
      'Peaches \u2014 Justin Bieber\ndrivers license \u2014 Olivia Rodrigo',
    );
    expect(removedListText([])).toBe('');
  });

  test("a playlist's Start Over empties nothing: removed songs stay collected with Apple Music", () => {
    expect(playlistStartOverMessage('apple-music', 'Mix')).toBe(
      `This starts "Mix" over. Songs you removed stay in "${APPLE_REMOVED_PLAYLIST}".`,
    );
    expect(playlistStartOverMessage(deleting, 'Mix')).toBe(
      'This starts "Mix" over and clears the removal history for this playlist. This cannot be undone.',
    );
  });
});

describe('loadFailureMessage (#174)', () => {
  test("names what didn't load, never the service's own text", () => {
    const raw = new Error('Something MusicKit said.');
    expect(loadFailureMessage(library, raw)).toBe(
      'Couldn\u2019t load your library. Try again in a moment.',
    );
    expect(loadFailureMessage(playlist, raw)).toBe(
      'Couldn\u2019t load "Workout Mix". Try again in a moment.',
    );
    expect(loadFailureMessage(library, 'not an Error')).toBe(
      'Couldn\u2019t load your library. Try again in a moment.',
    );
  });

  test('a playlist gone from the library says to pick another, not to try again', () => {
    const gone = new Error('No tracks found for the given IDs.');
    expect(loadFailureMessage(playlist, gone)).toBe(
      'Couldn\u2019t find "Workout Mix" in your library. Pick another playlist.',
    );
    // The library itself can't be gone: the general words.
    expect(loadFailureMessage(library, gone)).toBe(
      'Couldn\u2019t load your library. Try again in a moment.',
    );
  });

  test('access taken away says where to allow it', () => {
    const denied = new Error(
      'Music library access not authorized. Allow access in Settings > Privacy & Security > Media & Apple Music.',
    );
    expect(loadFailureMessage(library, denied)).toBe(
      `${ACCESS_REQUIRED} Allow it in Settings, under Privacy & Security, Media & Apple Music.`,
    );
  });

  test('a lost connection says so', () => {
    expect(
      loadFailureMessage(playlist, new Error('The Internet connection appears to be offline.')),
    ).toBe(
      'Couldn\u2019t load "Workout Mix": Music can\u2019t be reached. Check your connection, then try again.',
    );
  });
});

describe('decisionCounts', () => {
  test('counts each list and the total', () => {
    expect(decisionCounts({ kept: [1, 2], removed: [3], skipped: [] })).toEqual({
      kept: 2,
      removed: 1,
      skipped: 0,
      total: 3,
    });
  });
});

describe('discardConfirmation', () => {
  const counts = { kept: 782, removed: 1563, skipped: 0, total: 2345 };

  test('a new sift over an Apple library sift: counts, where removals are, no resume', () => {
    expect(discardConfirmation('apple-music', library, counts, 'new-sift')).toEqual({
      title: 'Discard your current sift?',
      message:
        'You have 2,345 decisions so far (782 kept, 1,563 removed, 0 skipped) in your sift of your library. ' +
        `Songs you removed stay in "${APPLE_REMOVED_PLAYLIST}". ` +
        'Starting a new sift replaces it, and you won’t be able to resume it.',
      confirm: 'Discard',
    });
  });

  test('a playlist sift being replaced says nothing about "- Sifted": a keep wrote nothing there', () => {
    const message = discardConfirmation('apple-music', playlist, counts, 'new-sift').message;
    expect(message).toBe(
      'You have 2,345 decisions so far (782 kept, 1,563 removed, 0 skipped) in your sift of "Workout Mix". ' +
        `Songs you removed stay in "${APPLE_REMOVED_PLAYLIST}". ` +
        'Starting a new sift replaces it, and you won’t be able to resume it.',
    );
  });

  test('leaving Done after Finish says the rest of the sift goes too (#142)', () => {
    const finished = discardConfirmation('apple-music', library, counts, 'done', {
      unfinished: true,
    }).message;
    expect(
      finished.endsWith(
        'Starting over clears this summary and its Restore buttons. You won’t be able to resume it.',
      ),
    ).toBe(true);
    const complete = discardConfirmation('apple-music', library, counts, 'done').message;
    expect(complete).not.toContain('resume');
  });

  test('starting over a playlist says it clears the removal history, and nothing about "- Sifted"', () => {
    const copy = discardConfirmation('apple-music', playlist, counts, 'start-over');
    expect(copy.title).toBe('Start Over?');
    expect(copy.confirm).toBe('Discard and Start Over');
    // Apple Music: removed songs stay collected, so nothing about history.
    expect(copy.message).toBe(
      'You have 2,345 decisions so far (782 kept, 1,563 removed, 0 skipped) in your sift of "Workout Mix". ' +
        `Songs you removed stay in "${APPLE_REMOVED_PLAYLIST}". ${RESUME}`,
    );
    const deleted = discardConfirmation(deleting, playlist, counts, 'start-over').message;
    expect(deleted).toBe(
      'You have 2,345 decisions so far (782 kept, 1,563 removed, 0 skipped) in your sift of "Workout Mix". ' +
        `Starting over clears this playlist’s removal history. ${RESUME}`,
    );
  });

  test("leaving a playlist sift's Done: the removal history goes with the summary only where it isn't collected", () => {
    const few = { kept: 2, removed: 1, skipped: 0, total: 3 };
    expect(discardConfirmation('apple-music', playlist, few, 'done').message).toBe(
      'You made 3 decisions (2 kept, 1 removed, 0 skipped) in your sift of "Workout Mix". ' +
        `Songs you removed stay in "${APPLE_REMOVED_PLAYLIST}". ` +
        'Starting over clears this summary and its Restore buttons.',
    );
    expect(discardConfirmation(deleting, playlist, few, 'done').message).toBe(
      'You made 3 decisions (2 kept, 1 removed, 0 skipped) in your sift of "Workout Mix". Songs you removed stay removed. ' +
        'Starting over clears this summary, its Restore buttons and this playlist’s removal history.',
    );
  });

  test('a provider that deletes: removed songs stay removed', () => {
    const message = discardConfirmation(deleting, library, counts, 'new-sift').message;
    expect(message).toContain('Songs you removed stay removed.');
  });

  test('no removals: no line about removed songs, and one decision is singular', () => {
    const message = discardConfirmation(
      'apple-music',
      library,
      { kept: 1, removed: 0, skipped: 0, total: 1 },
      'start-over',
    ).message;
    expect(message).toBe(
      `You have 1 decision so far (1 kept, 0 removed, 0 skipped) in your sift of your library. ${RESUME}`,
    );
  });

  test('leaving a finished sift says what goes: the summary and Restore', () => {
    const copy = discardConfirmation(
      'apple-music',
      library,
      { kept: 2, removed: 1, skipped: 0, total: 3 },
      'done',
    );
    expect(copy.title).toBe('Start Over?');
    expect(copy.message).toBe(
      `You made 3 decisions (2 kept, 1 removed, 0 skipped) in your sift of your library. Songs you removed stay in "${APPLE_REMOVED_PLAYLIST}". ` +
        'Starting over clears this summary and its Restore buttons.',
    );
  });
});

const track = (id: string, name: string): Track => ({
  id,
  name,
  artist: 'Artist',
  album: 'Album',
  duration: 200,
  playCount: 0,
  dateAdded: '2020-01-01T00:00:00.000Z',
});

describe('failedRemovalCount', () => {
  test('counts removed tracks whose removal failed, by id', () => {
    expect(
      failedRemovalCount([track('1', 'A'), track('2', 'B'), track('3', 'C')], ['1', '3']),
    ).toBe(2);
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
    expect(
      legacyFailedRemovalIds(
        [track('1', 'A'), track('2', 'B'), track('3', 'C')],
        ['B', 'C: offline'],
      ),
    ).toEqual(['2']);
    expect(legacyFailedRemovalIds([track('1', 'A')], [])).toEqual([]);
  });
});

describe('removedListSubtitle', () => {
  test('all landed', () => {
    expect(removedListSubtitle('apple-music', library, 5, 0)).toBe(
      `These tracks have been added to "${APPLE_REMOVED_PLAYLIST}" in Music.`,
    );
    // A playlist sift's removals are collected the same way.
    expect(removedListSubtitle('apple-music', playlist, 5, 0)).toBe(
      `These tracks have been added to "${APPLE_REMOVED_PLAYLIST}" in Music.`,
    );
    expect(removedListSubtitle(deleting, playlist, 5, 0)).toBe(
      'These tracks have been removed from "Workout Mix".',
    );
    expect(removedListSubtitle(deleting, library, 5, 0)).toBe(
      'These tracks have been removed from your library.',
    );
  });

  test('some failed: real counts, never "most"', () => {
    expect(removedListSubtitle('apple-music', playlist, 1200, 3)).toBe(
      `1,197 of 1,200 have been added to "${APPLE_REMOVED_PLAYLIST}" in Music; 3 could not be.`,
    );
    expect(removedListSubtitle(deleting, playlist, 1200, 3)).toBe(
      '1,197 of 1,200 have been removed from "Workout Mix"; 3 could not be.',
    );
  });

  test('all failed', () => {
    expect(removedListSubtitle('apple-music', library, 3, 3)).toBe(
      `3 of 3 could not be added to "${APPLE_REMOVED_PLAYLIST}" in Music; they are still in place.`,
    );
    expect(removedListSubtitle('apple-music', library, 1, 1)).toBe(
      `1 of 1 could not be added to "${APPLE_REMOVED_PLAYLIST}" in Music; it is still in place.`,
    );
  });

  test('never claims more failures than removals', () => {
    expect(removedListSubtitle('apple-music', library, 3, 4)).toBe(
      `3 of 3 could not be added to "${APPLE_REMOVED_PLAYLIST}" in Music; they are still in place.`,
    );
  });
});

describe('Done copy (#142)', () => {
  test('doneHeadline: a sift ended early says how far it got', () => {
    expect(doneHeadline(library, 37, 2655)).toEqual({
      title: 'Finished for now.',
      subtitle:
        'You reviewed 37 of the 2,655 songs in this sift of your library. 2,618 not reviewed.',
    });
    expect(doneHeadline(playlist, 1, 1).title).toBe('All done.');
  });

  test('doneHeadline: a complete sift names what was sifted', () => {
    expect(doneHeadline(library, 10, 10).subtitle).toBe(
      'You reviewed every song in this sift of your library.',
    );
    expect(doneHeadline(playlist, 10, 10).subtitle).toBe(
      'You reviewed every song in this sift of "Workout Mix".',
    );
  });

  test('the kept-songs playlist is named for its source', () => {
    expect(siftedPlaylistName('Workout Mix')).toBe('Workout Mix - Sifted');
    expect(SAVE_KEPT_TITLE).toBe('Save kept songs as a playlist');
  });

  test('keptSaveMessage says how many were saved, or that all were there already', () => {
    const base = { playlistName: 'Mix - Sifted', sourceName: 'Mix', notAdded: 0, leftOut: 0 };
    expect(keptSaveMessage({ ...base, kept: 4, added: 3 })).toBe(
      'Saved 3 songs to "Mix - Sifted".',
    );
    expect(keptSaveMessage({ ...base, kept: 1, added: 1 })).toBe('Saved 1 song to "Mix - Sifted".');
    expect(keptSaveMessage({ ...base, kept: 1200, added: 1200 })).toBe(
      'Saved 1,200 songs to "Mix - Sifted".',
    );
    expect(keptSaveMessage({ ...base, kept: 4, added: 0 })).toBe(
      'All kept songs are already in "Mix - Sifted".',
    );
    expect(keptSaveMessage({ ...base, kept: 0, added: 0 })).toBe('No kept songs to save yet.');
  });

  test("keptSaveMessage counts the songs Music couldn't add, and the keeps no longer in the playlist", () => {
    const base = { playlistName: 'Mix - Sifted', sourceName: 'Mix' };
    expect(keptSaveMessage({ ...base, kept: 5, added: 3, notAdded: 2, leftOut: 0 })).toBe(
      'Saved 3 songs to "Mix - Sifted". 2 songs couldn’t be added.',
    );
    expect(keptSaveMessage({ ...base, kept: 1, added: 0, notAdded: 1, leftOut: 0 })).toBe(
      'Nothing new could be saved to "Mix - Sifted". 1 song couldn’t be added.',
    );
    expect(keptSaveMessage({ ...base, kept: 3, added: 3, notAdded: 0, leftOut: 1 })).toBe(
      'Saved 3 songs to "Mix - Sifted". 1 kept song no longer in "Mix" was left out.',
    );
    expect(keptSaveMessage({ ...base, kept: 3, added: 0, notAdded: 0, leftOut: 2 })).toBe(
      'All kept songs are already in "Mix - Sifted". 2 kept songs no longer in "Mix" were left out.',
    );
    expect(keptSaveMessage({ ...base, kept: 0, added: 0, notAdded: 0, leftOut: 2 })).toBe(
      'None of your kept songs are in "Mix" any more.',
    );
  });

  test('keptSaveRetryable says what was added and that the refused ones can be tried again', () => {
    expect(keptSaveRetryable({ added: 3, refused: 2, notAdded: 0 })).toBe(
      '3 songs added; 2 songs failed and can be tried again.',
    );
    expect(keptSaveRetryable({ added: 0, refused: 1, notAdded: 1 })).toBe(
      '0 songs added; 1 song failed and can be tried again. 1 song couldn’t be found.',
    );
  });

  test('keptSaveFailure names the playlist and the reason', () => {
    expect(keptSaveFailure('Mix - Sifted', 'Offline.')).toBe(
      'Couldn’t save to "Mix - Sifted": Offline.',
    );
  });

  test('nothingRemovedNote points at the next action', () => {
    expect(nothingRemovedNote(5, 2)).toBe('Nothing removed yet. Continue sifting to keep going.');
    expect(nothingRemovedNote(0, 2)).toBe(
      'Nothing removed this time. Review the songs you skipped, or start a new sift.',
    );
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

describe('undoMessage (#152)', () => {
  test('says what Undo would take back', () => {
    expect(undoMessage('Peaches', 'remove')).toBe('Removed Peaches');
    expect(undoMessage('Peaches', 'keep')).toBe('Kept Peaches');
    expect(undoMessage('Peaches', 'skip')).toBe('Skipped Peaches');
  });
});
