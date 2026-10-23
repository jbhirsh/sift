import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, Paths } from 'expo-file-system';
import { Settings } from 'react-native';
import { launchFlagOn } from '../utils/launchArgs';
import { trace, tracing } from './trace';

// A fresh start for an E2E flow without reinstalling the app. Maestro's
// clearState reinstalls it on iOS (copies the bundle, uninstalls, installs),
// which on a CI runner took 7-30 s per launch, and once the app took 41 s
// more to render after it (52 s in all). A flow launches the E2E build with the
// SiftResetState launch argument instead, and the app clears what it saves
// before anything reads it: AsyncStorage (sessions, preferences, the
// reviewed ledger, the chorus cache) and the documents folder (removal
// history). Only the E2E build reads the argument; a real build never
// clears anything.

function launchedWithReset(): boolean {
  try {
    return launchFlagOn(Settings.get('SiftResetState'));
  } catch {
    return false;
  }
}

/** Whether this launch starts with nothing saved. */
export const resetRequested = tracing && launchedWithReset();

/** Clears everything the app saves. */
export async function resetAppData(): Promise<void> {
  await AsyncStorage.clear();
  for (const entry of new Directory(Paths.document).list()) entry.delete();
  trace('reset', { cleared: 'storage,documents' });
}
