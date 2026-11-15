import { useSyncExternalStore } from 'react';
import { isMarked, subscribeMarks } from '../services/e2eMarks';

/** Whether the E2E mark `name` (services/e2eMarks) has been reached, kept current. */
export function useE2eMark(name: string): boolean {
  return useSyncExternalStore(subscribeMarks, () => isMarked(name));
}
