import { useCallback, useEffect, useRef } from 'react';
import * as Sentry from '@sentry/react-native';
import { useSift } from '../context/SiftContext';
import { createMusicProvider, MusicProviderService } from '../services';

/**
 * Lightweight authorization hook.
 *
 * Owns a provider instance for the current provider type and returns
 * `authorize()`, which runs the real authorization flow and mirrors the
 * result into SiftContext's `connectionStatus` (checking → connected /
 * disconnected). Unlike `useMusicProvider`, it sets up **no** playback
 * polling, so it is safe to mount on an always-rendered screen (e.g. the
 * Settings modal) without a second poller stomping the shared playback
 * position.
 */
export function useProviderAuthorization() {
  const { state, dispatch } = useSift();
  const providerRef = useRef<MusicProviderService>(createMusicProvider(state.provider));

  // Recreate the provider when the provider type changes.
  useEffect(() => {
    providerRef.current = createMusicProvider(state.provider);
  }, [state.provider]);

  const authorize = useCallback(async (): Promise<boolean> => {
    dispatch({ type: 'SET_CONNECTION_STATUS', status: 'checking' });
    try {
      const granted = await providerRef.current.requestAuthorization();
      dispatch({
        type: 'SET_CONNECTION_STATUS',
        status: granted ? 'connected' : 'disconnected',
      });
      return granted;
    } catch (err) {
      Sentry.captureException(err, { tags: { flow: 'authorize' } });
      dispatch({ type: 'SET_CONNECTION_STATUS', status: 'disconnected' });
      return false;
    }
  }, [dispatch]);

  return authorize;
}
