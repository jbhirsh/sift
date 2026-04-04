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
});
