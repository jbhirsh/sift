import * as Sentry from '@sentry/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { mergeIntoLedger, parseLedger } from '../utils/reviewedLedger';

const LEDGER_KEY = 'sift_reviewed_ledger';

/**
 * The ids kept in earlier sifts of a source (#143). A failed read is an empty
 * ledger: the sift then offers songs again rather than not loading.
 */
export async function loadReviewedIds(key: string): Promise<Set<string>> {
  try {
    const ledger = parseLedger(await AsyncStorage.getItem(LEDGER_KEY));
    return new Set(ledger[key] ?? []);
  } catch (err) {
    Sentry.captureException(err, { tags: { flow: 'reviewed-ledger-load' } });
    return new Set();
  }
}

// Keeps waiting to be written, by source key. A keep only adds to this and
// starts a flush if none is running, so a run of quick keeps costs one or two
// writes rather than one each (the ledger can hold thousands of ids), and a
// read → merge → write never overlaps another.
const pending = new Map<string, Set<string>>();
let flushing: Promise<void> | null = null;

async function flush(): Promise<void> {
  while (pending.size > 0) {
    const batch = new Map(pending);
    pending.clear();
    try {
      let ledger;
      try {
        ledger = parseLedger(await AsyncStorage.getItem(LEDGER_KEY));
      } catch (err) {
        // Unparseable: start over rather than never recording again. Losing
        // the ledger only means kept songs are offered once more.
        if (!(err instanceof SyntaxError)) throw err;
        Sentry.captureException(err, { tags: { flow: 'reviewed-ledger-reset' } });
        ledger = {};
      }
      for (const [key, ids] of batch) ledger = mergeIntoLedger(ledger, key, ids);
      await AsyncStorage.setItem(LEDGER_KEY, JSON.stringify(ledger));
    } catch (err) {
      Sentry.captureException(err, { tags: { flow: 'reviewed-ledger-save' } });
    }
  }
  // In the same synchronous step as the empty check above, so a keep can't
  // land in between and be left waiting for the next one.
  flushing = null;
}

/**
 * Record a kept song so later sifts of the source leave it out. Never
 * rejects; resolves once the write that includes it has landed (or failed,
 * which is reported).
 */
export function markReviewed(key: string, trackId: string): Promise<void> {
  const ids = pending.get(key) ?? new Set<string>();
  ids.add(trackId);
  pending.set(key, ids);
  flushing ??= flush();
  return flushing;
}
