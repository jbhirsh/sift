import React, { createContext, ReactNode, useContext, useEffect, useMemo, useRef } from 'react';
import { createMusicProvider, MusicProviderService } from '../services';
import type { MusicProvider } from '../types';

const POLL_INTERVAL_MS = 500;

const MusicProviderContext = createContext<{ readonly current: MusicProviderService } | null>(null);

/**
 * Owns the one music provider the app uses, and its playback poller (#144).
 * Every useMusicProvider shares it, so there is one player, one poller and
 * one native module load (with its Sentry breadcrumb) per provider change,
 * not one per component per render.
 */
export function MusicProviderHost({
  provider,
  isPlaying,
  onPosition,
  children,
}: {
  provider: MusicProvider;
  isPlaying: boolean;
  /** Called with the playing song's position while it plays. */
  onPosition: (position: number) => void;
  children: ReactNode;
}) {
  const service = useMemo(() => createMusicProvider(provider), [provider]);
  // A stable box for callbacks that outlive a render.
  const serviceRef = useRef(service);
  useEffect(() => {
    serviceRef.current = service;
  }, [service]);

  useEffect(() => {
    if (!isPlaying) return;
    const timer = setInterval(() => {
      const playback = serviceRef.current.getPlaybackState();
      // A song that ended reports its reset position: keep the last one.
      if (playback.isPlaying) onPosition(playback.position);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [isPlaying, onPosition]);

  return <MusicProviderContext.Provider value={serviceRef}>{children}</MusicProviderContext.Provider>;
}

/** The shared provider, as a ref so callbacks always reach the current one. */
export function useMusicProviderService(): { readonly current: MusicProviderService } {
  const ref = useContext(MusicProviderContext);
  if (!ref) throw new Error('useMusicProviderService must be used within a SiftProvider');
  return ref;
}
