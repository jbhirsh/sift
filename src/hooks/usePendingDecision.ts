import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useSift } from '../context/SiftContext';
import { useMusicProvider } from './useMusicProvider';
import { markReviewed } from '../services/ReviewedLedgerStore';
import type { PendingDecision, SiftSession } from '../types';
import { ledgerKey } from '../utils/reviewedLedger';
import { undoWindowMs } from '../utils/undoWindow';

/**
 * How long Undo can take back the latest decision (#152): 5 s, except in
 * the E2E build, which lengthens it (utils/undoWindow).
 */
export const UNDO_WINDOW_MS = undoWindowMs(process.env.EXPO_PUBLIC_UNDO_WINDOW_MS);

// Decisions already sent, by track and time. A decision can be sent from
// several places at once (the window running out, the next decision, the
// Sift screen unmounting while Done mounts); it must reach the service once.
const sent = new Set<string>();

/**
 * A sent decision's key. With its decision: a change from the decisions
 * list (useReviseDecision) can carry the same time as the decision it
 * replaces, to the millisecond, and must still go out.
 */
function sentKey(pending: PendingDecision): string {
  return `${pending.trackId}@${pending.at}:${pending.decision}`;
}

/** Whether this held decision already went to the service. */
export function wasSent(pending: PendingDecision): boolean {
  return sent.has(sentKey(pending));
}

/**
 * Sends a held-back decision: Remove removes, Keep records the song in the
 * reviewed ledger, Skip has nothing to send. Marks it sent first, so Undo
 * can't take back a decision that is already on its way.
 */
export function useSendPending(): (pending: PendingDecision | null) => void {
  const { state, dispatch, flushPendingSave } = useSift();
  const { keepTrack, removeTrack } = useMusicProvider();
  // Latest values for sends from timers and unmount cleanups.
  const latest = useRef({ tracks: state.tracks, keepTrack, removeTrack });
  useEffect(() => {
    latest.current = { tracks: state.tracks, keepTrack, removeTrack };
  });

  return useCallback((pending: PendingDecision | null) => {
    if (!pending) return;
    const key = sentKey(pending);
    const alreadySent = sent.has(key);
    sent.add(key);
    // On disk before it goes out, so a crash mid-call still knows of it.
    if (!alreadySent) flushPendingSave();
    // Cleared in state whether or not this call sends it: a session
    // reloaded from before the clear brings it back, and it must not
    // linger there to be undone after the service acted on it.
    dispatch({ type: 'PENDING_SENT', trackId: pending.trackId, at: pending.at });
    if (alreadySent) return;
    const { tracks, keepTrack: keep, removeTrack: remove } = latest.current;
    const track = tracks.find((t) => t.id === pending.trackId);
    if (!track) return;
    if (pending.decision === 'remove') void remove(track);
    if (pending.decision === 'keep') void keep(track);
  }, [dispatch, flushPendingSave]);
}

/**
 * Sends the decision a saved session was still holding when the app was
 * killed, for a session about to be discarded (a new sift or a Start Over
 * instead of Resume). Only Resume would send it otherwise: it would be lost,
 * and the song offered again as if never decided. Its undo window is long
 * over. Sent to that session's own source; nothing in state changes.
 */
export function useSendSavedPending(): (session: SiftSession | null) => void {
  const { removeTrack } = useMusicProvider();
  return useCallback((session: SiftSession | null) => {
    const pending = session?.pending;
    if (!session || !pending || !session.source || !session.provider) return;
    const key = sentKey(pending);
    if (sent.has(key)) return;
    sent.add(key);
    const track = session.tracks.find((t) => t.id === pending.trackId);
    if (!track) return;
    const from = { source: session.source, provider: session.provider };
    if (pending.decision === 'remove') void removeTrack(track, from);
    if (pending.decision === 'keep') void markReviewed(ledgerKey(from.provider, from.source), track.id);
  }, [removeTrack]);
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
    // Only on leaving the app: pulling down Control Center or Notification
    // Center, or a call banner, makes it 'inactive' for a moment, and Undo
    // shouldn't vanish for that. (The session is saved on 'inactive', so a
    // kill from there keeps the held decision for the next launch.)
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'background') sendPending(pendingRef.current);
    });
    return () => {
      subscription.remove();
      // A backstop: Finish, Back and the last card send it while the
      // screen is still mounted.
      sendPending(pendingRef.current);
    };
  }, [sendPending]);
}
