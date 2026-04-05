import * as Sentry from '@sentry/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SiftSession } from '../types';

const SESSION_KEY = 'sift_session';

export async function saveSession(session: SiftSession): Promise<void> {
  try {
    const json = JSON.stringify(session);
    await AsyncStorage.setItem(SESSION_KEY, json);
  } catch (err) {
    Sentry.captureException(err, { tags: { flow: 'session-save' } });
  }
}

export async function loadSession(): Promise<SiftSession | null> {
  try {
    const json = await AsyncStorage.getItem(SESSION_KEY);
    if (json === null) return null;
    return JSON.parse(json) as SiftSession;
  } catch (err) {
    Sentry.captureException(err, { tags: { flow: 'session-load' } });
    return null;
  }
}

export async function clearSession(): Promise<void> {
  try {
    await AsyncStorage.removeItem(SESSION_KEY);
  } catch (err) {
    Sentry.addBreadcrumb({ category: 'session', message: `Clear session failed: ${err}`, level: 'warning' });
  }
}

export async function hasSession(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(SESSION_KEY);
    return value !== null;
  } catch (err) {
    Sentry.addBreadcrumb({ category: 'session', message: `Check session failed: ${err}`, level: 'warning' });
    return false;
  }
}
