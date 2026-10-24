import {
  DURATION_TOLERANCE_SECONDS,
  sameSong,
  TrackIndex,
  uniqueTracks,
} from '../../src/utils/trackIdentity';
import type { Track } from '../../src/types';

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'id-1',
    name: 'Heat Waves',
    artist: 'Glass Animals',
    album: 'Dreamland',
    duration: 238,
    playCount: 10,
    dateAdded: '2020-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('sameSong', () => {
  test('same name/artist/duration is the same song regardless of id and album', () => {
    // The whole point: a catalog-id keep and its library-instance readback
    // are the same song under different ids.
    const catalog = makeTrack({ id: 'catalog-123' });
    const libraryInstance = makeTrack({ id: 'i.abcdef', album: 'Dreamland (Deluxe)' });
    expect(sameSong(catalog, libraryInstance)).toBe(true);
  });

  test('the same id is the same song, whatever the metadata says', () => {
    expect(sameSong(makeTrack(), makeTrack({ name: 'Renamed', duration: 10 }))).toBe(true);
  });

  test('differs by name and by artist', () => {
    const base = makeTrack();
    expect(sameSong(base, makeTrack({ id: 'x', name: 'Other Song' }))).toBe(false);
    expect(sameSong(base, makeTrack({ id: 'x', artist: 'Other Artist' }))).toBe(false);
  });

  test('is case-sensitive (providers report canonical casing consistently)', () => {
    expect(sameSong(makeTrack({ name: 'heat waves' }), makeTrack({ id: 'x' }))).toBe(false);
  });

  test('durations within a second match, inclusive, even across a rounding boundary (#55)', () => {
    expect(DURATION_TOLERANCE_SECONDS).toBe(1);
    // 238.4 and 238.6 round to different seconds but are the same song.
    expect(
      sameSong(makeTrack({ id: 'a', duration: 238.4 }), makeTrack({ id: 'b', duration: 238.6 })),
    ).toBe(true);
    const base = makeTrack({ id: 'a', duration: 238.5 });
    expect(sameSong(base, makeTrack({ id: 'b', duration: 239.5 }))).toBe(true);
    expect(sameSong(base, makeTrack({ id: 'b', duration: 237.5 }))).toBe(true);
    expect(sameSong(base, makeTrack({ id: 'b', duration: 239.75 }))).toBe(false);
    expect(sameSong(base, makeTrack({ id: 'b', duration: 237.25 }))).toBe(false);
  });

  test("an unknown duration (0) on either side doesn't block a match (#55)", () => {
    expect(sameSong(makeTrack({ id: 'a', duration: 0 }), makeTrack({ id: 'b' }))).toBe(true);
    expect(sameSong(makeTrack({ id: 'a' }), makeTrack({ id: 'b', duration: 0 }))).toBe(true);
  });

  test('field boundaries are unambiguous for ordinary punctuation', () => {
    const a = makeTrack({ id: 'a', name: 'Intro - Live', artist: 'Band' });
    const b = makeTrack({ id: 'b', name: 'Intro', artist: 'Live - Band' });
    expect(sameSong(a, b)).toBe(false);
    expect(new TrackIndex([a]).has(b)).toBe(false);
  });

  test('documents the accepted collision: distinct tracks a second apart', () => {
    // Same-titled interludes by the same artist within a second of each
    // other DO collide: the deliberate trade-off (see the doc comment) for
    // surviving Apple Music id reassignment.
    const interludeAlbumOne = makeTrack({
      id: 'a1',
      name: 'Interlude',
      album: 'One',
      duration: 30,
    });
    const interludeAlbumTwo = makeTrack({
      id: 'a2',
      name: 'Interlude',
      album: 'Two',
      duration: 30.8,
    });
    expect(sameSong(interludeAlbumOne, interludeAlbumTwo)).toBe(true);
  });
});

describe('TrackIndex', () => {
  test('answers what sameSong would against any track added', () => {
    const index = new TrackIndex([
      makeTrack({ id: 'a', duration: 238.4 }),
      makeTrack({ id: 'b', name: 'Bad Habit', artist: 'Steve Lacy', duration: 232 }),
    ]);
    expect(index.has(makeTrack({ id: 'a', name: 'Anything' }))).toBe(true);
    expect(index.has(makeTrack({ id: 'c', duration: 238.6 }))).toBe(true);
    expect(
      index.has(makeTrack({ id: 'c', name: 'Bad Habit', artist: 'Steve Lacy', duration: 0 })),
    ).toBe(true);
    expect(index.has(makeTrack({ id: 'c', duration: 241 }))).toBe(false);
    expect(index.has(makeTrack({ id: 'c', name: 'Bad Habit', artist: 'Someone' }))).toBe(false);
  });

  test('a song recorded twice under one name matches either recording', () => {
    const index = new TrackIndex([makeTrack({ id: 'a', duration: 200 })]);
    index.add(makeTrack({ id: 'b', duration: 300 }));
    expect(index.has(makeTrack({ id: 'c', duration: 300.5 }))).toBe(true);
    expect(index.has(makeTrack({ id: 'c', duration: 199 }))).toBe(true);
    expect(index.has(makeTrack({ id: 'c', duration: 250 }))).toBe(false);
  });

  test('starts empty', () => {
    expect(new TrackIndex().has(makeTrack())).toBe(false);
  });
});

describe('uniqueTracks (#56)', () => {
  test('drops repeated ids, first occurrence first, keeping the order', () => {
    const a = makeTrack({ id: 'a' });
    const b = makeTrack({ id: 'b' });
    const aAgain = makeTrack({ id: 'a', album: 'Second entry' });
    expect(uniqueTracks([a, b, aAgain, b])).toEqual([a, b]);
  });

  test('distinct ids sharing metadata stay: only the id decides', () => {
    const a = makeTrack({ id: 'a' });
    const b = makeTrack({ id: 'b' });
    expect(uniqueTracks([a, b])).toEqual([a, b]);
    expect(uniqueTracks([])).toEqual([]);
  });
});
