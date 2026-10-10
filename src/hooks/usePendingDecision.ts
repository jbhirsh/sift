import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useSift } from '../context/SiftContext';
import { useMusicProvider } from './useMusicProvider';
import type { PendingDecision } from '../types';

/** How long Undo can take back the latest decision (#152). */
export const UNDO_WINDOW_MS = 5000;

// Decisions already sent, by track and time. A decision can be sent from
// several places at once (the window running out, the next decision, the
// Sift screen unmounting while Done mounts); it must reach the service once.
const sent = new Set<string>();

/** Whether this held decision already went to the service. */
export function wasSent(pending: PendingDecision): boolean {
  return sent.has(`${pending.trackId}@${pending.at}`);
}

/**
 * Sends a held-back decision to the music service: Remove removes, Keep
 * keeps, Skip has nothing to send. Marks it sent first, so Undo can't take
 * back a decision that is already on its way.
 */
export function useSendPending(
  { bufferPlaylistKeeps = false }: {
    /**
     * Hand a playlist keep to Done's fallback save (pendingKeeps) rather
     * than adding it here: this hook instance doesn't know a "- Sifted"
     * playlist created moments ago, and would create a second.
     */
    bufferPlaylistKeeps?: boolean;
  } = {},
): (pending: PendingDecision | null) => void {
  const { state, dispatch, flushPendingSave } = useSift();
  const { keepTrack, removeTrack } = useMusicProvider();
  // Latest values for sends from timers and unmount cleanups.
  const latest = useRef({ tracks: state.tracks, source: state.source, keepTrack, removeTrack });
  useEffect(() => {
    latest.current = { tracks: state.tracks, source: state.source, keepTrack, removeTrack };
  });

  return useCallback((pending: PendingDecision | null) => {
    if (!pending) return;
    const key = `${pending.trackId}@${pending.at}`;
    const alreadySent = sent.has(key);
    sent.add(key);
    // On disk before it goes out, so a crash mid-call still knows of it.
    if (!alreadySent) flushPendingSave();
    // Cleared in state whether or not this call sends it: a session
    // reloaded from before the clear brings it back, and it must not
    // linger there to be undone after the service acted on it.
    dispatch({ type: 'PENDING_SENT', trackId: pending.trackId, at: pending.at });
    if (alreadySent) return;
    const { tracks, source, keepTrack: keep, removeTrack: remove } = latest.current;
    const track = tracks.find((t) => t.id === pending.trackId);
    if (!track) return;
    if (pending.decision === 'remove') void remove(track);
    if (pending.decision === 'keep') {
      if (bufferPlaylistKeeps && source.type === 'playlist') dispatch({ type: 'ADD_PENDING_KEEP', track });
      else void keep(track);
    }
  }, [dispatch, flushPendingSave, bufferPlaylistKeeps]);
}

/**
 * Holds the latest decision for the undo window, then sends it; sends it
 * straight away when the screen goes away or the app leaves the foreground.
 * For the Sift screen.
 */
export function useHoldPendingDecision(sendPending: (pending: PendingDecision | null) => void): void {
  const { state } = useSift();
  const pendingRef = useRef(state.pending);
  useEffect(() => {
    pendingRef.current = state.pending;
  }, [state.pending]);

  useEffect(() => {
    const pending = state.pending;
    if (!pending) return;
    // Already sent (a session reloaded from before the send brought it
    // back): clear it now, before Undo can offer it.
    const delay = wasSent(pending) ? 0 : pending.at + UNDO_WINDOW_MS - Date.now();
    const timer = setTimeout(() => sendPending(pending), Math.max(0, delay));
    return () => clearTimeout(timer);
  }, [state.pending, sendPending]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') sendPending(pendingRef.current);
    });
    return () => {
      subscription.remove();
      // A backstop: Finish, Back and the last card send it while the
      // screen is still mounted, where the keep path's playlist lookups
      // still work.
      sendPending(pendingRef.current);
    };
  }, [sendPending]);
}
