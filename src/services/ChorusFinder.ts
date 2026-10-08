import * as Sentry from '@sentry/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Track } from '../types';
import {
  clampStart,
  estimateChorusStart,
  findChorusStart,
  isUsablePreviewOffset,
  parseSyncedLyrics,
  startFromLyrics,
} from '../utils/chorus';
import { lrclib, LyricsLookup } from './LrclibClient';

// Where a track's "Start at chorus" playback begins. In order:
//
// 1. lyrics:   LRCLIB synced lyrics, chorus = the block of lines the song
//              repeats (utils/chorus).
// 2. preview:  where Apple Music's 30-second preview sits in the full track,
//              found by ShazamKit on the device. Labels pick the preview to
//              start at "the good part", so it is a strong hook proxy, and it
//              works for instrumentals.
// 3. estimate: about a fifth of the way in (utils/chorus).
//
// Results are cached per track id in AsyncStorage, so each track is looked up
// once. An estimate reached only because a step failed for now (LRCLIB
// unreachable, the preview match erroring) is kept for this app session only,
// so it is retried on the next launch rather than remembered forever.

export type ChorusSource = 'lyrics' | 'preview' | 'estimate';

export interface ChorusStart {
  /** Seconds from the start of the track. */
  position: number;
  source: ChorusSource;
}

/**
 * Where ShazamKit places the track's preview, in seconds. Resolves null when
 * there is no answer to find (no preview, no match); rejects when the lookup
 * failed for now and is worth retrying another time.
 */
export type PreviewOffsetLookup = (trackID: string) => Promise<number | null>;

type Storage = Pick<typeof AsyncStorage, 'getItem' | 'setItem'>;

export interface ChorusFinderDeps {
  lookupLyrics: (track: Track) => Promise<LyricsLookup>;
  /** Move a track's pending lyrics lookup to the front of the queue. */
  prioritize: (trackID: string) => void;
  storage: Storage;
}

// Bump the version when the detection rules change, to drop stale results.
export const CHORUS_CACHE_KEY = 'sift_chorus_starts.v1';
export const MAX_CACHE_ENTRIES = 2000;

const SOURCE_CODES: Record<ChorusSource, string> = { lyrics: 'l', preview: 'p', estimate: 'e' };
const CODE_SOURCES = new Map<string, ChorusSource>([
  ['l', 'lyrics'],
  ['p', 'preview'],
  ['e', 'estimate'],
]);

/** [trackID, position, source code, track duration] — compact for storage. */
type CacheRow = [string, number, string, number];

interface CacheEntry extends ChorusStart {
  duration: number;
}

/** A stored row as [trackID, entry], or null when the row is malformed. */
function toEntry(row: unknown): [string, CacheEntry] | null {
  if (!Array.isArray(row) || row.length !== 4) return null;
  const [id, position, code, duration] = row as unknown[];
  const source = CODE_SOURCES.get(String(code));
  if (typeof position !== 'number' || !Number.isFinite(position)) return null;
  if (!source || typeof duration !== 'number') return null;
  return [String(id), { position, source, duration }];
}

export class ChorusFinder {
  private cache: Promise<Map<string, CacheEntry>> | null = null;
  private inFlight = new Map<string, Promise<ChorusStart>>();
  /** Results not worth persisting, kept so this session doesn't redo them. */
  private sessionOnly = new Map<string, CacheEntry>();

  constructor(
    private deps: ChorusFinderDeps = {
      lookupLyrics: (t) => lrclib.lookup(t),
      prioritize: (id) => lrclib.prioritize(id),
      storage: AsyncStorage,
    },
  ) {}

  /**
   * The chorus start for a track. Never rejects: the estimate is the floor.
   * `urgent` marks the card on screen, whose lookup jumps the queue.
   */
  find(track: Track, previewOffset?: PreviewOffsetLookup, { urgent = false } = {}): Promise<ChorusStart> {
    if (urgent) this.deps.prioritize(track.id);
    const pending = this.inFlight.get(track.id);
    if (pending) return pending;
    const result = this.resolve(track, previewOffset).finally(() => {
      this.inFlight.delete(track.id);
    });
    this.inFlight.set(track.id, result);
    return result;
  }

  private async resolve(track: Track, previewOffset?: PreviewOffsetLookup): Promise<ChorusStart> {
    const cache = await this.loadCache();
    const hit = cache.get(track.id) ?? this.sessionOnly.get(track.id);
    // A changed duration means a different recording behind the same id.
    if (hit && Math.abs(hit.duration - track.duration) < 1) {
      return { position: hit.position, source: hit.source };
    }

    let failedForNow = false;
    let result: ChorusStart | null = null;
    try {
      const lookup = await this.deps.lookupLyrics(track);
      if (lookup.status === 'synced') {
        const match = findChorusStart(parseSyncedLyrics(lookup.lyrics), {
          title: track.name,
          duration: track.duration,
        });
        if (match) result = { position: startFromLyrics(match, track.duration), source: 'lyrics' };
      }
    } catch (err) {
      failedForNow = true;
      Sentry.addBreadcrumb({ category: 'chorus', message: `Lyrics lookup failed: ${err}`, level: 'info' });
    }

    if (!result && previewOffset) {
      try {
        const offset = await previewOffset(track.id);
        if (isUsablePreviewOffset(offset, track.duration)) {
          result = { position: clampStart(offset, track.duration), source: 'preview' };
        }
      } catch (err) {
        failedForNow = true;
        Sentry.addBreadcrumb({ category: 'chorus', message: `Preview match failed: ${err}`, level: 'info' });
      }
    }

    if (!result) result = { position: estimateChorusStart(track.duration), source: 'estimate' };
    if (failedForNow && result.source === 'estimate') {
      this.sessionOnly.set(track.id, { ...result, duration: track.duration });
    } else {
      this.remember(cache, track, result);
    }
    return result;
  }

  private loadCache(): Promise<Map<string, CacheEntry>> {
    if (!this.cache) {
      this.cache = this.readCache();
    }
    return this.cache;
  }

  private async readCache(): Promise<Map<string, CacheEntry>> {
    const cache = new Map<string, CacheEntry>();
    try {
      const json = await this.deps.storage.getItem(CHORUS_CACHE_KEY);
      if (!json) return cache;
      // Anything but an array of rows throws here or yields no entries.
      for (const row of JSON.parse(json) as Iterable<unknown>) {
        const entry = toEntry(row);
        if (entry) cache.set(...entry);
      }
    } catch (err) {
      Sentry.addBreadcrumb({ category: 'chorus', message: `Chorus cache unreadable: ${err}`, level: 'warning' });
    }
    return cache;
  }

  private remember(cache: Map<string, CacheEntry>, track: Track, start: ChorusStart): void {
    // Re-insert so the Map's order stays oldest-first for trimming.
    cache.delete(track.id);
    cache.set(track.id, { ...start, duration: track.duration });
    for (const id of cache.keys()) {
      if (cache.size <= MAX_CACHE_ENTRIES) break;
      cache.delete(id);
    }
    const rows: CacheRow[] = [...cache].map(([id, e]) => [id, e.position, SOURCE_CODES[e.source], e.duration]);
    this.deps.storage.setItem(CHORUS_CACHE_KEY, JSON.stringify(rows)).catch((err: unknown) => {
      Sentry.addBreadcrumb({ category: 'chorus', message: `Chorus cache write failed: ${err}`, level: 'warning' });
    });
  }
}

export const chorusFinder = new ChorusFinder();
