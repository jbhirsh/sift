import type { SiftSession, Track } from '../types';

/**
 * The compact session format (#150). The old format stringified the whole
 * session on every decision: every track, plus full copies in kept, removed
 * and skipped (2.35 MB per decision at 5,000 tracks). Now the track list is
 * stored once, under its own key, and each decision writes only this: ids,
 * the cursor and the small fields.
 */
export interface CompactSession {
  v: 2;
  /**
   * Which of the two track-list slots holds this session's list. A new list
   * goes in the other slot, so a crash between writing it and writing this
   * record leaves the list this record points at intact.
   */
  tracksSlot: TracksSlot;
  /** The list version this record goes with (StoredTracks.version). */
  tracksVersion: string;
  cursor: number;
  keptIds: string[];
  removedIds: string[];
  skippedIds: string[];
  sortOrder: SiftSession['sortOrder'];
  savedAt: string;
  provider?: SiftSession['provider'];
  source?: SiftSession['source'];
  /** Full tracks: few, and needed even if the list changes under them. */
  pendingKeeps?: Track[];
  removalErrors?: string[];
  failedRemovalIds?: string[];
  siftedPlaylistId?: string | null;
  pending?: SiftSession['pending'];
}

export type TracksSlot = 'a' | 'b';

export interface StoredTracks {
  version: string;
  tracks: Track[];
}

export function toCompact(
  session: SiftSession,
  { slot, version }: { slot: TracksSlot; version: string },
): CompactSession {
  const ids = (list: readonly Track[]) => list.map((t) => t.id);
  return {
    v: 2,
    tracksSlot: slot,
    tracksVersion: version,
    cursor: session.cursor,
    keptIds: ids(session.kept),
    removedIds: ids(session.removed),
    skippedIds: ids(session.skipped),
    sortOrder: session.sortOrder,
    savedAt: session.savedAt,
    provider: session.provider,
    source: session.source,
    pendingKeeps: session.pendingKeeps,
    removalErrors: session.removalErrors,
    failedRemovalIds: session.failedRemovalIds,
    siftedPlaylistId: session.siftedPlaylistId,
    pending: session.pending,
  };
}

/**
 * Rebuild the session from its compact record and the stored track list.
 * Null when they don't go together (a different list version, or an id the
 * list doesn't have): the caller falls back rather than resuming a sift
 * with holes in it.
 */
export function fromCompact(compact: CompactSession, stored: StoredTracks): SiftSession | null {
  if (compact.tracksVersion !== stored.version) return null;
  if (compact.cursor > stored.tracks.length) return null;
  const byId = new Map(stored.tracks.map((t) => [t.id, t]));
  const lookup = (idList: readonly string[]): Track[] | null => {
    const tracks: Track[] = [];
    for (const id of idList) {
      const track = byId.get(id);
      if (!track) return null;
      tracks.push(track);
    }
    return tracks;
  };
  const kept = lookup(compact.keptIds);
  const removed = lookup(compact.removedIds);
  const skipped = lookup(compact.skippedIds);
  if (!kept || !removed || !skipped) return null;
  const session: SiftSession = {
    tracks: stored.tracks,
    cursor: compact.cursor,
    kept,
    removed,
    skipped,
    sortOrder: compact.sortOrder,
    savedAt: compact.savedAt,
  };
  // Optional fields stay absent when they were, as in the old format.
  if (compact.provider !== undefined) session.provider = compact.provider;
  if (compact.source !== undefined) session.source = compact.source;
  if (compact.pendingKeeps !== undefined) session.pendingKeeps = compact.pendingKeeps;
  if (compact.removalErrors !== undefined) session.removalErrors = compact.removalErrors;
  if (compact.failedRemovalIds !== undefined) session.failedRemovalIds = compact.failedRemovalIds;
  if (compact.siftedPlaylistId !== undefined) session.siftedPlaylistId = compact.siftedPlaylistId;
  if (compact.pending !== undefined) session.pending = compact.pending;
  return session;
}
