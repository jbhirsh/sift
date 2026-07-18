import { trackIdentity } from '../../src/utils/trackIdentity';
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

describe('trackIdentity', () => {
  test('same name/artist/duration yields the same key regardless of id and album', () => {
    // The whole point: a catalog-id keep and its library-instance readback
    // are the same song under different ids.
    const catalog = makeTrack({ id: 'catalog-123' });
    const libraryInstance = makeTrack({ id: 'i.abcdef', album: 'Dreamland (Deluxe)' });
    expect(trackIdentity(catalog)).toBe(trackIdentity(libraryInstance));
  });

  test('differs by name and by artist', () => {
    const base = makeTrack();
    expect(trackIdentity(makeTrack({ name: 'Other Song' }))).not.toBe(trackIdentity(base));
    expect(trackIdentity(makeTrack({ artist: 'Other Artist' }))).not.toBe(trackIdentity(base));
  });

  test('is case-sensitive (providers report canonical casing consistently)', () => {
    expect(trackIdentity(makeTrack({ name: 'heat waves' }))).not.toBe(
      trackIdentity(makeTrack({ name: 'Heat Waves' })),
    );
  });

  test('duration is rounded: sub-half-second drift matches, larger drift does not', () => {
    const base = makeTrack({ duration: 238 });
    // Apple reports fractional durations; the same song drifts by
    // milliseconds between catalog and library representations.
    expect(trackIdentity(makeTrack({ duration: 238.4 }))).toBe(trackIdentity(base));
    expect(trackIdentity(makeTrack({ duration: 237.5 }))).toBe(trackIdentity(base)); // rounds up to 238
    expect(trackIdentity(makeTrack({ duration: 238.5 }))).not.toBe(trackIdentity(base)); // rounds to 239
    expect(trackIdentity(makeTrack({ duration: 240 }))).not.toBe(trackIdentity(base));
  });

  test('field boundaries are unambiguous for ordinary punctuation', () => {
    // A naive "name - artist" join would collide these two; the NUL
    // separator keeps the fields apart.
    const a = makeTrack({ name: 'Intro - Live', artist: 'Band' });
    const b = makeTrack({ name: 'Intro', artist: 'Live - Band' });
    expect(trackIdentity(a)).not.toBe(trackIdentity(b));
  });

  test('empty artist still produces a distinct, stable key', () => {
    const noArtist = makeTrack({ artist: '' });
    expect(trackIdentity(noArtist)).toBe(trackIdentity(makeTrack({ artist: '', id: 'other' })));
    expect(trackIdentity(noArtist)).not.toBe(trackIdentity(makeTrack()));
  });

  test('documents the accepted collision: distinct tracks sharing the triple', () => {
    // Same-titled interludes by the same artist with the same rounded
    // duration DO collide — the deliberate trade-off (see the doc comment)
    // for surviving Apple Music id reassignment. The second such track is
    // treated as already present and will not be double-added.
    const interludeAlbumOne = makeTrack({ id: 'a1', name: 'Interlude', album: 'One', duration: 30 });
    const interludeAlbumTwo = makeTrack({ id: 'a2', name: 'Interlude', album: 'Two', duration: 30.2 });
    expect(trackIdentity(interludeAlbumOne)).toBe(trackIdentity(interludeAlbumTwo));
  });
});
