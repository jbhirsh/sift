import { Track, SortOrder } from '../types';

/**
 * Parse a track's dateAdded into epoch ms, or null when it is missing or
 * unparseable. Non-library playlist tracks come across the bridge with
 * `dateAdded: ""` (see trackToDictionary in ExpoMusicKitModule), and
 * `new Date('').getTime()` is NaN — a NaN-returning comparator makes the
 * sort order undefined.
 */
function dateAddedMs(track: Track): number | null {
  if (!track.dateAdded) return null;
  const ms = new Date(track.dateAdded).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Compare two tracks by dateAdded. Tracks without a usable date sort after
 * tracks with one (stable fallback), regardless of direction.
 */
function compareByDateAdded(a: Track, b: Track, direction: 1 | -1): number {
  const aMs = dateAddedMs(a);
  const bMs = dateAddedMs(b);
  if (aMs === null && bMs === null) return 0;
  if (aMs === null) return 1;
  if (bMs === null) return -1;
  return (aMs - bMs) * direction;
}

export function sortTracks(tracks: Track[], order: SortOrder): Track[] {
  const copy = [...tracks];
  switch (order) {
    case 'least-played':
      return copy.sort((a, b) => (a.playCount || 0) - (b.playCount || 0));
    case 'most-played':
      return copy.sort((a, b) => (b.playCount || 0) - (a.playCount || 0));
    case 'oldest':
      return copy.sort((a, b) => compareByDateAdded(a, b, 1));
    case 'newest':
      return copy.sort((a, b) => compareByDateAdded(a, b, -1));
    case 'random':
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
  }
}
