import * as Sentry from '@sentry/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SiftSession, Track } from '../types';
import { fromCompact, toCompact, type TracksSlot } from '../utils/sessionFormat';
import { isCompactSession, isSiftSession, isStoredTracks, migrateLegacySession } from '../utils/validators';

// The compact format (#150): the track list once, under its own key, and a
// small record of ids per decision. See utils/sessionFormat.
const STATE_KEY = 'sift_session_v2';
const tracksKey = (slot: TracksSlot) => `sift_session_v2_tracks_${slot}`;
const ALL_TRACKS_KEYS = [tracksKey('a'), tracksKey('b')];
// The whole session as one JSON blob, as builds before #150 saved it. Read
// when there is no compact session yet, and removed only once a compact one
// has been written, so a failed migration can't lose the sift.
const LEGACY_KEY = 'sift_session';
// Where a session that fails validation is set aside rather than deleted,
// so a validator bug never destroys a user's sift beyond recovery.
const INVALID_SESSION_KEY = 'sift_session.invalid';

// The track list last written (or loaded), its version and slot. A save
// rewrites the list only when the session holds a different array; the
// reducer replaces the array whenever the list changes (a load, a re-sort).
let storedTracks: { tracks: readonly Track[]; version: string; slot: TracksSlot } | null = null;
// The slot the compact record on disk points at. A new list never goes
// there, so the record and its list stay a pair until the record moves.
let committedSlot: TracksSlot | null = null;
// Whether the legacy key may still hold a session.
let legacyMayExist = true;
let versionCounter = 0;

// Saves, loads and clears run one at a time, in order: a save still writing
// when Start Over clears the session must not land after the clear, and a
// load must not read between a save's two writes.
let queue: Promise<unknown> = Promise.resolve();
function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const run = queue.then(operation);
  queue = run.catch(() => undefined);
  return run;
}

export function saveSession(session: SiftSession): Promise<void> {
  return enqueue(async () => {
    try {
      if (storedTracks?.tracks !== session.tracks) {
        const version = `${Date.now().toString(36)}-${(versionCounter += 1)}`;
        const slot: TracksSlot = committedSlot === 'a' ? 'b' : 'a';
        // Forget the old list first: if this write fails, the next save
        // must try again rather than point at a list that isn't there.
        storedTracks = null;
        await AsyncStorage.setItem(tracksKey(slot), JSON.stringify({ version, tracks: session.tracks }));
        storedTracks = { tracks: session.tracks, version, slot };
      }
      await AsyncStorage.setItem(STATE_KEY, JSON.stringify(toCompact(session, storedTracks)));
      committedSlot = storedTracks.slot;
      if (legacyMayExist) {
        await AsyncStorage.removeItem(LEGACY_KEY);
        legacyMayExist = false;
      }
    } catch (err) {
      Sentry.captureException(err, { tags: { flow: 'session-save' } });
    }
  });
}

/**
 * Load the saved session, migrated and validated. A session another build
 * saved (or a truncated write) can parse yet lack fields the resume path
 * reads, which used to crash Setup and the resume modal. A compact session
 * comes first; without one, a legacy session is migrated (see
 * migrateLegacySession). A session that is still invalid counts as no
 * session: it is reported and moved aside to INVALID_SESSION_KEY, so it
 * isn't offered again but can be recovered. A failed read leaves the stored
 * session alone — it may well be valid.
 */
export function loadSession(): Promise<SiftSession | null> {
  return enqueue(loadQueued);
}

