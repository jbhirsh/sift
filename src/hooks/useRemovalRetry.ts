import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useMusicProvider } from './useMusicProvider';

/**
 * Retry failed removals (#151) when a screen that shows them opens (the
 * Sift screen, Done) and when the app comes back to the foreground. A
 * removal that succeeds retries the others too (useMusicProvider). With
 * nothing failed, a retry returns at once.
 */
export function useRemovalRetry(): void {
  // Stable: it reads the removal state when it runs, not when it was made.
  const { retryFailedRemovals } = useMusicProvider();
  useEffect(() => {
    void retryFailedRemovals();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void retryFailedRemovals();
    });
    return () => subscription.remove();
  }, [retryFailedRemovals]);
}
