import { collectedRemovalIds, collectsRemovals, deletedInMusicNote, deletionCandidates } from '../../src/utils/libraryRemovals';
import type { MusicProvider, RemovalRecord, Track } from '../../src/types';

const track = (id: string, name: string): Track => ({
  id, name, artist: 'Artist', album: 'Album', duration: 200, playCount: 0, dateAdded: '2020-01-01T00:00:00.000Z',
});

const record = (t: Track, overrides: Partial<RemovalRecord> = {}): RemovalRecord => ({
  track: t,
  source: { type: 'library' },
  provider: 'apple-music',
  removedAt: '2026-10-01T12:00:00.000Z',
  ...overrides,
});

describe('collectedRemovalIds', () => {
  test('collects the ids of library removals with this provider', () => {
    const ids = collectedRemovalIds([record(track('a1', 'Peaches')), record(track('a2', 'Stay'))], 'apple-music');
    expect([...ids].sort()).toEqual(['a1', 'a2']);
  });

  const roadTrip = { type: 'playlist' as const, playlist: { id: 'p1', name: 'Road Trip', trackCount: 3 } };

  test('collects playlist removals that went to "Sift — Removed" too', () => {
    const ids = collectedRemovalIds([record(track('a1', 'Peaches'), { source: roadTrip, collected: true })], 'apple-music');
    expect([...ids]).toEqual(['a1']);
  });

  test('ignores older playlist removals: MusicKit refused the edit, so the song never left', () => {
    const ids = collectedRemovalIds([
      record(track('a1', 'Peaches'), { source: roadTrip }),
      record(track('a2', 'Stay'), { source: roadTrip, collected: false }),
    ], 'apple-music');
    expect(ids.size).toBe(0);
  });

  test("ignores another provider's removals", () => {
    // Spotify was removed (#140), but a history file can still hold its
    // records until they're validated out.
    const spotify = 'spotify' as unknown as MusicProvider;
    const ids = collectedRemovalIds([record(track('a1', 'Peaches'), { provider: spotify })], 'apple-music');
    expect(ids.size).toBe(0);
  });

  test('matches by id only, so a second copy of a duplicated song is not removed', () => {
    const ids = collectedRemovalIds([record(track('copy-a', 'Peaches'))], 'apple-music');
    expect(ids.has('copy-a')).toBe(true);
    // Same name, artist and duration, different library id.
    expect(ids.has('copy-b')).toBe(false);
  });

  test('empty history removes nothing', () => {
    expect(collectedRemovalIds([], 'apple-music').size).toBe(0);
  });
});

describe('collectsRemovals', () => {
  test('Apple Music collects removals in "Sift — Removed"', () => {
    expect(collectsRemovals('apple-music')).toBe(true);
  });

  test('another provider does not', () => {
    expect(collectsRemovals('spotify' as unknown as MusicProvider)).toBe(false);
  });
});

describe('deletionCandidates (#183)', () => {
  const roadTrip = { type: 'playlist' as const, playlist: { id: 'p1', name: 'Road Trip', trackCount: 3 } };

  test('the collected library songs, each once', () => {
    const peaches = track('a1', 'Peaches');
    const stay = track('a2', 'Stay');
    const candidates = deletionCandidates([
      record(peaches),
      record(stay, { source: roadTrip, collected: true }),
      // Removed again from a playlist sift: still one song.
      record(peaches, { source: roadTrip, collected: true }),
    ], 'apple-music');
    expect(candidates).toEqual([peaches, stay]);
  });

  test('not a playlist entry that isn\'t a library song: a lookup can\'t tell it was deleted', () => {
    const video = { ...track('v1', 'A Video'), dateAdded: '' };
    expect(deletionCandidates([record(video, { source: roadTrip, collected: true })], 'apple-music')).toEqual([]);
  });

  test('not an older playlist removal that never left the playlist, nor another provider\'s', () => {
    expect(deletionCandidates([
      record(track('a1', 'Peaches'), { source: roadTrip }),
      record(track('a2', 'Stay'), { provider: 'spotify' as MusicProvider }),
    ], 'apple-music')).toEqual([]);
  });
});

describe('deletedInMusicNote (#183)', () => {
  test('says how many songs were deleted, one or more', () => {
    expect(deletedInMusicNote(1)).toBe('You deleted 1 song from your library in Music.');
    expect(deletedInMusicNote(12)).toBe('You deleted 12 songs from your library in Music.');
  });
});
