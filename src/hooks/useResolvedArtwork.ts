import { useState, useEffect, useMemo } from 'react';
import { Platform } from 'react-native';

type ResolveArtworkFn = (trackID: string, w: number, h: number) => Promise<string | null>;

let resolveNative: ResolveArtworkFn | null = null;

if (Platform.OS === 'ios') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../../modules/expo-musickit/src/index');
    resolveNative = mod.resolveArtworkURL as ResolveArtworkFn;
  } catch {
    /* native module not available (e.g. Expo Go) */
  }
}

/** JS-side cache so repeated renders never re-call native. */
const cache = new Map<string, string>();

/**
 * Lazily resolves artwork for a track.
 *
 * - If `artworkURL` is already defined (HTTP), returns it immediately.
 * - If undefined (local MusicKit track), calls the native module to
 *   resolve the musicKit:// URL to a file:// path.
 * - Returns `undefined` while loading or if artwork is unavailable.
 */
export function useResolvedArtwork(
  trackID: string,
  artworkURL: string | undefined,
): string | undefined {
  // Synchronously resolve what we can without an effect
  const syncURL = useMemo(() => {
    if (artworkURL) return artworkURL;
    return cache.get(trackID);
  }, [trackID, artworkURL]);

  const needsNativeResolve = !syncURL && resolveNative != null;
  const [nativeURL, setNativeURL] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!needsNativeResolve || !resolveNative) return;

    let cancelled = false;
    resolveNative(trackID, 600, 600).then((url) => {
      if (url) cache.set(trackID, url);
      if (!cancelled) setNativeURL(url ?? undefined);
    });

    return () => {
      cancelled = true;
    };
  }, [trackID, needsNativeResolve]);

  return syncURL ?? nativeURL;
}

/** Clear the JS-side artwork cache. Exported for testing. */
export function clearArtworkCache(): void {
  cache.clear();
}
