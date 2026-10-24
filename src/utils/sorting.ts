import { Track, SortOrder } from '../types';

/**
 * Parse a track's dateAdded into epoch ms, or null when it is missing or
 * unparseable. Non-library playlist tracks have no date added, which
 * toTrack (utils/musicKit) turns into `dateAdded: ""`, and
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

/**
 * A name as the Artist and Album sorts compare it (#176): case and a
 * leading "The " ignored, so The Weeknd files under W. Empty when there is
 * no name.
 */
export function sortName(name: string): string {
  return name
    .trim()
    .replace(/^the\s+/i, '')
    .toLocaleLowerCase('en-US');
}

const collator = new Intl.Collator('en-US', { sensitivity: 'base', numeric: true });

/**
 * The artist a song is filed under: its credit without a featured guest
 * (Apple credits "Doja Cat feat. SZA" per song), so an album with guests
 * stays one run and those songs sit with the artist's others.
 */
export function primaryArtist(artist: string): string {
  return artist.split(/\s+(?:feat\.?|ft\.?|featuring)\s+|\s*[([](?:feat\.?|ft\.?|featuring)\s/i)[0];
}

/** Two names, a missing one after any other. */
function compareNames(a: string, b: string): number {
  const x = sortName(a);
  const y = sortName(b);
  if (!x || !y) return (x ? 0 : 1) - (y ? 0 : 1);
  return collator.compare(x, y);
}

const compareArtists = (a: Track, b: Track) =>
  compareNames(primaryArtist(a.artist), primaryArtist(b.artist));

/**
 * Album order: disc, then track. A song without a track number (a playlist
 * entry from an older build, say) comes after the album's numbered ones;
 * those, and ties, by title.
 */
function compareTrackOrder(a: Track, b: Track): number {
  if (a.trackNumber == null || b.trackNumber == null) {
    const unnumbered = (a.trackNumber == null ? 1 : 0) - (b.trackNumber == null ? 1 : 0);
    return unnumbered || collator.compare(a.name, b.name);
  }
  return (
    (a.discNumber ?? 1) - (b.discNumber ?? 1) ||
    a.trackNumber - b.trackNumber ||
    collator.compare(a.name, b.name)
  );
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
    // An artist's songs together, album by album, each in album order.
    case 'artist':
      return copy.sort(
        (a, b) => compareArtists(a, b) || compareNames(a.album, b.album) || compareTrackOrder(a, b),
      );
    // An album's songs together, in album order. Two albums with the same
    // title (two "Greatest Hits") stay apart, by (main) artist.
    case 'album':
      return copy.sort(
        (a, b) => compareNames(a.album, b.album) || compareArtists(a, b) || compareTrackOrder(a, b),
      );
    case 'random':
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
  }
}
