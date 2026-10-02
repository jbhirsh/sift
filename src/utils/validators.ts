import type { RemovalRecord } from '../types';

/**
 * Type guards for data that enters the app from storage it doesn't control
 * (the removal-history file). A file written by an older or
 * newer build, or cut short by a crash mid-write, can parse as JSON and
 * still be the wrong shape; a bare `as` cast then hands the app values that
 * throw far from where they came in. These check the shape once, at the
 * boundary, so the rest of the app can trust the types.
 */

type UnknownRecord = Record<string, unknown>;

function isObject(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * A removal-history record usable by the app. Deliberately checks only what
 * is read from history — `track.id`, `source.type` and, for playlists,
 * `source.playlist.id` (the store's filters and the sift-load exclusion) —
 * so harmless drift in the other fields doesn't make a record count as
 * malformed and get dropped.
 */
export function isRemovalRecord(value: unknown): value is RemovalRecord {
  if (!isObject(value) || !isObject(value.track) || typeof value.track.id !== 'string') {
    return false;
  }
  const source = value.source;
  if (!isObject(source)) return false;
  if (source.type === 'library') return true;
  return source.type === 'playlist' && isObject(source.playlist) && typeof source.playlist.id === 'string';
}

/**
 * A record main's builds wrote for a Spotify local file: its track id is
 * null. Local files are now skipped when tracks load, so such a record can
 * never match a track again; it is expected legacy data, not corruption.
 */
export function isLegacyLocalFileRecord(value: unknown): boolean {
  return isObject(value) && isObject(value.track) && value.track.id === null;
}
