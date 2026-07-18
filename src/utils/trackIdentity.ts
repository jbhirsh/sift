import { Track } from '../types';

/**
 * Provider-agnostic identity key for a track.
 *
 * Apple Music re-identifies a track when it lands in a playlist (catalog id
 * at keep-time vs library-instance id on readback), so id equality alone
 * cannot recognize "this song is already there". Name/artist/rounded-duration
 * survives that re-identification; NUL separators cannot occur in track
 * metadata, so the key is unambiguous.
 *
 * Accepted trade-off: two GENUINELY different tracks that share name,
 * artist, and rounded duration (e.g. same-titled interludes on different
 * albums) collide — the second is treated as already present and never
 * double-added. That narrow false-positive is the deliberate price of not
 * re-adding every track whose Apple Music id changed, which affects every
 * non-library keep on every re-sift.
 */
export function trackIdentity(t: Track): string {
  return `${t.name}\u0000${t.artist}\u0000${Math.round(t.duration)}`;
}
