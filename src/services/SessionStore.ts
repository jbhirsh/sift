import AsyncStorage from '@react-native-async-storage/async-storage';
import { SiftSession } from '../types';

const SESSION_KEY = 'sift_session';

export async function saveSession(session: SiftSession): Promise<void> {
  const json = JSON.stringify(session);
  await AsyncStorage.setItem(SESSION_KEY, json);
}

export async function loadSession(): Promise<SiftSession | null> {
  try {
    const json = await AsyncStorage.getItem(SESSION_KEY);
    if (json === null) return null;
    return JSON.parse(json) as SiftSession;
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  await AsyncStorage.removeItem(SESSION_KEY);
}

export async function hasSession(): Promise<boolean> {
  const value = await AsyncStorage.getItem(SESSION_KEY);
  return value !== null;
}
