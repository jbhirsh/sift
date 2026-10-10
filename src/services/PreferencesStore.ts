import * as Sentry from '@sentry/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_PREFERENCES, Preferences } from '../types';

const PREFERENCES_KEY = 'sift_preferences';

/**
 * Load saved preferences over the defaults. Unknown keys are ignored and a
 * field with the wrong type keeps its default, so a preferences blob from
 * another build can never break the app; a failed read yields the defaults.
 */
export async function loadPreferences(): Promise<Preferences> {
  try {
    const json = await AsyncStorage.getItem(PREFERENCES_KEY);
    // Nothing saved reads as JSON null, which falls through to the defaults.
    const parsed: unknown = JSON.parse(json ?? 'null');
    const saved = typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
    return {
      startAtChorus:
        typeof saved.startAtChorus === 'boolean' ? saved.startAtChorus : DEFAULT_PREFERENCES.startAtChorus,
    };
  } catch (err) {
    Sentry.captureException(err, { tags: { flow: 'preferences-load' } });
    return { ...DEFAULT_PREFERENCES };
  }
}

export async function savePreferences(preferences: Preferences): Promise<void> {
  try {
    await AsyncStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
  } catch (err) {
    Sentry.captureException(err, { tags: { flow: 'preferences-save' } });
  }
}

// Whether the one-time note on the first Apple Music library remove has been
// shown (#141). Kept under its own key, not in the Preferences blob: it is
// written from the Sift screen, and a whole-blob save from there could race
// the Settings toggle and overwrite startAtChorus.
const SEEN_REMOVE_NOTE_KEY = 'sift_seen_remove_note';

/** True once the first-remove note was shown. A failed read counts as seen, so the note never nags. */
export async function loadSeenRemoveNote(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(SEEN_REMOVE_NOTE_KEY)) === '1';
  } catch (err) {
    Sentry.captureException(err, { tags: { flow: 'preferences-load' } });
    return true;
  }
}

export async function markRemoveNoteSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(SEEN_REMOVE_NOTE_KEY, '1');
  } catch (err) {
    Sentry.captureException(err, { tags: { flow: 'preferences-save' } });
  }
}
