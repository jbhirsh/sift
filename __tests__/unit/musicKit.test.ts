import {
  batches,
  bestPreviewCandidate,
  canonicalPairing,
  collectPages,
  countAdded,
  countCached,
  LIBRARY_PAGE_SIZE,
  LOOKUP_BATCH_SIZE,
  PLAYLISTS_PAGE_SIZE,
  PREVIEW_SEARCH_LIMIT,
  preferSongs,
  songMetadataMatches,
  toCandidate,
  toPlaylist,
  toTrack,
  uniqueInOrder,
  webArtworkURL,
  type CandidateSong,
  type RawTrack,
  loadFailureKind,
  NO_TRACKS_FOUND,
} from '../../src/utils/musicKit';

const raw = (over: Partial<RawTrack> = {}): RawTrack => ({
  id: 'i1',
  name: 'Peaches',
  artist: 'Justin Bieber',
  album: 'Justice',
  duration: 198,
  playCount: 28,
  dateAdded: '2021-03-19T00:00:00Z',
  artworkURL: 'https://a.example/x.jpg',
  kind: 'song',
  ...over,
});

const song = (id: string, title: string, artist: string, duration: number | null): CandidateSong => ({
  id, title, artist, duration,
});

describe('constants', () => {
  test('match what the native module used to hard-code', () => {
    expect(LOOKUP_BATCH_SIZE).toBe(100);
    expect(LIBRARY_PAGE_SIZE).toBe(500);
    expect(PLAYLISTS_PAGE_SIZE).toBe(100);
    expect(PREVIEW_SEARCH_LIMIT).toBe(10);
  });
});

describe('webArtworkURL', () => {
  test('http(s) URLs pass, any case', () => {
    expect(webArtworkURL('https://a.example/x.jpg')).toBe('https://a.example/x.jpg');
    expect(webArtworkURL('http://a.example/x.jpg')).toBe('http://a.example/x.jpg');
    expect(webArtworkURL('HTTPS://a.example/x.jpg')).toBe('HTTPS://a.example/x.jpg');
  });

  test('private schemes, look-alikes and nothing are no artwork', () => {
    expect(webArtworkURL('musicKit://artwork/transient/600x600')).toBeUndefined();
    expect(webArtworkURL('file:///tmp/x.jpg')).toBeUndefined();
    expect(webArtworkURL('xhttps://a.example')).toBeUndefined();
    expect(webArtworkURL('https:/a.example')).toBeUndefined();
    expect(webArtworkURL(null)).toBeUndefined();
    expect(webArtworkURL(undefined)).toBeUndefined();
  });
});

describe('toTrack', () => {
  test('a fully known song maps field for field', () => {
    expect(toTrack(raw())).toEqual({
      id: 'i1',
      name: 'Peaches',
      artist: 'Justin Bieber',
      album: 'Justice',
      duration: 198,
      playCount: 28,
      dateAdded: '2021-03-19T00:00:00Z',
      artworkURL: 'https://a.example/x.jpg',
    });
  });

  test('missing values get the defaults the app expects', () => {
    expect(toTrack(raw({
      album: null, duration: null, playCount: null, dateAdded: null,
      artworkURL: 'musicKit://artwork/x', kind: 'track',
    }))).toEqual({
      id: 'i1',
      name: 'Peaches',
      artist: 'Justin Bieber',
      album: '',
      duration: 0,
      playCount: 0,
      dateAdded: '',
      artworkURL: undefined,
    });
  });
});

describe('toTrack: album order (#176)', () => {
  test('track and disc numbers come over when the service sends them', () => {
    expect(toTrack(raw({ trackNumber: 3, discNumber: 2 }))).toMatchObject({ trackNumber: 3, discNumber: 2 });
  });

  test('missing or null numbers leave the fields out, as an older build sends', () => {
    const track = toTrack(raw({ trackNumber: null, discNumber: null }));
    expect(track).not.toHaveProperty('trackNumber');
    expect(track).not.toHaveProperty('discNumber');
    expect(toTrack(raw())).not.toHaveProperty('trackNumber');
  });

  test('track 0 or disc 0 is still a number', () => {
    expect(toTrack(raw({ trackNumber: 0, discNumber: 0 }))).toMatchObject({ trackNumber: 0, discNumber: 0 });
  });
});

