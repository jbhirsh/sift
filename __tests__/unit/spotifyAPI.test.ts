import {
  loadLibrary,
  createPlaylist,
  fetchUserProfile,
  loadPlaylists,
  loadPlaylistTracks,
  removeFromLibrary,
  removeFromPlaylist,
  addToLibrary,
  addToPlaylist,
} from '../../src/services/spotify/SpotifyAPI';

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

describe('loadPlaylists', () => {
  test('returns mapped playlists from paginated response', async () => {
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse({
          items: [
            {
              id: 'pl1',
              name: 'Chill Vibes',
              images: [{ url: 'https://img.spotify.com/pl1.jpg', width: 300 }],
              tracks: { total: 42 },
            },
          ],
          next: 'https://api.spotify.com/v1/me/playlists?offset=50&limit=50',
          total: 2,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          items: [
            {
              id: 'pl2',
              name: 'Workout',
              images: [],
              tracks: { total: 10 },
            },
          ],
          next: null,
          total: 2,
        }),
      );

    const playlists = await loadPlaylists('fake-token');

    expect(playlists).toHaveLength(2);
    expect(playlists[0]).toEqual({
      id: 'pl1',
      name: 'Chill Vibes',
      trackCount: 42,
      artworkURL: 'https://img.spotify.com/pl1.jpg',
    });
    expect(playlists[1]).toEqual({
      id: 'pl2',
      name: 'Workout',
      trackCount: 10,
      artworkURL: undefined,
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

describe('loadPlaylistTracks', () => {
  test('returns mapped tracks and filters null tracks', async () => {
    const validTrack = makeSpotifySavedTrack({ id: 'pt1', name: 'Good Track' });

    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        items: [
          { added_at: validTrack.added_at, track: validTrack.track },
          { added_at: '2024-01-01T00:00:00Z', track: null }, // local/unavailable
        ],
        next: null,
        total: 2,
      }),
    );

    const tracks = await loadPlaylistTracks('fake-token', 'playlist123');

    expect(tracks).toHaveLength(1);
    expect(tracks[0].id).toBe('pt1');
    expect(tracks[0].name).toBe('Good Track');
    expect(mockFetch.mock.calls[0][0]).toBe(
      'https://api.spotify.com/v1/playlists/playlist123/tracks?limit=50',
    );
  });

  test('handles empty playlist', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ items: [], next: null, total: 0 }),
    );

    const tracks = await loadPlaylistTracks('fake-token', 'empty-playlist');

    expect(tracks).toHaveLength(0);
  });
});

describe('removeFromLibrary', () => {
  test('DELETEs the given track IDs from Saved Tracks', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 200));

    await removeFromLibrary('fake-token', ['t1', 't2']);

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.spotify.com/v1/me/tracks');
    expect((init as RequestInit).method).toBe('DELETE');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      ids: ['t1', 't2'],
    });
  });

  test('throws when the request fails', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 500));

    await expect(removeFromLibrary('fake-token', ['t1'])).rejects.toThrow(
      'Failed to remove tracks from library: 500',
    );
  });
});

describe('removeFromPlaylist', () => {
  test('DELETEs track URIs from the playlist', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 200));

    await removeFromPlaylist('fake-token', 'pl1', ['t1', 't2']);

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.spotify.com/v1/playlists/pl1/tracks');
    expect((init as RequestInit).method).toBe('DELETE');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      tracks: [{ uri: 'spotify:track:t1' }, { uri: 'spotify:track:t2' }],
    });
  });

  test('throws when the request fails', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 403));

    await expect(
      removeFromPlaylist('fake-token', 'pl1', ['t1']),
    ).rejects.toThrow('Failed to remove tracks from playlist: 403');
  });
});

describe('addToLibrary', () => {
  test('PUTs the given track IDs into Saved Tracks', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 200));

    await addToLibrary('fake-token', ['t1', 't2']);

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.spotify.com/v1/me/tracks');
    expect((init as RequestInit).method).toBe('PUT');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      ids: ['t1', 't2'],
    });
  });

  test('throws when the request fails', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 500));

    await expect(addToLibrary('fake-token', ['t1'])).rejects.toThrow(
      'Failed to add tracks to library: 500',
    );
  });
});

describe('addToPlaylist', () => {
  test('POSTs track URIs to the playlist', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 200));

    await addToPlaylist('fake-token', 'pl1', ['t1', 't2']);

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.spotify.com/v1/playlists/pl1/tracks');
    expect((init as RequestInit).method).toBe('POST');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      uris: ['spotify:track:t1', 'spotify:track:t2'],
    });
  });

  test('throws when the request fails', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 502));

    await expect(
      addToPlaylist('fake-token', 'pl1', ['t1']),
    ).rejects.toThrow('Failed to add tracks to playlist: 502');
  });
});
