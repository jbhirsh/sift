import * as Sentry from '@sentry/react-native';
import { File, Paths } from 'expo-file-system';
import { RemovalRecord } from '../types';

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
