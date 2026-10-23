import { useCallback, useEffect, useRef, useState } from 'react';
import { useSift } from '../context/SiftContext';
import { useMusicProvider } from './useMusicProvider';
import { wasSent } from './usePendingDecision';
import { decisionFor } from '../utils/decisions';
import type { Decision, PendingDecision, Track } from '../types';

// The time stamped on the last change sent. A sent decision is known by its
// track and time (usePendingDecision's sent set), so two changes of one song
// in the same millisecond must not share one: the second would count as
// sent already and never go out.
let lastSentAt = 0;

/**
 * Changes a decided card's decision (the decisions list), beyond what
 * Undo reaches. A decision still held for Undo just changes, and goes out
 * as the new one when its window ends. One already sent is taken back
 * first (a Remove restored, a Keep taken out of the reviewed ledger), then
 * the new one goes out through `send`, the screen's useSendPending, which
 * sends each decision once. Resolves to whether it changed: if taking the
 * old one back fails, nothing changes.
 */
export function useReviseDecision(
  send: (pending: PendingDecision) => void,
): (track: Track, decision: Decision) => Promise<boolean> {
  const { state, dispatch } = useSift();
  const { restoreTrack, unkeepTrack } = useMusicProvider();
  // Read when it runs: a list row can outlive the render it was made in.
  const latest = useRef(state);
  useEffect(() => {
    latest.current = state;
  });

  return useCallback(
    async (track: Track, decision: Decision): Promise<boolean> => {
      const now = latest.current;
      const current = decisionFor(track.id, now);
      if (current == null) return false;
      if (current === decision) return true;
      const held = now.pending;
      if (held?.trackId === track.id && !wasSent(held)) {
        dispatch({ type: 'REVISE', trackId: track.id, decision });
        return true;
      }
      if (current === 'remove' && !(await restoreTrack(track))) return false;
      if (current === 'keep' && !(await unkeepTrack(track))) return false;
      // The held decision this replaces already went out: clear it first, so
      // REVISE doesn't rewrite it into one that looks unsent and goes out
      // again (or brings Undo back).
      const sentHeld = latest.current.pending;
      if (sentHeld?.trackId === track.id) {
        dispatch({ type: 'PENDING_SENT', trackId: sentHeld.trackId, at: sentHeld.at });
      }
      dispatch({ type: 'REVISE', trackId: track.id, decision });
      lastSentAt = Math.max(Date.now(), lastSentAt + 1);
      send({ trackId: track.id, decision, at: lastSentAt });
      return true;
    },
    [dispatch, restoreTrack, unkeepTrack, send],
  );
}

/**
 * The decisions list as a screen (Sift, Done) wires it: whether it's open,
 * each card's decision as it stands, and changing one through the screen's
 * `send` (useReviseDecision).
 */
export function useDecisionsSheet(send: (pending: PendingDecision) => void) {
  const { state } = useSift();
  const revise = useReviseDecision(send);
  const [showDecisions, setShowDecisions] = useState(false);
  const { kept, removed, skipped } = state;
  const decisionOf = useCallback(
    (trackId: string) => decisionFor(trackId, { kept, removed, skipped }),
    [kept, removed, skipped],
  );
  return { revise, showDecisions, setShowDecisions, decisionOf };
}
