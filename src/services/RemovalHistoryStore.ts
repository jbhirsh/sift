import * as Sentry from '@sentry/react-native';
import { File, Paths } from 'expo-file-system';
import { RemovalRecord, SiftSource } from '../types';

const historyFile = new File(Paths.document, 'removal-history.json');

export async function logRemoval(record: RemovalRecord): Promise<void> {
  try {
    const history = await loadHistory();
    history.push(record);
    historyFile.write(JSON.stringify(history));
  } catch (err) {
    Sentry.captureException(err, { tags: { flow: 'removal-history-log' } });
  }
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
export async function removeFromHistory(trackId: string, source: SiftSource): Promise<void> {
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
}

/** Two sources match when their type (and, for playlists, their id) are equal. */
function sameSource(a: SiftSource, b: SiftSource): boolean {
  if (a.type === 'playlist' && b.type === 'playlist') {
    return a.playlist.id === b.playlist.id;
  }
  return a.type === b.type;
}
