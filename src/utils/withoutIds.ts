import type { Track } from '../types';

/**
 * The tracks whose ids aren't in `ids`, and how many that left out. A load
 * filters by several such sets (earlier keeps, earlier removals) and tells
 * the user which one emptied the sift, so each count matters.
 */
export function withoutIds(
  tracks: readonly Track[],
  ids: ReadonlySet<string>,
): { tracks: Track[]; dropped: number } {
  const kept = tracks.filter((t) => !ids.has(t.id));
  return { tracks: kept, dropped: tracks.length - kept.length };
}
