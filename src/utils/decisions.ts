import type { Decision, Track } from '../types';

interface Decided {
  kept: readonly Track[];
  removed: readonly Track[];
  skipped: readonly Track[];
}

/** What was decided for a song this sift, or null if it hasn't been. */
export function decisionFor(trackId: string, { kept, removed, skipped }: Decided): Decision | null {
  if (kept.some((t) => t.id === trackId)) return 'keep';
  if (removed.some((t) => t.id === trackId)) return 'remove';
  if (skipped.some((t) => t.id === trackId)) return 'skip';
  return null;
}

/** The cards decided so far, the latest first: cards are decided in order. */
export function decidedLatestFirst(tracks: readonly Track[], cursor: number): Track[] {
  return tracks.slice(0, Math.max(0, cursor)).reverse();
}
