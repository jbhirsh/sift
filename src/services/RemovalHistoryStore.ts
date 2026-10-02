import * as Sentry from '@sentry/react-native';
import { File, Paths } from 'expo-file-system';
import { RemovalRecord, SiftSource } from '../types';
import { isLegacyLocalFileRecord, isRemovalRecord } from '../utils/validators';

const historyFile = new File(Paths.document, 'removal-history.json');

type HistoryRead =
  | {
      readable: true;
      records: RemovalRecord[];
      /** Entries left out of `records`; a rewrite would lose them. */
      dropped: number;
      /** How many of `dropped` are legacy local-file records (null id). */
      legacy: number;
    }
  | { readable: false; error: Error };

/**
 * Read and validate the history file. A file that parses to an array keeps
 * its usable records and counts the rest as dropped. A file that cannot be
 * parsed as an array at all (typically one cut short by a crash mid-write)
 * comes back as unreadable. Either way, a mutation backs the file up before
 * rewriting it. I/O errors propagate: a failed read is not an empty history.
 */
async function readHistory(): Promise<HistoryRead> {
  if (!historyFile.exists) return { readable: true, records: [], dropped: 0, legacy: 0 };
  const json = await historyFile.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    return { readable: false, error: err instanceof Error ? err : new Error(String(err)) };
  }
  if (!Array.isArray(parsed)) {
    return { readable: false, error: new Error('Removal history is not an array') };
  }
  const records = parsed.filter(isRemovalRecord);
  const dropped = parsed.length - records.length;
  const legacy = dropped === 0 ? 0 : parsed.filter(isLegacyLocalFileRecord).length;
  return { readable: true, records, dropped, legacy };
}

interface MutationBase {
  records: RemovalRecord[];
  /** True when the file was backed up and must be rewritten from `records`. */
  reset: boolean;
}

/**
 * The history a mutation builds on. A file the mutation would not write back
 * in full (unparseable, or with entries that failed validation) is never
 * overwritten silently: it is copied aside first, and a failed copy throws,
 * aborting the mutation so the file stays put. Corruption is reported to
 * Sentry; dropping only legacy local-file records is expected and leaves a
 * breadcrumb. `reset` tells the caller to write even if it changed nothing,
 * so the next mutation doesn't back the same file up again.
 */
async function loadForMutation(): Promise<MutationBase> {
  const result = await readHistory();
  if (result.readable && result.dropped === 0) {
    return { records: result.records, reset: false };
  }
  const backupName = `removal-history.corrupt-${Date.now()}.json`;
  await historyFile.copy(new File(Paths.document, backupName));
  if (!result.readable) {
    Sentry.captureException(result.error, {
      tags: { flow: 'removal-history-backup' },
      extra: { backup: backupName },
    });
    return { records: [], reset: true };
  }
  const malformed = result.dropped - result.legacy;
  if (malformed > 0) {
    Sentry.captureException(
      new Error(`Dropped ${malformed} malformed removal-history record(s)`),
      { tags: { flow: 'removal-history-backup' }, extra: { backup: backupName, legacy: result.legacy } },
    );
  } else {
    Sentry.addBreadcrumb({
      category: 'removal-history',
      message: `Dropped ${result.legacy} legacy local-file record(s); backup ${backupName}`,
      level: 'info',
    });
  }
  return { records: result.records, reset: true };
}

// Every mutation below is an unsynchronized read → filter → write of the
// same file. Two overlapping mutations (e.g. a Restore's removeFromHistory
// racing Start Over's clearHistoryForSource) would each snapshot, then the
// later write would clobber the earlier one with a filtered version of its
// STALE snapshot — resurrecting records the other mutation just removed.
// Serializing every mutation through this module-scoped chain makes each
// one re-read only after the previous write landed. Links never reject
// (each operation catches internally), so the chain cannot get poisoned.
let mutationQueue: Promise<unknown> = Promise.resolve();

function enqueueMutation<T>(operation: () => Promise<T>): Promise<T> {
  const run = mutationQueue.then(operation);
  // Defensive: operations catch internally, but a rejected link must never
  // block every future mutation.
  mutationQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function logRemoval(record: RemovalRecord): Promise<void> {
  return enqueueMutation(async () => {
    try {
      const { records: history } = await loadForMutation();
      history.push(record);
      historyFile.write(JSON.stringify(history));
    } catch (err) {
      Sentry.captureException(err, { tags: { flow: 'removal-history-log' } });
    }
  });
}

/**
 * Drop every history record for a playlist source. Returns false when the
 * rewrite failed so callers (Start Over / Re-sift) can surface the failure
 * instead of silently proceeding with stale exclusions.
 */
export function clearHistoryForSource(playlistId: string): Promise<boolean> {
  return enqueueMutation(async () => {
    try {
      const { records: history } = await loadForMutation();
      const filtered = history.filter(
        (r) => !(r.source.type === 'playlist' && r.source.playlist.id === playlistId),
      );
      historyFile.write(JSON.stringify(filtered));
      return true;
    } catch (err) {
      Sentry.captureException(err, { tags: { flow: 'removal-history-clear' } });
      return false;
    }
  });
}

/**
 * The validated history for read-only use (filtering a sift). Dropped
 * entries are left out quietly here (the next mutation backs the file up and
 * reports), so a playlist load doesn't send an event every time. An
 * unreadable file reads as empty and is reported.
 */
export async function loadHistory(): Promise<RemovalRecord[]> {
  try {
    const result = await readHistory();
    if (result.readable) return result.records;
    Sentry.captureException(result.error, { tags: { flow: 'removal-history-load' } });
    return [];
  } catch (err) {
    Sentry.captureException(err, { tags: { flow: 'removal-history-load' } });
    return [];
  }
}

/**
 * Drop every history record for a track under a given source. Called when a
 * removed track is restored, so it is no longer filtered out of future sifts
 * of that source. Best-effort — a failure is reported but never throws, and
 * the file is only rewritten when something changed (or it was just reset).
 */
export function removeFromHistory(trackId: string, source: SiftSource): Promise<void> {
  return enqueueMutation(async () => {
    try {
      const { records: history, reset } = await loadForMutation();
      const filtered = history.filter(
        (r) => !(r.track.id === trackId && sameSource(r.source, source)),
      );
      // After a reset the file must be rewritten even when nothing matched,
      // or every later Restore would back the same file up again.
      if (reset || filtered.length !== history.length) {
        historyFile.write(JSON.stringify(filtered));
      }
    } catch (err) {
      Sentry.captureException(err, { tags: { flow: 'removal-history-remove' } });
    }
  });
}

/** Two sources match when their type (and, for playlists, their id) are equal. */
function sameSource(a: SiftSource, b: SiftSource): boolean {
  if (a.type === 'playlist' && b.type === 'playlist') {
    return a.playlist.id === b.playlist.id;
  }
  return a.type === b.type;
}
