import { useCallback, useEffect } from 'react';
import { useSift } from '../context/SiftContext';
import { chorusFinder, PreviewOffsetLookup } from '../services/ChorusFinder';
import { estimateChorusStart } from '../utils/chorus';
import { Track } from '../types';

/**
 * How long a card waits for its chorus before playing from the estimate
 * instead. Prefetching (below) means the upcoming cards are usually resolved
 * long before they're shown; this only bounds the first card and fast swipes.
 */
export const CHORUS_WAIT_MS = 2500;

/**
 * "Start at chorus": where each card's playback should begin. Off (or on
 * Spotify, whose fixed 30-second previews can't start at a chorus) every
 * track starts at 0:00. On, the current and next two cards are resolved in
 * the background so a swipe can start the next song at its chorus at once.
 *
 * previewOffset comes from the caller's useMusicProvider, so this hook
 * doesn't create a second provider (and a second playback poller).
 */
export function useChorusStart(previewOffset?: PreviewOffsetLookup) {
  const { state, currentTrack, nextTrack, nextNextTrack } = useSift();
  const enabled = state.startAtChorus && state.provider === 'apple-music';

  useEffect(() => {
    if (!enabled) return;
    for (const track of [currentTrack, nextTrack, nextNextTrack]) {
      if (track) void chorusFinder.find(track, previewOffset);
    }
  }, [enabled, currentTrack, nextTrack, nextNextTrack, previewOffset]);

  const startPositionFor = useCallback(
    async (track: Track): Promise<number> => {
      if (!enabled) return 0;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const fallback = new Promise<number>((resolve) => {
        timer = setTimeout(() => resolve(estimateChorusStart(track.duration)), CHORUS_WAIT_MS);
      });
      try {
        return await Promise.race([
          chorusFinder.find(track, previewOffset).then((start) => start.position),
          fallback,
        ]);
      } finally {
        clearTimeout(timer);
      }
    },
    [enabled, previewOffset],
  );

  return { enabled, startPositionFor };
}
