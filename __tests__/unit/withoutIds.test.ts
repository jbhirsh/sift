import { withoutIds } from '../../src/utils/withoutIds';
import type { Track } from '../../src/types';

const track = (id: string): Track => ({
  id,
  name: id,
  artist: 'A',
  album: 'B',
  duration: 200,
  playCount: 0,
  dateAdded: '',
});

describe('withoutIds', () => {
  it('leaves out the tracks whose ids are in the set, in order, and counts them', () => {
    const tracks = ['a', 'b', 'c', 'd'].map(track);
    const result = withoutIds(tracks, new Set(['b', 'd', 'z']));
    expect(result.tracks.map((t) => t.id)).toEqual(['a', 'c']);
    expect(result.dropped).toBe(2);
  });

  it('drops nothing for an empty set, and leaves its input alone', () => {
    const tracks = ['a', 'b'].map(track);
    const result = withoutIds(tracks, new Set());
    expect(result).toEqual({ tracks, dropped: 0 });
    expect(result.tracks).not.toBe(tracks);
    expect(tracks.map((t) => t.id)).toEqual(['a', 'b']);
  });
});
