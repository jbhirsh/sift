import * as Sentry from '@sentry/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { mergeIntoLedger, parseLedger, removeFromLedger } from '../utils/reviewedLedger';

const LEDGER_KEY = 'sift_reviewed_ledger';

// Keeps waiting to be written, by source key. A keep only adds to this and
// starts a flush if none is running, so a run of quick keeps costs one or two
// writes rather than one each (the ledger can hold thousands of ids), and a
// read → merge → write never overlaps another.
const pending = new Map<string, Set<string>>();
// The batch a running write is storing, still visible to loads until it lands.
let writing = new Map<string, Set<string>>();
// The same for keeps taken back (a decision changed from Keep), which the
// same writes take out of the ledger.
const pendingRemovals = new Map<string, Set<string>>();
let removing = new Map<string, Set<string>>();
let flushing: Promise<void> | null = null;
// Keeps taken back this launch, by source key, until kept again: the
// one-time "- Sifted" import (services/SiftedImport) must not bring back a
// keep the user just changed.
const takenBackIds = new Map<string, Set<string>>();

function idsIn(batches: Map<string, Set<string>>[], key: string): string[] {
  return batches.flatMap((batch) => [...(batch.get(key) ?? [])]);
}

/** Move an id from one batch of pending changes to the other. */
function queue(
  to: Map<string, Set<string>>,
  from: Map<string, Set<string>>,
  key: string,
  trackId: string,
): void {
  const undone = from.get(key);
  undone?.delete(trackId);
  if (undone?.size === 0) from.delete(key);
  const ids = to.get(key) ?? new Set<string>();
  ids.add(trackId);
  to.set(key, ids);
}

/**
 * The ids kept in earlier sifts of a source (#143). A failed read is an empty
 * ledger: the sift then offers songs again rather than not loading.
 */
export async function loadReviewedIds(key: string): Promise<Set<string>> {
  let stored: string[] = [];
  try {
    stored = parseLedger(await AsyncStorage.getItem(LEDGER_KEY))[key] ?? [];
  } catch (err) {
    Sentry.captureException(err, { tags: { flow: 'reviewed-ledger-load' } });
  }
  // Plus keeps not written yet, so one made just before counts too, less
  // ones taken back. A change waiting to be written is newer than one being
  // written, so it decides.
  const ids = new Set(stored);
  for (const id of idsIn([writing], key)) ids.add(id);
  for (const id of idsIn([removing], key)) ids.delete(id);
  for (const id of idsIn([pending], key)) ids.add(id);
  for (const id of idsIn([pendingRemovals], key)) ids.delete(id);
  return ids;
}

async function flush(): Promise<void> {
  while (pending.size > 0 || pendingRemovals.size > 0) {
    const batch = new Map(pending);
    const removals = new Map(pendingRemovals);
    writing = batch;
    removing = removals;
    pending.clear();
    pendingRemovals.clear();
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
      for (const [key, ids] of removals) ledger = removeFromLedger(ledger, key, ids);
      await AsyncStorage.setItem(LEDGER_KEY, JSON.stringify(ledger));
    } catch (err) {
      Sentry.captureException(err, { tags: { flow: 'reviewed-ledger-save' } });
    }
  }
  // In the same synchronous step as the empty check above, so a keep can't
  // land in between and be left waiting for the next one.
  writing = new Map();
  removing = new Map();
  flushing = null;
}

/**
 * Record a kept song so later sifts of the source leave it out. Never
 * rejects; resolves once the write that includes it has landed (or failed,
 * which is reported).
 */
export function markReviewed(key: string, trackId: string): Promise<void> {
  takenBackIds.get(key)?.delete(trackId);
  queue(pending, pendingRemovals, key, trackId);
  flushing ??= flush();
  return flushing;
}

/**
 * Take a kept song back out (its decision changed), so later sifts offer
 * it again. Like markReviewed: never rejects, resolves once written.
 */
export function unmarkReviewed(key: string, trackId: string): Promise<void> {
  const ids = takenBackIds.get(key) ?? new Set<string>();
  ids.add(trackId);
  takenBackIds.set(key, ids);
  queue(pendingRemovals, pending, key, trackId);
  flushing ??= flush();
  return flushing;
}

/** Keeps of a source taken back this launch and not kept again since. */
export function takenBack(key: string): ReadonlySet<string> {
  return takenBackIds.get(key) ?? new Set();
}

/**
 * The ids the stored ledger holds for a source, as written: no keeps still
 * waiting to be written. Rejects when it can't be read.
 */
export async function storedReviewedIds(key: string): Promise<Set<string>> {
  return new Set(parseLedger(await AsyncStorage.getItem(LEDGER_KEY))[key] ?? []);
}
