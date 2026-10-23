import fc from 'fast-check';
import { primaryArtist, sortName, sortTracks } from '../../src/utils/sorting';
import type { SortOrder, Track } from '../../src/types';

// Property-based tests: whatever the library holds (missing or garbled
// dates, empty names, "The" bands, featured guests, missing track numbers),
// a sort only reorders it and puts it in the order it promises. The example
// tests in sorting.test.ts pin the orders themselves.

const ORDERS: SortOrder[] = [
  'least-played',
  'most-played',
  'oldest',
  'newest',
  'artist',
  'album',
  'random',
];

const name = fc.oneof(
  fc.constantFrom('', 'The Weeknd', 'the xx', 'Doja Cat feat. SZA', 'ABBA', 'Album 10', 'Album 9'),
  fc.string({ maxLength: 12 }),
);
const dateAdded = fc.oneof(
  fc.constant(''),
  fc.constant('not a date'),
  fc
    .integer({ min: Date.UTC(2000, 0, 1), max: Date.UTC(2030, 0, 1) })
    .map((ms) => new Date(ms).toISOString()),
);

const tracks = fc
  .array(
    fc.record({
      name,
      artist: name,
      album: name,
      playCount: fc.nat({ max: 50 }),
      dateAdded,
      trackNumber: fc.option(fc.integer({ min: 1, max: 20 }), { nil: undefined }),
      discNumber: fc.option(fc.integer({ min: 1, max: 3 }), { nil: undefined }),
    }),
    { maxLength: 25 },
  )
  // Ids are the providers' unique keys; the index makes them unique here.
  .map((list) => list.map((t, i): Track => ({ ...t, id: `t${i}`, duration: 200 })));

// The sort's own collator (utils/sorting), to tell when two names tie.
const collator = new Intl.Collator('en-US', { sensitivity: 'base', numeric: true });

const ids = (list: Track[]) => list.map((t) => t.id);
const dateMs = (t: Track) => {
  const ms = t.dateAdded ? new Date(t.dateAdded).getTime() : NaN;
  return Number.isNaN(ms) ? null : ms;
};

describe('sortTracks properties', () => {
  test('every order returns the same tracks, reordered, and leaves its input alone', () => {
    fc.assert(
      fc.property(tracks, fc.constantFrom(...ORDERS), (list, order) => {
        const before = ids(list);
        const sorted = sortTracks(list, order);
        expect(ids(list)).toEqual(before);
        expect(ids(sorted).sort()).toEqual([...before].sort());
      }),
    );
  });

  test('every order but random is settled: sorting its result again changes nothing', () => {
    fc.assert(
      fc.property(
        tracks,
        fc.constantFrom(...ORDERS.filter((o) => o !== 'random')),
        (list, order) => {
          const once = sortTracks(list, order);
          expect(ids(sortTracks(once, order))).toEqual(ids(once));
        },
      ),
    );
  });

  test('the play-count orders run in play-count order', () => {
    fc.assert(
      fc.property(tracks, (list) => {
        const least = sortTracks(list, 'least-played').map((t) => t.playCount);
        const most = sortTracks(list, 'most-played').map((t) => t.playCount);
        expect(least).toEqual([...least].sort((a, b) => a - b));
        expect(most).toEqual([...least].reverse());
      }),
    );
  });

  test('the date orders put dated songs in date order, then every undated one', () => {
    fc.assert(
      fc.property(tracks, fc.constantFrom<1 | -1>(1, -1), (list, direction) => {
        const sorted = sortTracks(list, direction === 1 ? 'oldest' : 'newest').map(dateMs);
        const dated = sorted.filter((ms): ms is number => ms !== null);
        // Dated first: no dated song after an undated one.
        expect(sorted.slice(0, dated.length)).toEqual(dated);
        for (let i = 1; i < dated.length; i++) {
          expect((dated[i] - dated[i - 1]) * direction).toBeGreaterThanOrEqual(0);
        }
      }),
    );
  });

  test('the artist order keeps each filed-under artist together', () => {
    fc.assert(
      fc.property(tracks, (list) => {
        const runs = sortTracks(list, 'artist').map((t) => sortName(primaryArtist(t.artist)));
        // Two names are one artist when the sort's collator ties them ('0'
        // and '00', 'é' and 'e'); one that comes back after a different
        // one splits that artist.
        const same = (a: string, b: string) => collator.compare(a, b) === 0;
        const seen: string[] = [];
        runs.forEach((key, i) => {
          if (i > 0 && !same(key, runs[i - 1])) {
            expect(seen.some((earlier) => same(earlier, key))).toBe(false);
          }
          seen.push(key);
        });
      }),
      {
        // Names the collator ties but text doesn't: '0' and '00' are one
        // artist, so their albums mustn't split them.
        examples: [
          [
            [
              { artist: '0', album: 'a' },
              { artist: '00', album: 'b' },
              { artist: '0', album: 'c' },
            ].map((t, i): Track => ({
              ...t,
              id: `t${i}`,
              name: 'x',
              duration: 200,
              playCount: 0,
              dateAdded: '',
            })),
          ],
        ],
      },
    );
  });
});
