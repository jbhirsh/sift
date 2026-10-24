import type { Track } from '../../src/types';
import { decidedLatestFirst, decisionFor } from '../../src/utils/decisions';

const t = (id: string): Track => ({
  id,
  name: id,
  artist: 'A',
  album: 'B',
  duration: 1,
  playCount: 0,
  dateAdded: '',
});
const [a, b, c, d] = [t('a'), t('b'), t('c'), t('d')];

describe('decisions', () => {
  test('decisionFor says which list a song is in', () => {
    const decided = { kept: [a], removed: [b], skipped: [c] };
    expect(decisionFor('a', decided)).toBe('keep');
    expect(decisionFor('b', decided)).toBe('remove');
    expect(decisionFor('c', decided)).toBe('skip');
    expect(decisionFor('d', decided)).toBeNull();
  });

  test('decidedLatestFirst lists the decided cards, the latest first', () => {
    expect(decidedLatestFirst([a, b, c, d], 3)).toEqual([c, b, a]);
    expect(decidedLatestFirst([a, b], 0)).toEqual([]);
    expect(decidedLatestFirst([a, b], -1)).toEqual([]);
    expect(decidedLatestFirst([a, b], 9)).toEqual([b, a]);
  });

  test("doesn't reorder the list it was given", () => {
    const tracks = [a, b, c];
    decidedLatestFirst(tracks, 3);
    expect(tracks).toEqual([a, b, c]);
  });
});
