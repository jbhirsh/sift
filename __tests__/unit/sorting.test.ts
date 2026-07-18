import { sortTracks } from '../../src/utils/sorting';
import { MOCK_TRACKS } from '../../src/utils/mockData';

describe('sortTracks', () => {
  test('least-played sorts ascending by playCount', () => {
    const sorted = sortTracks(MOCK_TRACKS, 'least-played');
    expect(sorted[0].name).toBe('Do I Wanna Know?'); // playCount 5
    expect(sorted[1].name).toBe('Electric Feel');    // playCount 42
    expect(sorted[2].name).toBe('Midnight City');    // playCount 87
  });

  test('most-played sorts descending by playCount', () => {
    const sorted = sortTracks(MOCK_TRACKS, 'most-played');
    expect(sorted[0].name).toBe('Midnight City');    // playCount 87
    expect(sorted[1].name).toBe('Electric Feel');    // playCount 42
    expect(sorted[2].name).toBe('Do I Wanna Know?'); // playCount 5
  });

  test('oldest sorts ascending by dateAdded', () => {
    const sorted = sortTracks(MOCK_TRACKS, 'oldest');
    expect(sorted[0].name).toBe('Do I Wanna Know?'); // 2019-06-08
    expect(sorted[1].name).toBe('Electric Feel');    // 2020-01-26
    expect(sorted[2].name).toBe('Midnight City');    // 2020-09-13
  });

  test('newest sorts descending by dateAdded', () => {
    const sorted = sortTracks(MOCK_TRACKS, 'newest');
    expect(sorted[0].name).toBe('Midnight City');    // 2020-09-13
    expect(sorted[1].name).toBe('Electric Feel');    // 2020-01-26
    expect(sorted[2].name).toBe('Do I Wanna Know?'); // 2019-06-08
  });

  test('random returns all tracks (length matches)', () => {
    const sorted = sortTracks(MOCK_TRACKS, 'random');
    expect(sorted).toHaveLength(MOCK_TRACKS.length);
    // Verify all original tracks are present
    for (const track of MOCK_TRACKS) {
      expect(sorted.find((t) => t.id === track.id)).toBeDefined();
    }
  });

  test('sortTracks does not mutate the original array', () => {
    const original = [...MOCK_TRACKS];
    sortTracks(MOCK_TRACKS, 'most-played');
    expect(MOCK_TRACKS).toEqual(original);
  });

  describe('tracks with missing dateAdded (non-library playlist tracks)', () => {
    // The native bridge emits dateAdded: "" for tracks that are not in the
    // user's library. new Date('').getTime() is NaN, which used to make the
    // date comparators return NaN and the sort order undefined.
    const noDate = { ...MOCK_TRACKS[0], id: 'no-date', name: 'No Date', dateAdded: '' };
    const noDate2 = { ...MOCK_TRACKS[1], id: 'no-date-2', name: 'No Date 2', dateAdded: '' };

    test('oldest puts tracks without a date last, dated tracks still ordered', () => {
      const sorted = sortTracks([noDate, ...MOCK_TRACKS, noDate2], 'oldest');
      expect(sorted[0].name).toBe('Do I Wanna Know?');
      expect(sorted[1].name).toBe('Electric Feel');
      expect(sorted[2].name).toBe('Midnight City');
      expect(sorted.slice(3).map((t) => t.id).sort()).toEqual(['no-date', 'no-date-2']);
    });

    test('newest also puts tracks without a date last', () => {
      const sorted = sortTracks([noDate, ...MOCK_TRACKS], 'newest');
      expect(sorted[0].name).toBe('Midnight City');
      expect(sorted[1].name).toBe('Electric Feel');
      expect(sorted[2].name).toBe('Do I Wanna Know?');
      expect(sorted[3].id).toBe('no-date');
    });

    test('an unparseable dateAdded is treated as missing, not NaN', () => {
      const junkDate = { ...MOCK_TRACKS[0], id: 'junk', name: 'Junk', dateAdded: 'not-a-date' };
      const sorted = sortTracks([junkDate, ...MOCK_TRACKS], 'oldest');
      expect(sorted[sorted.length - 1].id).toBe('junk');
    });
  });
});
