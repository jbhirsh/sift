import { NO_FILTER, Track } from '../../src/types';
import {
  ADDED_AGES,
  addedAgeLabel,
  isFiltering,
  matchesFilter,
  PLAY_LIMITS,
  playLimitLabel,
} from '../../src/utils/trackFilter';

const song = (playCount: number, dateAdded: string): Track => ({
  id: 'x',
  name: 'Song',
  artist: 'A',
  album: 'B',
  duration: 200,
  playCount,
  dateAdded,
});
const now = new Date('2026-06-15T12:00:00.000Z');

describe('trackFilter', () => {
  test('the choices Setup offers, no limit first', () => {
    expect(PLAY_LIMITS).toEqual([null, 0, 5, 20]);
    expect(ADDED_AGES).toEqual([null, 1, 3, 5]);
    expect(PLAY_LIMITS.map(playLimitLabel)).toEqual([
      'Any',
      'Never played',
      '5 or fewer',
      '20 or fewer',
    ]);
    expect(ADDED_AGES.map(addedAgeLabel)).toEqual([
      'Any time',
      'Over a year ago',
      'Over 3 years ago',
      'Over 5 years ago',
    ]);
  });

  test('no filter takes everything, even a song with no date', () => {
    expect(isFiltering(NO_FILTER)).toBe(false);
    expect(matchesFilter(song(999, ''), NO_FILTER, now)).toBe(true);
  });

  test('a play limit takes songs played at most that often', () => {
    const filter = { maxPlays: 5, addedYearsAgo: null };
    expect(isFiltering(filter)).toBe(true);
    expect(matchesFilter(song(5, ''), filter, now)).toBe(true);
    expect(matchesFilter(song(6, ''), filter, now)).toBe(false);
    const never = { maxPlays: 0, addedYearsAgo: null };
    expect(isFiltering(never)).toBe(true);
    expect(matchesFilter(song(0, ''), never, now)).toBe(true);
    expect(matchesFilter(song(1, ''), never, now)).toBe(false);
  });

  test('an age limit takes songs added at least that many years ago', () => {
    const filter = { maxPlays: null, addedYearsAgo: 3 };
    expect(isFiltering(filter)).toBe(true);
    expect(matchesFilter(song(0, '2023-06-15T12:00:00.000Z'), filter, now)).toBe(true);
    expect(matchesFilter(song(0, '2023-06-15T12:00:00.001Z'), filter, now)).toBe(false);
    expect(matchesFilter(song(0, '2010-01-01T00:00:00.000Z'), filter, now)).toBe(true);
    expect(matchesFilter(song(0, '2026-01-01T00:00:00.000Z'), filter, now)).toBe(false);
  });

  test("a song whose date isn't known is left out of an age limit", () => {
    const filter = { maxPlays: null, addedYearsAgo: 1 };
    expect(matchesFilter(song(0, ''), filter, now)).toBe(false);
    expect(matchesFilter(song(0, 'not a date'), filter, now)).toBe(false);
  });

  test('both limits must hold', () => {
    const filter = { maxPlays: 5, addedYearsAgo: 1 };
    expect(matchesFilter(song(2, '2020-01-01T00:00:00.000Z'), filter, now)).toBe(true);
    expect(matchesFilter(song(9, '2020-01-01T00:00:00.000Z'), filter, now)).toBe(false);
    expect(matchesFilter(song(2, '2026-03-01T00:00:00.000Z'), filter, now)).toBe(false);
  });

  test("doesn't change the date it was given", () => {
    const at = new Date(now);
    matchesFilter(song(0, '2020-01-01T00:00:00.000Z'), { maxPlays: null, addedYearsAgo: 5 }, at);
    expect(at.getTime()).toBe(now.getTime());
  });
});
