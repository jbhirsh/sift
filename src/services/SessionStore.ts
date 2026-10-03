import * as Sentry from '@sentry/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SiftSession } from '../types';
import { isSiftSession, migrateLegacySession } from '../utils/validators';

const SESSION_KEY = 'sift_session';
// Where a session that fails validation is set aside rather than deleted,
// so a validator bug never destroys a user's sift beyond recovery.
const INVALID_SESSION_KEY = 'sift_session.invalid';

export async function saveSession(session: SiftSession): Promise<void> {
  try {
    const json = JSON.stringify(session);
    await AsyncStorage.setItem(SESSION_KEY, json);
  } catch (err) {
    Sentry.captureException(err, { tags: { flow: 'session-save' } });
  }
}

/**
 * Load the saved session, migrated and validated. A session another build
 * saved (or a truncated write) can parse yet lack fields the resume path
 * reads, which used to crash Setup and the resume modal. Legacy shapes are
 * migrated first (see migrateLegacySession). A session that is still
 * invalid counts as no session: it is reported and moved aside to
 * INVALID_SESSION_KEY, so it isn't offered again but can be recovered. A
 * failed read leaves the stored session alone — it may well be valid.
 */
export async function loadSession(): Promise<SiftSession | null> {
  let json: string | null;
  try {
    json = await AsyncStorage.getItem(SESSION_KEY);
  } catch (err) {
    Sentry.captureException(err, { tags: { flow: 'session-load' } });
    return null;
  }
  if (json === null) return null;
  try {
    const parsed = migrateLegacySession(JSON.parse(json));
    if (isSiftSession(parsed)) return parsed;
    throw new Error('Saved session has an unexpected shape');
  } catch (err) {
    // Set aside first so a failure to do so rides along as a breadcrumb on
    // the one event reported for this session.
    await setAsideInvalidSession(json);
    Sentry.captureException(err, { tags: { flow: 'session-load' } });
    return null;
  }
}

/** Move an invalid session's raw JSON aside; keep it in place if that fails. */
async function setAsideInvalidSession(json: string): Promise<void> {
  try {
    await AsyncStorage.setItem(INVALID_SESSION_KEY, json);
  } catch (err) {
    Sentry.addBreadcrumb({
      category: 'session',
      message: `Set aside invalid session failed, left in place: ${err}`,
      level: 'warning',
    });
    return;
  }
  await clearSession();
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
