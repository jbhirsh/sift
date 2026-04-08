import { loadLibrary, createPlaylist, fetchUserProfile } from '../../src/services/spotify/SpotifyAPI';

// ---------------------------------------------------------------------------
// Mock fetch globally
// ---------------------------------------------------------------------------

const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
globalThis.fetch = mockFetch;

// ---------------------------------------------------------------------------
// Factory helpers (inline, no shared files)
// ---------------------------------------------------------------------------

function makeSpotifySavedTrack(overrides: {
  id?: string;
  name?: string;
  artists?: { name: string }[];
  albumName?: string;
  images?: { url: string; width?: number }[];
  duration_ms?: number;
  preview_url?: string | null;
  added_at?: string;
} = {}) {
  return {
    added_at: overrides.added_at ?? '2024-06-15T12:00:00Z',
    track: {
      id: overrides.id ?? 'track1',
      name: overrides.name ?? 'Test Song',
      artists: overrides.artists ?? [{ name: 'Artist One' }],
      album: {
        name: overrides.albumName ?? 'Test Album',
        images: overrides.images ?? [
          { url: 'https://img.spotify.com/large.jpg', width: 640 },
          { url: 'https://img.spotify.com/small.jpg', width: 64 },
        ],
      },
      duration_ms: overrides.duration_ms ?? 240000,
      preview_url: overrides.preview_url === undefined
        ? 'https://p.scdn.co/preview.mp3'
        : overrides.preview_url,
    },
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    headers: new Headers(),
    redirected: false,
    statusText: 'OK',
    type: 'basic',
    url: '',
    clone: () => jsonResponse(body, status),
    body: null,
    bodyUsed: false,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    blob: () => Promise.resolve(new Blob()),
    formData: () => Promise.resolve(new FormData()),
    text: () => Promise.resolve(JSON.stringify(body)),
    bytes: () => Promise.resolve(new Uint8Array()),
  } as Response;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockFetch.mockReset();
});

describe('loadLibrary', () => {
  test('maps Spotify tracks to app Track type', async () => {
    const saved1 = makeSpotifySavedTrack({
      id: 'abc',
      name: 'Song A',
      artists: [{ name: 'Alice' }, { name: 'Bob' }],
      albumName: 'Album X',
      images: [
        { url: 'https://img.spotify.com/small.jpg', width: 64 },
        { url: 'https://img.spotify.com/large.jpg', width: 640 },
        { url: 'https://img.spotify.com/medium.jpg', width: 300 },
      ],
      duration_ms: 195000,
      preview_url: 'https://p.scdn.co/abc.mp3',
      added_at: '2023-01-15T08:30:00Z',
    });

    const saved2 = makeSpotifySavedTrack({
      id: 'def',
      name: 'Song B',
      artists: [{ name: 'Charlie' }],
      albumName: 'Album Y',
      duration_ms: 300000,
      preview_url: 'https://p.scdn.co/def.mp3',
      added_at: '2024-02-20T14:00:00Z',
    });

    mockFetch.mockResolvedValueOnce(
      jsonResponse({ items: [saved1, saved2], next: null, total: 2 }),
    );

    const tracks = await loadLibrary('fake-token');

    expect(tracks).toHaveLength(2);

    // First track
    expect(tracks[0].id).toBe('abc');
    expect(tracks[0].name).toBe('Song A');
    expect(tracks[0].artist).toBe('Alice, Bob');
    expect(tracks[0].album).toBe('Album X');
    expect(tracks[0].duration).toBe(195);
    expect(tracks[0].playCount).toBe(0);
    expect(tracks[0].dateAdded).toBe('2023-01-15T08:30:00Z');
    expect(tracks[0].artworkURL).toBe('https://img.spotify.com/large.jpg');
    expect(tracks[0].previewURL).toBe('https://p.scdn.co/abc.mp3');

    // Second track
    expect(tracks[1].id).toBe('def');
    expect(tracks[1].artist).toBe('Charlie');
  });

  test('handles pagination', async () => {
    const page1Track = makeSpotifySavedTrack({ id: 'p1', name: 'Page 1 Song' });
    const page2Track = makeSpotifySavedTrack({ id: 'p2', name: 'Page 2 Song' });

    mockFetch
      .mockResolvedValueOnce(
        jsonResponse({
          items: [page1Track],
          next: 'https://api.spotify.com/v1/me/tracks?offset=50&limit=50',
          total: 2,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ items: [page2Track], next: null, total: 2 }),
      );

    const tracks = await loadLibrary('fake-token');

    expect(tracks).toHaveLength(2);
    expect(tracks[0].id).toBe('p1');
    expect(tracks[1].id).toBe('p2');
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Second call should use the next URL
    expect(mockFetch.mock.calls[1][0]).toBe(
      'https://api.spotify.com/v1/me/tracks?offset=50&limit=50',
    );
  });

  test('throws on 401', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 401));

    await expect(loadLibrary('expired-token')).rejects.toThrow('not_authenticated');
  });

  test('throws on 403', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 403));

    await expect(loadLibrary('bad-scope-token')).rejects.toThrow('forbidden');
  });

  test('handles tracks with no preview URL', async () => {
    const saved = makeSpotifySavedTrack({
      id: 'no-preview',
      preview_url: null,
    });

    mockFetch.mockResolvedValueOnce(
      jsonResponse({ items: [saved], next: null, total: 1 }),
    );

    const tracks = await loadLibrary('fake-token');

    expect(tracks[0].previewURL).toBeUndefined();
  });

  test('handles tracks with no album images', async () => {
    const saved = makeSpotifySavedTrack({
      id: 'no-art',
      images: [],
    });

    mockFetch.mockResolvedValueOnce(
      jsonResponse({ items: [saved], next: null, total: 1 }),
    );

    const tracks = await loadLibrary('fake-token');

    expect(tracks[0].artworkURL).toBeUndefined();
  });
});