describe('toPlaylist', () => {
  test('keeps web artwork, drops the rest', () => {
    expect(toPlaylist({ id: 'p', name: 'Mix', trackCount: 3, artworkURL: 'https://a.example/p.jpg' }))
      .toEqual({ id: 'p', name: 'Mix', trackCount: 3, artworkURL: 'https://a.example/p.jpg' });
    expect(toPlaylist({ id: 'p', name: 'Mix', trackCount: 0, artworkURL: null }))
      .toEqual({ id: 'p', name: 'Mix', trackCount: 0, artworkURL: undefined });
  });
});

describe('batches', () => {
  test('slices in order, the last one partial', () => {
    expect(batches([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(batches([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]]);
    expect(batches([1], 100)).toEqual([[1]]);
  });

  test('nothing to slice, or a size that can\'t slice, is no batches', () => {
    expect(batches([], 100)).toEqual([]);
    expect(batches([1, 2], 0)).toEqual([]);
    expect(batches([1, 2], -1)).toEqual([]);
  });
});

describe('collectPages', () => {
  test('fetches pages at growing offsets until one comes back short', async () => {
    const data = Array.from({ length: 5 }, (_, i) => i);
    const fetchPage = jest.fn(async (offset: number, limit: number) => data.slice(offset, offset + limit));
    await expect(collectPages(fetchPage, 2)).resolves.toEqual([0, 1, 2, 3, 4]);
    expect(fetchPage.mock.calls).toEqual([[0, 2], [2, 2], [4, 2]]);
  });

  test('an exact multiple ends on an empty page', async () => {
    const fetchPage = jest.fn(async (offset: number) => (offset < 4 ? [offset, offset + 1] : []));
    await expect(collectPages(fetchPage, 2)).resolves.toEqual([0, 1, 2, 3]);
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  test('a page size that could never come back short is refused', async () => {
    const fetchPage = jest.fn().mockResolvedValue([]);
    await expect(collectPages(fetchPage, 0)).rejects.toThrow('page size must be positive, got 0');
    await expect(collectPages(fetchPage, -5)).rejects.toThrow(RangeError);
    expect(fetchPage).not.toHaveBeenCalled();
  });

  test('a failed page fails the whole load', async () => {
    const fetchPage = jest.fn().mockResolvedValueOnce([1, 2]).mockRejectedValueOnce(new Error('offline'));
    await expect(collectPages(fetchPage, 2)).rejects.toThrow('offline');
  });
});

describe('uniqueInOrder', () => {
  test('drops repeats, first occurrence first', () => {
    expect(uniqueInOrder(['b', 'a', 'b', 'c', 'a'])).toEqual(['b', 'a', 'c']);
    expect(uniqueInOrder([])).toEqual([]);
  });
});

describe('preferSongs', () => {
  test('swaps in the library song for an entry that has one, keeping order', () => {
    const entryA = raw({ id: 'a', kind: 'track', playCount: null });
    const entryB = raw({ id: 'b', kind: 'track' });
    const songA = raw({ id: 'a', kind: 'song', playCount: 7 });
    expect(preferSongs([entryA, entryB], new Map([['a', songA]]))).toEqual([songA, entryB]);
  });
});

describe('countAdded and countCached', () => {
  test('count only what landed / what is cached', () => {
    expect(countAdded(['added', 'failed', 'unresolved', 'added'])).toBe(2);
    expect(countAdded([])).toBe(0);
    expect(countCached(['song', null, 'track', null])).toBe(2);
    expect(countCached([])).toBe(0);
  });
});

describe('songMetadataMatches', () => {
  const a = song('1', 'Peaches', 'Justin Bieber', 198);

  test('title and artist compare trimmed and case folded', () => {
    expect(songMetadataMatches(a, song('2', '  peaches ', 'JUSTIN BIEBER', 198))).toBe(true);
    expect(songMetadataMatches(a, song('2', 'Peaches (Live)', 'Justin Bieber', 198))).toBe(false);
    expect(songMetadataMatches(a, song('2', 'Peaches', 'Someone Else', 198))).toBe(false);
  });

  test('durations within a second, inclusive, when both are known', () => {
    expect(songMetadataMatches(a, song('2', 'Peaches', 'Justin Bieber', 199))).toBe(true);
    expect(songMetadataMatches(a, song('2', 'Peaches', 'Justin Bieber', 197))).toBe(true);
    expect(songMetadataMatches(a, song('2', 'Peaches', 'Justin Bieber', 199.5))).toBe(false);
  });

  test('a missing duration on either side doesn\'t block the match', () => {
    expect(songMetadataMatches(a, song('2', 'Peaches', 'Justin Bieber', null))).toBe(true);
    expect(songMetadataMatches(song('1', 'Peaches', 'Justin Bieber', null), a)).toBe(true);
  });
});

describe('canonicalPairing', () => {
  const requested = song('req', 'Peaches', 'Justin Bieber', 198);
  const answer = song('canon', 'Peaches', 'Justin Bieber', 198.4);

  test('pairs one unanswered id with one matching answer', () => {
    expect(canonicalPairing(['req'], [answer], requested)).toEqual({ requestID: 'req', response: answer });
  });

  test('anything ambiguous or unconfirmed stays unpaired', () => {
    expect(canonicalPairing([], [answer], requested)).toBeNull();
    expect(canonicalPairing(['req', 'other'], [answer], requested)).toBeNull();
    expect(canonicalPairing(['req'], [], requested)).toBeNull();
    expect(canonicalPairing(['req'], [answer, song('x', 'Peaches', 'Justin Bieber', 198)], requested)).toBeNull();
    expect(canonicalPairing(['req'], [answer], undefined)).toBeNull();
    expect(canonicalPairing(['req'], [song('canon', 'Other', 'Justin Bieber', 198)], requested)).toBeNull();
  });
});

describe('bestPreviewCandidate', () => {
  const target = song('lib', 'Peaches', 'Justin Bieber', 198);

  test('the closest duration among same title and artist (case folded)', () => {
    const hits = [
      { ...song('far', 'Peaches', 'Justin Bieber', 200.5), previewURL: 'far' },
      { ...song('near', 'peaches', 'JUSTIN BIEBER', 197.5), previewURL: 'near' },
      { ...song('other', 'Peaches (Remix)', 'Justin Bieber', 198), previewURL: 'other' },
      { ...song('artist', 'Peaches', 'Someone Else', 198), previewURL: 'artist' },
    ];
    expect(bestPreviewCandidate(target, hits)?.previewURL).toBe('near');
  });

  test('a tie keeps the first hit', () => {
    const hits = [song('first', 'Peaches', 'Justin Bieber', 199), song('second', 'Peaches', 'Justin Bieber', 197)];
    expect(bestPreviewCandidate(target, hits)?.id).toBe('first');
  });

  test('within tolerance, inclusive; beyond it, nothing', () => {
    const edge = [song('edge', 'Peaches', 'Justin Bieber', 201)];
    expect(bestPreviewCandidate(target, edge)?.id).toBe('edge');
    expect(bestPreviewCandidate(target, edge, 2.9)).toBeNull();
    expect(bestPreviewCandidate(target, [song('live', 'Peaches', 'Justin Bieber', 210)])).toBeNull();
  });

  test('missing durations count as 0', () => {
    const unknown = song('lib', 'Peaches', 'Justin Bieber', null);
    const hits = [song('full', 'Peaches', 'Justin Bieber', 198), song('none', 'Peaches', 'Justin Bieber', null)];
    expect(bestPreviewCandidate(unknown, hits)?.id).toBe('none');
    expect(bestPreviewCandidate(target, [hits[1]])).toBeNull();
  });

  test('no hits, no candidate', () => {
    expect(bestPreviewCandidate(target, [])).toBeNull();
  });
});

describe('toCandidate', () => {
  test('is the pairing view of a raw track', () => {
    expect(toCandidate(raw())).toEqual(song('i1', 'Peaches', 'Justin Bieber', 198));
  });
});

describe('loadFailureKind (#174)', () => {
  // As the bridge passes a native error on: Expo prefixes the description.
  const native = (description: string) => new Error(`Calling the 'loadPlaylistItems' function has failed\n\u2192 Caused by: ${description}`);

  test('a playlist no longer in the library', () => {
    expect(loadFailureKind(native(NO_TRACKS_FOUND))).toBe('gone');
  });

  test('library access taken away', () => {
    expect(loadFailureKind(native('Music library access not authorized. Allow access in Settings > Privacy & Security > Media & Apple Music.'))).toBe('denied');
  });

  test.each([
    'The Internet connection appears to be offline.',
    'Device is offline',
    'The internet connection was lost.',
    'The network connection was lost.',
    'A network error occurred.',
    'The request timed out.',
    'Could not connect to the server.',
    'A server with the specified hostname could not be found.',
  ])('the network: %s', (message) => {
    expect(loadFailureKind(new Error(message))).toBe('offline');
  });

  test.each([
    'The connection to service named com.apple.Music.xpc was interrupted.',
    'Couldn\u2019t read the whole playlist.',
    '',
  ])('anything else: %p', (message) => {
    expect(loadFailureKind(new Error(message))).toBe('other');
  });

  test('not an Error at all', () => {
    expect(loadFailureKind('offline')).toBe('other');
    expect(loadFailureKind(undefined)).toBe('other');
  });
});
