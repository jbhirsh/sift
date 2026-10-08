import { Track } from '../types';

// LRCLIB (https://lrclib.net/docs): a free, open database of synced lyrics.
// No API key; it asks clients to identify themselves in the User-Agent and to
// space requests out rather than burst them. Sift reads only the timestamps
// (to find the chorus); lyrics are never shown or stored.

const BASE_URL = 'https://lrclib.net/api';
const USER_AGENT = 'Sift/1.0.0 (https://github.com/jbhirsh/sift)';
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_GAP_MS = 250;
/** LRCLIB's own /get matches durations within ±2 s; search results get a little more room. */
const DURATION_TOLERANCE_SECONDS = 3;

export type LyricsLookup =
  | { status: 'synced'; lyrics: string }
  | { status: 'instrumental' }
  | { status: 'not-found' };

interface LrclibRecord {
  duration: number;
  instrumental: boolean;
  syncedLyrics: string | null;
}

export interface LrclibClient {
  /**
   * Synced lyrics for a track. Resolves 'not-found' when LRCLIB has none;
   * rejects on a network error, timeout, rate limit or server error, so a
   * caller can tell "no lyrics" (worth remembering) from "try again later".
   */
  lookup(track: Track): Promise<LyricsLookup>;
}

export interface LrclibClientOptions {
  fetch?: typeof fetch;
  timeoutMs?: number;
  /** Minimum gap between the start of one request and the next. */
  gapMs?: number;
}

/** The track title as LRCLIB's search expects it: no "(feat. …)" or " - Remastered" suffixes. */
export function searchTitle(name: string): string {
  return name
    .replace(/\s*[([][^)\]]*[)\]]/g, '')
    .replace(/\s+-\s+.*$/, '')
    .trim();
}

function query(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
}

function isRecord(value: unknown): value is LrclibRecord {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.duration === 'number' &&
    typeof v.instrumental === 'boolean' &&
    (v.syncedLyrics === null || v.syncedLyrics === undefined || typeof v.syncedLyrics === 'string')
  );
}

export function createLrclibClient(options: LrclibClientOptions = {}): LrclibClient {
  const doFetch = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const gapMs = options.gapMs ?? DEFAULT_GAP_MS;
  // Requests run one at a time, gapMs apart (LRCLIB's request etiquette).
  let queue: Promise<void> = Promise.resolve();

  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(task);
    queue = run.then(
      () => new Promise((resolve) => setTimeout(resolve, gapMs)),
      () => new Promise((resolve) => setTimeout(resolve, gapMs)),
    );
    return run;
  }

  async function get(path: string): Promise<{ status: number; body: unknown }> {
    return enqueue(async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await doFetch(`${BASE_URL}${path}`, {
          headers: { 'User-Agent': USER_AGENT, 'Lrclib-Client': USER_AGENT },
          signal: controller.signal,
        });
        if (response.status === 404) return { status: 404, body: null };
        if (!response.ok) throw new Error(`lrclib_error_${response.status}`);
        return { status: response.status, body: await response.json() };
      } catch (err) {
        if (controller.signal.aborted) throw new Error('lrclib_timeout', { cause: err });
        throw err;
      } finally {
        clearTimeout(timer);
      }
    });
  }

  function fromRecord(record: LrclibRecord): LyricsLookup | null {
    if (record.instrumental) return { status: 'instrumental' };
    if (record.syncedLyrics) return { status: 'synced', lyrics: record.syncedLyrics };
    return null;
  }

  async function search(track: Track): Promise<LyricsLookup> {
    const { body } = await get(
      `/search?${query({ track_name: searchTitle(track.name), artist_name: track.artist })}`,
    );
    const candidates = (Array.isArray(body) ? body : [])
      .filter(isRecord)
      .filter((r) => Math.abs(r.duration - track.duration) <= DURATION_TOLERANCE_SECONDS)
      .sort((a, b) => Math.abs(a.duration - track.duration) - Math.abs(b.duration - track.duration));
    const synced = candidates.find((r) => r.syncedLyrics)?.syncedLyrics;
    if (synced) return { status: 'synced', lyrics: synced };
    if (candidates.some((r) => r.instrumental)) return { status: 'instrumental' };
    return { status: 'not-found' };
  }

  return {
    async lookup(track) {
      const params: Record<string, string> = {
        track_name: track.name,
        artist_name: track.artist,
        duration: String(Math.round(track.duration)),
      };
      if (track.album) params.album_name = track.album;
      const { status, body } = await get(`/get?${query(params)}`);
      if (status !== 404 && isRecord(body)) {
        const exact = fromRecord(body);
        if (exact) return exact;
      }
      // Not found, or found with plain lyrics only: a search may turn up
      // another release of the same recording that has synced lyrics.
      return search(track);
    },
  };
}

export const lrclib = createLrclibClient();
