import { libraryRemovedIds } from '../../src/utils/libraryRemovals';
import type { RemovalRecord, Track } from '../../src/types';

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

describe('libraryRemovedIds', () => {
  test('collects the ids of library removals with this provider', () => {
    const ids = libraryRemovedIds([record(track('a1', 'Peaches')), record(track('a2', 'Stay'))], 'apple-music');
    expect([...ids].sort()).toEqual(['a1', 'a2']);
  });

  test('ignores playlist removals: removing from a playlist leaves the song in the library', () => {
    const ids = libraryRemovedIds([
      record(track('a1', 'Peaches'), {
        source: { type: 'playlist', playlist: { id: 'p1', name: 'Road Trip', trackCount: 3 } },
      }),
    ], 'apple-music');
    expect(ids.size).toBe(0);
  });

  test("ignores another provider's removals", () => {
    const ids = libraryRemovedIds([record(track('a1', 'Peaches'), { provider: 'spotify' })], 'apple-music');
    expect(ids.size).toBe(0);
  });

  test('matches by id only, so a second copy of a duplicated song is not removed', () => {
    const ids = libraryRemovedIds([record(track('copy-a', 'Peaches'))], 'apple-music');
    expect(ids.has('copy-a')).toBe(true);
    // Same name, artist and duration, different library id.
    expect(ids.has('copy-b')).toBe(false);
  });

  test('empty history removes nothing', () => {
    expect(libraryRemovedIds([], 'apple-music').size).toBe(0);
  });
});
