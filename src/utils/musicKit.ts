import type { Playlist, Track } from '../types';
import type {
  AddResult,
  CachedKind,
  MusicKitPlaylist,
  MusicKitTrack,
} from '../../modules/expo-musickit/src/ExpoMusicKit.types';

// The decisions behind Apple Music access. The native module
// (modules/expo-musickit) only asks MusicKit one thing at a time and hands
// back raw values; what to do with them lives here, so it ships with an EAS
// Update instead of a reinstall. Pure functions only: AppleMusicProvider
// makes the native calls.

// The native module's raw shapes, defined once beside its wrapper.
/** A track as the native module returns it: missing values are null. */
export type RawTrack = MusicKitTrack;
export type RawPlaylist = MusicKitPlaylist;
export type { AddResult, CachedKind };

/** Just enough of a song to tell whether two ids are the same recording. */
export interface CandidateSong {
  id: string;
  title: string;
  artist: string;
  duration: number | null;
}

/** Library and catalog lookups go out at most this many ids at a time. */
export const LOOKUP_BATCH_SIZE = 100;
export const LIBRARY_PAGE_SIZE = 500;
export const PLAYLISTS_PAGE_SIZE = 100;
export const PREVIEW_SEARCH_LIMIT = 10;

/**
 * An artwork URL an <Image> can load, or undefined. Library artwork can
 * come back under a private scheme (musicKit://) that only the native
 * module can read; that counts as "no artwork" here, and the card resolves
 * it lazily (useResolvedArtwork).
 */
export function webArtworkURL(url: string | null | undefined): string | undefined {
  return url != null && /^https?:\/\//i.test(url) ? url : undefined;
}

/** A raw track as the app's Track, with the defaults the app expects. */
export function toTrack(raw: RawTrack): Track {
  return {
    id: raw.id,
    name: raw.name,
    artist: raw.artist,
    album: raw.album ?? '',
    duration: raw.duration ?? 0,
    playCount: raw.playCount ?? 0,
    dateAdded: raw.dateAdded ?? '',
    artworkURL: webArtworkURL(raw.artworkURL),
  };
}

export function toPlaylist(raw: RawPlaylist): Playlist {
  return {
    id: raw.id,
    name: raw.name,
    trackCount: raw.trackCount,
    artworkURL: webArtworkURL(raw.artworkURL),
  };
}

/** Consecutive slices of at most `size` items, in order. */
export function batches<T>(items: readonly T[], size: number): T[][] {
  if (size <= 0) return [];
  const out: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    out.push(items.slice(start, start + size));
  }
  return out;
}

/**
 * Every page, fetched in order until one comes back short. `fetchPage`
 * gets the offset and the page size.
 */
export async function collectPages<T>(
  fetchPage: (offset: number, limit: number) => Promise<T[]>,
  pageSize: number,
): Promise<T[]> {
  // A page size that can't come back short would never end.
  if (pageSize <= 0) throw new RangeError(`page size must be positive, got ${pageSize}`);
  const all: T[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = await fetchPage(offset, pageSize);
    all.push(...page);
    if (page.length < pageSize) return all;
  }
}

/**
 * De-duplicated, first occurrence first: a repeated id must not spawn a
 * second lookup.
 */
export function uniqueInOrder(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}

/** Playlist entries, each replaced by its library song when one was found. */
export function preferSongs(items: readonly RawTrack[], songs: ReadonlyMap<string, RawTrack>): RawTrack[] {
  return items.map((item) => songs.get(item.id) ?? item);
}

/** How many items of a per-item add landed. */
export function countAdded(results: readonly AddResult[]): number {
  return results.filter((result) => result === 'added').length;
}

/**
 * An add to a playlist that landed only some of its items. `unresolved`
 * ones have no song to add (gone from the catalog, say): retrying won't
 * help, so a caller can count them. `failed` ones were refused by the add
 * itself (no network, say): those are worth trying again.
 */
export class AddShortfallError extends Error {
  readonly added: number;
  readonly unresolved: number;
  readonly failed: number;
  readonly requested: number;

  constructor({ added, unresolved, failed }: { added: number; unresolved: number; failed: number }) {
    const requested = added + unresolved + failed;
    super(`${requested - added} of ${requested} tracks could not be added to the playlist`);
    this.name = 'AddShortfallError';
    this.added = added;
    this.unresolved = unresolved;
    this.failed = failed;
    this.requested = requested;
  }

  /** The shortfall in a per-item add's results, or null when all landed. */
  static of(results: readonly AddResult[]): AddShortfallError | null {
    const count = (kind: AddResult) => results.filter((result) => result === kind).length;
    const counts = { added: count('added'), unresolved: count('unresolved'), failed: count('failed') };
    return counts.added === results.length ? null : new AddShortfallError(counts);
  }
}

/** How many ids have something cached to play or add. */
export function countCached(kinds: readonly CachedKind[]): number {
  return kinds.filter((kind) => kind != null).length;
}

/**
 * Whether two candidates describe the same song: title and artist equal
 * after trimming and case folding, and durations within a second when both
 * are known. A missing duration doesn't block a match; a contradicting one
 * does.
 */
export function songMetadataMatches(a: CandidateSong, b: CandidateSong): boolean {
  const norm = (value: string) => value.trim().toLowerCase();
  if (norm(a.title) !== norm(b.title) || norm(a.artist) !== norm(b.artist)) return false;
  if (a.duration != null && b.duration != null) return Math.abs(a.duration - b.duration) <= 1;
  return true;
}

/**
 * The catalog sometimes answers a batch request with a song under a
 * different (canonical) id than the one asked for. Callers look tracks up
 * by the id they requested, so that answer has to be filed under it too.
 * Pairing by count alone can pick the wrong song (one id genuinely failed
 * and an unrelated extra item came back), so pair only when there is
 * exactly one unanswered id and one unmatched answer AND the requested
 * song's known metadata matches the answer. Anything else: null, and the
 * id stays unresolved for the caller's shortfall handling.
 */
export function canonicalPairing(
  unansweredIDs: readonly string[],
  unmatched: readonly CandidateSong[],
  requested: CandidateSong | undefined,
): { requestID: string; response: CandidateSong } | null {
  if (unansweredIDs.length !== 1 || unmatched.length !== 1 || requested == null) return null;
  if (!songMetadataMatches(requested, unmatched[0])) return null;
  return { requestID: unansweredIDs[0], response: unmatched[0] };
}

/**
 * The catalog search hit to borrow a preview from (for "Start at chorus")
 * when a library song has none: same title and artist (case folded) and
 * the closest duration, within `toleranceSeconds`. A missing duration
 * counts as 0. Null when nothing is close enough: better no hint than
 * another recording's.
 */
export function bestPreviewCandidate<T extends CandidateSong>(
  song: CandidateSong,
  hits: readonly T[],
  toleranceSeconds = 3,
): T | null {
  const title = song.title.toLowerCase();
  const artist = song.artist.toLowerCase();
  const target = song.duration ?? 0;
  const gap = (hit: T) => Math.abs((hit.duration ?? 0) - target);
  let best: T | null = null;
  for (const hit of hits) {
    if (hit.title.toLowerCase() !== title || hit.artist.toLowerCase() !== artist) continue;
    if (best == null || gap(hit) < gap(best)) best = hit;
  }
  return best != null && gap(best) <= toleranceSeconds ? best : null;
}

/** The candidate view of a raw track, for pairing. */
export function toCandidate(raw: RawTrack): CandidateSong {
  return { id: raw.id, title: raw.name, artist: raw.artist, duration: raw.duration };
}
