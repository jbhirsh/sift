import * as Sentry from '@sentry/react-native';
import { File, Paths } from 'expo-file-system';
import { RemovalRecord, SiftSource } from '../types';

const historyFile = new File(Paths.document, 'removal-history.json');

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
      const history = await loadHistory();
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
      const history = await loadHistory();
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

export async function loadHistory(): Promise<RemovalRecord[]> {
  try {
    if (!historyFile.exists) return [];
    const json = await historyFile.text();
    return JSON.parse(json) as RemovalRecord[];
  } catch (err) {
    Sentry.captureException(err, { tags: { flow: 'removal-history-load' } });
    return [];
  }
}

/**
 * Drop every history record for a track under a given source. Called when a
 * removed track is restored, so it is no longer filtered out of future sifts
 * of that source. Best-effort — a failure is reported but never throws, and
 * the file is only rewritten when something actually changed.
 */
export function removeFromHistory(trackId: string, source: SiftSource): Promise<void> {
  return enqueueMutation(async () => {
    try {
      const history = await loadHistory();
      const filtered = history.filter(
        (r) => !(r.track.id === trackId && sameSource(r.source, source)),
      );
      if (filtered.length !== history.length) {
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
