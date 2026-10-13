import type { Track, TrackFilter } from '../types';

/** The play limits Setup offers, no limit first. */
export const PLAY_LIMITS: readonly (number | null)[] = [null, 0, 5, 20];
/** The added-before ages Setup offers, in years, no limit first. */
export const ADDED_AGES: readonly (number | null)[] = [null, 1, 3, 5];

/** A play limit as Setup shows it. */
export function playLimitLabel(maxPlays: number | null): string {
  if (maxPlays == null) return 'Any';
  if (maxPlays === 0) return 'Never played';
  return `${maxPlays} or fewer`;
}

/** An added-before age as Setup shows it. */
export function addedAgeLabel(years: number | null): string {
  if (years == null) return 'Any time';
  return years === 1 ? 'Over a year ago' : `Over ${years} years ago`;
}

export function isFiltering(filter: TrackFilter): boolean {
  return filter.maxPlays != null || filter.addedYearsAgo != null;
}

/**
 * Whether a song passes the filter at `now`. A song whose date added isn't
 * known (a playlist entry that isn't a library song) can't be shown to be
 * old enough, so a date limit leaves it out. Such an entry reads as never
 * played (no play count), as the least-played sort treats it.
 */
export function matchesFilter(track: Track, filter: TrackFilter, now: Date): boolean {
  if (filter.maxPlays != null && track.playCount > filter.maxPlays) return false;
  if (filter.addedYearsAgo != null) {
    const added = Date.parse(track.dateAdded);
    if (Number.isNaN(added)) return false;
    const cutoff = new Date(now);
    cutoff.setFullYear(cutoff.getFullYear() - filter.addedYearsAgo);
    if (added > cutoff.getTime()) return false;
  }
  return true;
}
