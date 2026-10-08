import { createLrclibClient, searchTitle } from '../../src/services/LrclibClient';
import { Track } from '../../src/types';

const track: Track = {
  id: 't1',
  name: 'Mr. Brightside',
  artist: 'The Killers',
  album: 'Hot Fuss',
  duration: 222.4,
  playCount: 0,
  dateAdded: '',
};

function response(status: number, body: unknown = null): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: () => Promise.resolve(body),
  } as Response;
}

function record(overrides: Partial<{ duration: number; instrumental: boolean; syncedLyrics: string | null }> = {}) {
  return { id: 1, duration: 222, instrumental: false, syncedLyrics: '[00:01.00]hi', plainLyrics: 'hi', ...overrides };
}

function setup(...responses: (Response | Error)[]) {
  const fetch = jest.fn();
  for (const r of responses) {
    if (r instanceof Error) fetch.mockRejectedValueOnce(r);
    else fetch.mockResolvedValueOnce(r);
  }
  const client = createLrclibClient({ fetch, gapMs: 0, timeoutMs: 1000 });
  return { client, fetch };
}

describe('searchTitle', () => {
  it('drops featured artists, bracketed tags and dash suffixes', () => {
    expect(searchTitle('Uptown Funk (feat. Bruno Mars)')).toBe('Uptown Funk');
    expect(searchTitle('Song [Live] (Remix)')).toBe('Song');
    expect(searchTitle('Hotel California - 2013 Remaster')).toBe('Hotel California');
    expect(searchTitle('Plain')).toBe('Plain');
  });
});

describe('LrclibClient.lookup', () => {
  it('asks /get with title, artist, album and rounded duration, identifying the app', async () => {
    const { client, fetch } = setup(response(200, record()));
    await expect(client.lookup(track)).resolves.toEqual({ status: 'synced', lyrics: '[00:01.00]hi' });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(
      'https://lrclib.net/api/get?track_name=Mr.%20Brightside&artist_name=The%20Killers&duration=222&album_name=Hot%20Fuss',
    );
    expect(init.headers['User-Agent']).toMatch(/^Sift\/\S+ \(https:\/\/github\.com\/jbhirsh\/sift\)$/);
    expect(init.signal).toBeDefined();
  });

  it('omits an empty album', async () => {
    const { client, fetch } = setup(response(200, record()));
    await client.lookup({ ...track, album: '' });
    expect(fetch.mock.calls[0][0]).not.toContain('album_name');
  });

  it('reports instrumentals', async () => {
    const { client } = setup(response(200, record({ instrumental: true, syncedLyrics: null })));
    await expect(client.lookup(track)).resolves.toEqual({ status: 'instrumental' });
  });

  it('falls back to search on 404 and takes the closest duration with synced lyrics', async () => {
    const { client, fetch } = setup(
      response(404),
      response(200, [
        record({ duration: 300, syncedLyrics: 'far' }),
        record({ duration: 224, syncedLyrics: 'near' }),
        record({ duration: 222, syncedLyrics: null }),
        record({ duration: 223, syncedLyrics: 'nearest' }),
        { bogus: true },
        null,
      ]),
    );
    await expect(client.lookup(track)).resolves.toEqual({ status: 'synced', lyrics: 'nearest' });
    expect(fetch.mock.calls[1][0]).toBe(
      'https://lrclib.net/api/search?track_name=Mr.%20Brightside&artist_name=The%20Killers',
    );
  });

  it('searches with the cleaned-up title', async () => {
    const { client, fetch } = setup(response(404), response(200, []));
    await client.lookup({ ...track, name: 'Uptown Funk (feat. Bruno Mars)' });
    expect(fetch.mock.calls[1][0]).toContain('track_name=Uptown%20Funk&');
  });

  it('searches when /get has plain lyrics only', async () => {
    const { client, fetch } = setup(
      response(200, record({ syncedLyrics: null })),
      response(200, [record({ syncedLyrics: 'from search' })]),
    );
    await expect(client.lookup(track)).resolves.toEqual({ status: 'synced', lyrics: 'from search' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('searches when /get answers with an unexpected shape', async () => {
    const { client } = setup(response(200, { message: 'odd' }), response(200, [record({ syncedLyrics: 'ok' })]));
    await expect(client.lookup(track)).resolves.toEqual({ status: 'synced', lyrics: 'ok' });
  });

  it('search: an instrumental within tolerance, or nothing usable', async () => {
    const instrumental = setup(response(404), response(200, [record({ instrumental: true, syncedLyrics: null })]));
    await expect(instrumental.client.lookup(track)).resolves.toEqual({ status: 'instrumental' });

    const outOfRange = setup(response(404), response(200, [record({ duration: 226 }), record({ duration: 218 })]));
    await expect(outOfRange.client.lookup(track)).resolves.toEqual({ status: 'not-found' });

    const notArray = setup(response(404), response(200, { error: 'x' }));
    await expect(notArray.client.lookup(track)).resolves.toEqual({ status: 'not-found' });

    const searchMissing = setup(response(404), response(404));
    await expect(searchMissing.client.lookup(track)).resolves.toEqual({ status: 'not-found' });
  });

  it('accepts durations exactly at the tolerance', async () => {
    const { client } = setup(response(404), response(200, [record({ duration: 225.4, syncedLyrics: 'edge' })]));
    await expect(client.lookup(track)).resolves.toEqual({ status: 'synced', lyrics: 'edge' });
  });

  it('rejects on rate limits, server errors and network failures', async () => {
    await expect(setup(response(429)).client.lookup(track)).rejects.toThrow('lrclib_error_429');
    await expect(setup(response(503)).client.lookup(track)).rejects.toThrow('lrclib_error_503');
    await expect(setup(new Error('offline')).client.lookup(track)).rejects.toThrow('offline');
    await expect(setup(response(404), response(500)).client.lookup(track)).rejects.toThrow('lrclib_error_500');
  });

  it('times out a request that never answers', async () => {
    jest.useFakeTimers();
    try {
      const fetch = jest.fn(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((_, reject) => {
            init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
          }),
      );
      const client = createLrclibClient({ fetch: fetch as unknown as typeof globalThis.fetch, gapMs: 0, timeoutMs: 50 });
      const pending = client.lookup(track);
      const assertion = expect(pending).rejects.toThrow('lrclib_timeout');
      await jest.advanceTimersByTimeAsync(50);
      await assertion;
    } finally {
      jest.useRealTimers();
    }
  });

  it('runs requests one at a time, spaced by the gap', async () => {
    jest.useFakeTimers();
    try {
      const fetch = jest.fn().mockResolvedValue(response(200, record()));
      const client = createLrclibClient({ fetch, gapMs: 250, timeoutMs: 1000 });
      const first = client.lookup(track);
      const second = client.lookup({ ...track, id: 't2' });
      await jest.advanceTimersByTimeAsync(0);
      expect(fetch).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(249);
      expect(fetch).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(1);
      expect(fetch).toHaveBeenCalledTimes(2);
      await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps the queue moving after a failed request', async () => {
    const { client } = setup(new Error('offline'), response(200, record()));
    await expect(client.lookup(track)).rejects.toThrow('offline');
    await expect(client.lookup(track)).resolves.toEqual({ status: 'synced', lyrics: '[00:01.00]hi' });
  });

  it('uses the global fetch by default', async () => {
    const original = globalThis.fetch;
    const mockFetch = jest.fn().mockResolvedValue(response(200, record()));
    globalThis.fetch = mockFetch;
    try {
      await createLrclibClient({ gapMs: 0 }).lookup(track);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.fetch = original;
    }
  });
});