async function loadQueued(): Promise<SiftSession | null> {
  let stateJson: string | null;
  let tracksJson: string | null;
  try {
    stateJson = await AsyncStorage.getItem(STATE_KEY);
    const slot = stateJson === null ? null : slotOf(stateJson);
    tracksJson = slot === null ? null : await AsyncStorage.getItem(tracksKey(slot));
  } catch (err) {
    Sentry.captureException(err, { tags: { flow: 'session-load' } });
    return null;
  }
  if (stateJson !== null) {
    try {
      const compact: unknown = JSON.parse(stateJson);
      const stored: unknown = JSON.parse(tracksJson ?? 'null');
      if (!isCompactSession(compact)) throw new Error('Saved session has an unexpected shape');
      if (!isStoredTracks(stored)) throw new Error('Saved session has no valid track list');
      // The list this store last wrote or loaded, when it is the one on
      // disk: the resumed session then holds the same array, and the next
      // save doesn't rewrite a list that hasn't changed.
      const tracks = storedTracks?.version === stored.version ? (storedTracks.tracks as Track[]) : stored.tracks;
      const session = fromCompact(compact, { version: stored.version, tracks });
      if (!session || !isSiftSession(session)) throw new Error('Saved session does not match its track list');
      storedTracks = { tracks: session.tracks, version: stored.version, slot: compact.tracksSlot };
      committedSlot = compact.tracksSlot;
      return session;
    } catch (err) {
      await setAside(JSON.stringify({ state: stateJson, tracks: tracksJson }), [STATE_KEY, ...ALL_TRACKS_KEYS]);
      Sentry.captureException(err, { tags: { flow: 'session-load' } });
      // A legacy session still on disk is the one this replaced: offer it.
      return loadLegacySession();
    }
  }
  return loadLegacySession();
}

/** The slot a stored record names, or null when it can't be read. */
function slotOf(stateJson: string): TracksSlot | null {
  try {
    const slot: unknown = (JSON.parse(stateJson) as { tracksSlot?: unknown } | null)?.tracksSlot;
    return slot === 'a' || slot === 'b' ? slot : null;
  } catch {
    return null;
  }
}

async function loadLegacySession(): Promise<SiftSession | null> {
  let json: string | null;
  try {
    json = await AsyncStorage.getItem(LEGACY_KEY);
  } catch (err) {
    Sentry.captureException(err, { tags: { flow: 'session-load' } });
    return null;
  }
  if (json === null) {
    legacyMayExist = false;
    return null;
  }
  try {
    const parsed = migrateLegacySession(JSON.parse(json));
    if (isSiftSession(parsed)) return parsed;
    throw new Error('Saved session has an unexpected shape');
  } catch (err) {
    // Set aside first so a failure to do so rides along as a breadcrumb on
    // the one event reported for this session.
    await setAside(json, [LEGACY_KEY]);
    Sentry.captureException(err, { tags: { flow: 'session-load' } });
    return null;
  }
}

/** Move an invalid session's raw JSON aside; keep it in place if that fails. */
async function setAside(raw: string, keys: string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(INVALID_SESSION_KEY, raw);
  } catch (err) {
    Sentry.addBreadcrumb({
      category: 'session',
      message: `Set aside invalid session failed, left in place: ${err}`,
      level: 'warning',
    });
    return;
  }
  await removeKeys(keys);
}

/** Remove keys; false (and a breadcrumb) when one couldn't be removed. */
async function removeKeys(keys: string[]): Promise<boolean> {
  try {
    for (const key of keys) await AsyncStorage.removeItem(key);
    return true;
  } catch (err) {
    Sentry.addBreadcrumb({ category: 'session', message: `Clear session failed: ${err}`, level: 'warning' });
    return false;
  }
}

export function clearSession(): Promise<void> {
  return enqueue(async () => {
    storedTracks = null;
    committedSlot = null;
    if (await removeKeys([STATE_KEY, ...ALL_TRACKS_KEYS, LEGACY_KEY])) legacyMayExist = false;
  });
}

export async function hasSession(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(STATE_KEY)) !== null || (await AsyncStorage.getItem(LEGACY_KEY)) !== null;
  } catch (err) {
    Sentry.addBreadcrumb({ category: 'session', message: `Check session failed: ${err}`, level: 'warning' });
    return false;
  }
}
