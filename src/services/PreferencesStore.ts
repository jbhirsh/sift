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
