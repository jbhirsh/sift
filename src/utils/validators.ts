import {
  PROVIDER_DISPLAY,
  SORT_ORDER_DISPLAY,
  type MusicProvider,
  type Playlist,
  type RemovalRecord,
  type SiftSession,
  type SiftSource,
  type SortOrder,
  type Track,
} from '../types';

/**
 * Type guards for data that enters the app from storage it doesn't control
 * (AsyncStorage, the removal-history file). A file written by an older or
 * newer build, or cut short by a crash mid-write, can parse as JSON and
 * still be the wrong shape; a bare `as` cast then hands the app values that
 * throw far from where they came in. These check the shape once, at the
 * boundary, so the rest of the app can trust the types.
 */

type UnknownRecord = Record<string, unknown>;

function isObject(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function isArrayOf<T>(value: unknown, guard: (item: unknown) => item is T): value is T[] {
  return Array.isArray(value) && value.every(guard);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isSortOrder(value: unknown): value is SortOrder {
  return typeof value === 'string' && Object.hasOwn(SORT_ORDER_DISPLAY, value);
}

function isMusicProvider(value: unknown): value is MusicProvider {
  return typeof value === 'string' && Object.hasOwn(PROVIDER_DISPLAY, value);
}

export function isTrack(value: unknown): value is Track {
  return (
    isObject(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.artist === 'string' &&
    typeof value.album === 'string' &&
    isFiniteNumber(value.duration) &&
    isFiniteNumber(value.playCount) &&
    typeof value.dateAdded === 'string' &&
    isOptionalString(value.artworkURL) &&
    isOptionalString(value.previewURL)
  );
}

function isPlaylist(value: unknown): value is Playlist {
  return (
    isObject(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    isFiniteNumber(value.trackCount) &&
    isOptionalString(value.artworkURL)
  );
}

export function isSiftSource(value: unknown): value is SiftSource {
  if (!isObject(value)) return false;
  if (value.type === 'library') return true;
  return value.type === 'playlist' && isPlaylist(value.playlist);
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

/** A track main's builds kept for a Spotify local file: its id is null. */
function isIdlessTrack(value: unknown): boolean {
  return isObject(value) && value.id === null;
}

/**
 * Bring a session saved by an older build up to the current shape before it
 * is validated. Builds before Spotify local files were skipped saved them as
 * tracks with a null id; they are dropped from every track list here (they
 * are skipped on load now), and the cursor moves back by the number dropped
 * before it so it still points at the same next track. Anything else is
 * returned unchanged for isSiftSession to judge.
 */
export function migrateLegacySession(value: unknown): unknown {
  if (!isObject(value) || !Array.isArray(value.tracks)) return value;
  const migrated: UnknownRecord = { ...value };
  const { tracks, cursor } = value;
  if (typeof cursor === 'number') {
    const droppedBeforeCursor = tracks.slice(0, Math.max(0, cursor)).filter(isIdlessTrack).length;
    migrated.cursor = cursor - droppedBeforeCursor;
  }
  for (const key of ['tracks', 'kept', 'removed', 'skipped', 'pendingKeeps']) {
    const list = value[key];
    if (Array.isArray(list)) {
      migrated[key] = list.filter((item) => !isIdlessTrack(item));
    }
  }
  return migrated;
}

export function isSiftSession(value: unknown): value is SiftSession {
  return (
    isObject(value) &&
    isArrayOf(value.tracks, isTrack) &&
    isFiniteNumber(value.cursor) &&
    Number.isInteger(value.cursor) &&
    value.cursor >= 0 &&
    isArrayOf(value.kept, isTrack) &&
    isArrayOf(value.removed, isTrack) &&
    isArrayOf(value.skipped, isTrack) &&
    isSortOrder(value.sortOrder) &&
    typeof value.savedAt === 'string' &&
    (value.provider === undefined || isMusicProvider(value.provider)) &&
    (value.source === undefined || isSiftSource(value.source)) &&
    (value.pendingKeeps === undefined || isArrayOf(value.pendingKeeps, isTrack)) &&
    (value.removalErrors === undefined || isArrayOf(value.removalErrors, isString)) &&
    (value.siftedPlaylistId === undefined ||
      value.siftedPlaylistId === null ||
      typeof value.siftedPlaylistId === 'string')
  );
}
