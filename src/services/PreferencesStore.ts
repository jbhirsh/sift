import * as Sentry from '@sentry/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_PREFERENCES, PreferenceChanges, Preferences, TrackFilter } from '../types';
import { ADDED_AGES, PLAY_LIMITS } from '../utils/trackFilter';
import { isSortOrder } from '../utils/validators';

const PREFERENCES_KEY = 'sift_preferences';

/** A stored filter, each choice kept only if Setup still offers it. */
function readFilter(value: unknown): TrackFilter {
  const saved = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const offered = (choices: readonly (number | null)[], choice: unknown): number | null =>
    choices.find((c) => c === choice) ?? null;
  return {
    maxPlays: offered(PLAY_LIMITS, saved.maxPlays),
    addedYearsAgo: offered(ADDED_AGES, saved.addedYearsAgo),
  };
}

/** Stored preferences over the defaults, from the stored JSON (or null). */
function readPreferences(json: string | null): Preferences {
  // Nothing saved reads as JSON null, which falls through to the defaults.
  const parsed: unknown = JSON.parse(json ?? 'null');
  const saved = typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  return {
    startAtChorus:
      typeof saved.startAtChorus === 'boolean' ? saved.startAtChorus : DEFAULT_PREFERENCES.startAtChorus,
    sortOrder: isSortOrder(saved.sortOrder) ? saved.sortOrder : DEFAULT_PREFERENCES.sortOrder,
    filter: readFilter(saved.filter),
  };
}

/**
 * Load saved preferences over the defaults. Unknown keys are ignored and a
 * field with the wrong type (or a choice Setup no longer offers) keeps its
 * default, so a preferences blob from another build can never break the
 * app; a failed read yields the defaults.
 */
export async function loadPreferences(): Promise<Preferences> {
  try {
    return readPreferences(await AsyncStorage.getItem(PREFERENCES_KEY));
  } catch (err) {
    Sentry.captureException(err, { tags: { flow: 'preferences-load' } });
    return { ...DEFAULT_PREFERENCES };
  }
}

// Updates run one at a time: each reads what the last one wrote, so a sort
// change and a Start at chorus toggle close together can't drop each other.
let updates: Promise<void> = Promise.resolve();

/**
 * Save some preferences, keeping the others as stored (Plays and Added each
 * on its own). A failed read writes nothing: writing over defaults would
 * lose the other choices. A stored value that won't parse is written over,
 * or no preference could ever be saved again.
 */
export function updatePreferences(changes: PreferenceChanges): Promise<void> {
  updates = updates.then(async () => {
    let json: string | null;
    try {
      json = await AsyncStorage.getItem(PREFERENCES_KEY);
    } catch (err) {
      Sentry.captureException(err, { tags: { flow: 'preferences-save' } });
      return;
    }
    let current: Preferences;
    try {
      current = readPreferences(json);
    } catch (err) {
      Sentry.captureException(err, { tags: { flow: 'preferences-save' } });
      current = DEFAULT_PREFERENCES;
    }
    const next: Preferences = { ...current, ...changes, filter: { ...current.filter, ...changes.filter } };
    try {
      await AsyncStorage.setItem(PREFERENCES_KEY, JSON.stringify(next));
    } catch (err) {
      Sentry.captureException(err, { tags: { flow: 'preferences-save' } });
    }
  });
  return updates;
}

// Whether the one-time note on the first Apple Music library remove has been
// shown (#141). Kept under its own key, not in the Preferences blob: it is
// written from the Sift screen, and a whole-blob save from there could race
// the Settings toggle and overwrite startAtChorus.
const SEEN_REMOVE_NOTE_KEY = 'sift_seen_remove_note';

// Whether the one-time swipe hint on the first card has been shown, kept
// apart for the same reason.
const SEEN_SWIPE_HINT_KEY = 'sift_seen_swipe_hint';

/** A one-time note's flag. A failed read counts as seen, so the note never nags. */
async function loadSeen(key: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(key)) === '1';
  } catch (err) {
    Sentry.captureException(err, { tags: { flow: 'preferences-load' } });
    return true;
  }
}

async function markSeen(key: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key, '1');
  } catch (err) {
    Sentry.captureException(err, { tags: { flow: 'preferences-save' } });
  }
}

/** True once the first-remove note was shown. */
export function loadSeenRemoveNote(): Promise<boolean> {
  return loadSeen(SEEN_REMOVE_NOTE_KEY);
}

export function markRemoveNoteSeen(): Promise<void> {
  return markSeen(SEEN_REMOVE_NOTE_KEY);
}

/** True once the first card's swipe hint was shown. */
export function loadSeenSwipeHint(): Promise<boolean> {
  return loadSeen(SEEN_SWIPE_HINT_KEY);
}

export function markSwipeHintSeen(): Promise<void> {
  return markSeen(SEEN_SWIPE_HINT_KEY);
}
