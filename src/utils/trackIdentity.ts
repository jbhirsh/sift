import { Track } from '../types';

/**
 * Whether two tracks are the same song for "is it already there?" checks.
 *
 * Apple Music re-identifies a track when it lands in a playlist (catalog id
 * at keep-time vs library-instance id on readback), so id equality alone
 * cannot recognize "this song is already there". Name and artist (exact)
 * with durations within DURATION_TOLERANCE_SECONDS survive that
 * re-identification. A duration of 0 means unknown and doesn't block a
 * match. A tolerance rather than a rounded key (#55): 238.4 s and 238.6 s
 * are the same song, but round to different seconds.
 *
 * Accepted trade-off: two GENUINELY different tracks that share name and
 * artist and come within a second of each other (e.g. same-titled
 * interludes on different albums) count as one song: the second is treated
 * as already present and never double-added. That narrow false positive is
 * the deliberate price of not re-adding every track whose Apple Music id
 * changed, which affects every non-library keep on every re-sift.
 */
export function sameSong(a: Track, b: Track): boolean {
  // One rule: TrackIndex is the implementation, this the pairwise view.
  return new TrackIndex([b]).has(a);
}

export const DURATION_TOLERANCE_SECONDS = 1;

function durationsAgree(a: number, b: number): boolean {
  return a === 0 || b === 0 || Math.abs(a - b) <= DURATION_TOLERANCE_SECONDS;
}

// NUL can't occur in track metadata, so the name/artist key is unambiguous.
const nameArtistKey = (t: Track) => `${t.name}\u0000${t.artist}`;

/** A set of tracks answering sameSong membership without a full scan. */
export class TrackIndex {
  private readonly ids = new Set<string>();
  private readonly durations = new Map<string, number[]>();

  constructor(tracks: readonly Track[] = []) {
    tracks.forEach((t) => this.add(t));
  }

  add(track: Track): void {
    this.ids.add(track.id);
    const key = nameArtistKey(track);
    const known = this.durations.get(key);
    if (known) known.push(track.duration);
    else this.durations.set(key, [track.duration]);
  }

  /** Whether a track that is sameSong as this one was added. */
  has(track: Track): boolean {
    if (this.ids.has(track.id)) return true;
    return this.durations.get(nameArtistKey(track))?.some((d) => durationsAgree(d, track.duration)) ?? false;
  }
}

/**
 * The tracks with repeated ids dropped, first occurrence first (#56). A
 * playlist can hold one song twice, and MusicKit reports both entries under
 * the song's id, so everything keyed by id (removing, restoring, the
 * reviewed ledger, list keys) would conflate the two cards. One card per id matches
 * what a decision does anyway: removing an id removes every entry of it.
 */
export function uniqueTracks(tracks: readonly Track[]): Track[] {
  const seen = new Set<string>();
  return tracks.filter((t) => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });
}
