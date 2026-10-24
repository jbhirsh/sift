import { primaryArtist, sortName, sortTracks } from '../../src/utils/sorting';
import type { Track } from '../../src/types';
import { MOCK_TRACKS } from '../../src/utils/mockData';

describe('sortTracks', () => {
  test('least-played sorts ascending by playCount', () => {
    const sorted = sortTracks(MOCK_TRACKS, 'least-played');
    expect(sorted[0].name).toBe('Do I Wanna Know?'); // playCount 5
    expect(sorted[1].name).toBe('Electric Feel'); // playCount 42
    expect(sorted[2].name).toBe('Midnight City'); // playCount 87
  });

  test('most-played sorts descending by playCount', () => {
    const sorted = sortTracks(MOCK_TRACKS, 'most-played');
    expect(sorted[0].name).toBe('Midnight City'); // playCount 87
    expect(sorted[1].name).toBe('Electric Feel'); // playCount 42
    expect(sorted[2].name).toBe('Do I Wanna Know?'); // playCount 5
  });

  test('oldest sorts ascending by dateAdded', () => {
    const sorted = sortTracks(MOCK_TRACKS, 'oldest');
    expect(sorted[0].name).toBe('Do I Wanna Know?'); // 2019-06-08
    expect(sorted[1].name).toBe('Electric Feel'); // 2020-01-26
    expect(sorted[2].name).toBe('Midnight City'); // 2020-09-13
  });

  test('newest sorts descending by dateAdded', () => {
    const sorted = sortTracks(MOCK_TRACKS, 'newest');
    expect(sorted[0].name).toBe('Midnight City'); // 2020-09-13
    expect(sorted[1].name).toBe('Electric Feel'); // 2020-01-26
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
      expect(
        sorted
          .slice(3)
          .map((t) => t.id)
          .sort(),
      ).toEqual(['no-date', 'no-date-2']);
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

describe('Artist and Album sorts (#176)', () => {
  const song = (
    name: string,
    artist: string,
    album: string,
    trackNumber?: number,
    discNumber?: number,
  ): Track => ({
    id: `${artist}/${album}/${name}`,
    name,
    artist,
    album,
    duration: 200,
    playCount: 0,
    dateAdded: '',
    ...(trackNumber !== undefined && { trackNumber }),
    ...(discNumber !== undefined && { discNumber }),
  });
  const names = (tracks: Track[]) => tracks.map((t) => t.name);

  test('sortName ignores case and a leading "The"', () => {
    expect(sortName('The Weeknd')).toBe('weeknd');
    expect(sortName('  the  Kid LAROI ')).toBe('kid laroi');
    expect(sortName('Theory of a Deadman')).toBe('theory of a deadman');
    expect(sortName('Rage Against the Machine')).toBe('rage against the machine');
    expect(sortName('MGMT')).toBe('mgmt');
    expect(sortName('')).toBe('');
  });

  test('Artist: by artist ("The" and case ignored), then album, then album order', () => {
    const tracks = [
      song('Save Your Tears', 'The Weeknd', 'After Hours', 11),
      song('good 4 u', 'Olivia Rodrigo', 'SOUR', 6),
      song('vampire', 'Olivia Rodrigo', 'GUTS', 12),
      song('drivers license', 'olivia rodrigo', 'SOUR', 3),
      song('Blinding Lights', 'The Weeknd', 'After Hours', 9),
      song('Levitating', 'Dua Lipa', 'Future Nostalgia', 5),
    ];
    expect(names(sortTracks(tracks, 'artist'))).toEqual([
      'Levitating',
      'vampire',
      'drivers license',
      'good 4 u',
      'Blinding Lights',
      'Save Your Tears',
    ]);
  });

  test('Album: by album, then album order; same-titled albums stay apart, by artist', () => {
    // Titles sort against the track numbers, so only the numbers give this order.
    const tracks = [
      song('Alpha', 'Band B', 'Greatest Hits', 2),
      song('Zulu', 'Band A', 'Greatest Hits', 1),
      song('Yankee', 'Band B', 'Greatest Hits', 1),
      song('Bravo', 'Band A', 'Greatest Hits', 2),
      song('Intro', 'X', 'The Album', 1),
      song('Song', 'Y', 'Abbey Road', 7),
    ];
    expect(names(sortTracks(tracks, 'album'))).toEqual([
      'Song',
      'Intro',
      'Zulu',
      'Bravo',
      'Yankee',
      'Alpha',
    ]);
  });

  test('album order: disc, then track; songs without a number after the numbered, by title', () => {
    const tracks = [
      song('Alpha', 'A', 'Live', 1, 2),
      song('No number b', 'A', 'Live'),
      song('Yankee', 'A', 'Live', 10, 1),
      song('No number a', 'A', 'Live'),
      song('Zulu', 'A', 'Live', 2),
      song('Xray', 'A', 'Live', 2, 1),
    ];
    // Disc 1 (none given counts as 1): tracks 2, 2 (tie: by title), 10; then disc 2; then no number.
    expect(names(sortTracks(tracks, 'album'))).toEqual([
      'Xray',
      'Zulu',
      'Yankee',
      'Alpha',
      'No number a',
      'No number b',
    ]);
  });

  test("a guest credit doesn't split an album or move a song away from its artist", () => {
    const tracks = [
      song('Need to Know', 'Doja Cat', 'Planet Her', 6),
      song('Kiss Me More', 'Doja Cat feat. SZA', 'Planet Her', 3),
      song('Woman', 'Doja Cat', 'Planet Her', 2),
      song('Say So', 'Doja Cat', 'Hot Pink', 11),
      song('Levitating', 'Dua Lipa (feat. DaBaby)', 'Future Nostalgia', 5),
    ];
    expect(names(sortTracks(tracks, 'album'))).toEqual([
      'Levitating',
      'Say So',
      'Woman',
      'Kiss Me More',
      'Need to Know',
    ]);
    expect(names(sortTracks(tracks, 'artist'))).toEqual([
      'Say So',
      'Woman',
      'Kiss Me More',
      'Need to Know',
      'Levitating',
    ]);
  });

  test.each([
    ['Doja Cat feat. SZA', 'Doja Cat'],
    ['Doja Cat ft. SZA', 'Doja Cat'],
    ['Doja Cat Ft SZA', 'Doja Cat'],
    ['Drake featuring Rihanna', 'Drake'],
    ['Dua Lipa (feat. DaBaby)', 'Dua Lipa'],
    ['Artist [ft. Guest]', 'Artist'],
    ['The Kid LAROI & Justin Bieber', 'The Kid LAROI & Justin Bieber'],
    ['Daft Punk', 'Daft Punk'],
    ['Left Featureless', 'Left Featureless'],
    ['Craft Beer', 'Craft Beer'],
  ])('primaryArtist(%p) is %p', (credit, main) => {
    expect(primaryArtist(credit)).toBe(main);
  });

  test('songs with no artist or album go last', () => {
    const tracks = [
      song('No artist', '', 'Album'),
      song('Named', 'Zed', 'Album'),
      song('Blank', '  ', 'Album'),
    ];
    expect(names(sortTracks(tracks, 'artist'))).toEqual(['Named', 'Blank', 'No artist']);
    const albums = [song('No album', 'A', ''), song('Has album', 'B', 'Zzz')];
    expect(names(sortTracks(albums, 'album'))).toEqual(['Has album', 'No album']);
  });

  test('numbers in names sort as numbers: "Volume 2" before "Volume 10"', () => {
    const tracks = [song('x', 'A', 'Volume 10'), song('y', 'A', 'Volume 2')];
    expect(names(sortTracks(tracks, 'album'))).toEqual(['y', 'x']);
  });

  test('neither changes the list it was given', () => {
    const tracks = [song('b', 'B', 'B'), song('a', 'A', 'A')];
    const copy = [...tracks];
    sortTracks(tracks, 'artist');
    sortTracks(tracks, 'album');
    expect(tracks).toEqual(copy);
  });
});