describe('createPlaylist', () => {
  test('fetches user ID and creates playlist with tracks', async () => {
    // GET /v1/me — user profile
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ id: 'user123', display_name: 'Test User' }),
    );

    // POST /v1/users/user123/playlists — create playlist
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ id: 'playlist456' }, 200),
    );

    // POST /v1/playlists/playlist456/tracks — add tracks
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 200));

    await createPlaylist('fake-token', 'Sift — To Remove', ['t1', 't2', 't3']);

    expect(mockFetch).toHaveBeenCalledTimes(3);

    // Verify user profile request
    expect(mockFetch.mock.calls[0][0]).toBe(
      'https://api.spotify.com/v1/me',
    );

    // Verify playlist creation request
    const createCall = mockFetch.mock.calls[1];
    expect(createCall[0]).toBe(
      'https://api.spotify.com/v1/users/user123/playlists',
    );
    const createBody = JSON.parse((createCall[1] as RequestInit).body as string);
    expect(createBody.name).toBe('Sift — To Remove');
    expect(createBody.public).toBe(false);

    // Verify add-tracks request
    const addCall = mockFetch.mock.calls[2];
    expect(addCall[0]).toBe(
      'https://api.spotify.com/v1/playlists/playlist456/tracks',
    );
    const addBody = JSON.parse((addCall[1] as RequestInit).body as string);
    expect(addBody.uris).toEqual([
      'spotify:track:t1',
      'spotify:track:t2',
      'spotify:track:t3',
    ]);
  });

  test('batches tracks in groups of 100', async () => {
    // GET /v1/me
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ id: 'user123', display_name: 'Test User' }),
    );

    // POST create playlist
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ id: 'playlist789' }, 200),
    );

    // POST add tracks — batch 1 (100 tracks)
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 200));

    // POST add tracks — batch 2 (50 tracks)
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 200));

    const trackIDs = Array.from({ length: 150 }, (_, i) => `track${i}`);

    await createPlaylist('fake-token', 'Big Playlist', trackIDs);

    // 1 GET profile + 1 POST create + 2 POST add-tracks = 4 total
    expect(mockFetch).toHaveBeenCalledTimes(4);

    // First batch: 100 URIs
    const batch1Body = JSON.parse(
      (mockFetch.mock.calls[2][1] as RequestInit).body as string,
    );
    expect(batch1Body.uris).toHaveLength(100);

    // Second batch: 50 URIs
    const batch2Body = JSON.parse(
      (mockFetch.mock.calls[3][1] as RequestInit).body as string,
    );
    expect(batch2Body.uris).toHaveLength(50);
  });
});

describe('fetchUserProfile', () => {
  test('returns user id and display name', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ id: 'u42', display_name: 'Jane Doe' }),
    );

    const profile = await fetchUserProfile('fake-token');

    expect(profile.id).toBe('u42');
    expect(profile.display_name).toBe('Jane Doe');
  });
});

describe('apiGet error handling', () => {
  test('throws on non-401/403 error status', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 500));

    await expect(loadLibrary('fake-token')).rejects.toThrow('spotify_api_error_500');
  });
});

describe('createPlaylist error handling', () => {
  test('throws when playlist creation fails', async () => {
    // GET /v1/me — success
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ id: 'user123', display_name: 'Test User' }),
    );
    // POST create playlist — failure
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 403));

    await expect(
      createPlaylist('fake-token', 'Test', ['t1']),
    ).rejects.toThrow('Failed to create playlist: 403');
  });

  test('throws when adding tracks fails', async () => {
    // GET /v1/me
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ id: 'user123', display_name: 'Test User' }),
    );
    // POST create playlist — success
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: 'pl1' }, 200));
    // POST add tracks — failure
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 500));

    await expect(
      createPlaylist('fake-token', 'Test', ['t1']),
    ).rejects.toThrow('Failed to add tracks to playlist: 500');
  });
});
