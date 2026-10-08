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
  /**
   * Move a track's queued lookup to the front: the card on screen must not
   * wait behind prefetches for cards the user has already swiped past.
   */
  prioritize(trackID: string): void;
}

export interface LrclibClientOptions {
  fetch?: typeof fetch;
  timeoutMs?: number;
  /** Pause after each request before the next one starts. */
  gapMs?: number;
}

interface Job {
  key: string;
  run: () => Promise<void>;
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
  // Requests run one at a time with a pause after each (LRCLIB's request
  // etiquette), in queue order except that a prioritized track's requests,
  // including the search a lookup may follow up with, go first.
  const jobs: Job[] = [];
  const urgent = new Set<string>();
  let running = false;

  function pump(): void {
    if (running) return;
    const job = jobs.shift();
    if (!job) return;
    running = true;
    void job.run().then(() =>
      setTimeout(() => {
        running = false;
        pump();
      }, gapMs),
    );
  }

  function enqueue<T>(key: string, task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const job: Job = { key, run: () => task().then(resolve, reject) };
      if (urgent.has(key)) jobs.unshift(job);
      else jobs.push(job);
      pump();
    });
  }

  async function get(key: string, path: string): Promise<{ status: number; body: unknown }> {
    return enqueue(key, async () => {
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
      track.id,
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

  async function lookup(track: Track): Promise<LyricsLookup> {
    const params: Record<string, string> = {
      track_name: track.name,
      artist_name: track.artist,
      duration: String(Math.round(track.duration)),
    };
    if (track.album) params.album_name = track.album;
    const { body } = await get(track.id, `/get?${query(params)}`);
    // A 404's body is null, which isn't a record either.
    if (isRecord(body)) {
      const exact = fromRecord(body);
      if (exact) return exact;
    }
    // Not found, or found with plain lyrics only: a search may turn up
    // another release of the same recording that has synced lyrics.
    return search(track);
  }

  return {
    lookup(track) {
      return lookup(track).finally(() => urgent.delete(track.id));
    },
    prioritize(trackID) {
      urgent.add(trackID);
      const mine = jobs.filter((j) => j.key === trackID);
      if (mine.length === 0) return;
      const rest = jobs.filter((j) => j.key !== trackID);
      jobs.splice(0, jobs.length, ...mine, ...rest);
    },
  };
}

export const lrclib = createLrclibClient();
