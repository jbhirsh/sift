/**
 * One decision at a time on the Sift screen.
 *
 * A press is judged by when the finger lifted (the touch's own timestamp),
 * not by when JavaScript got to it: when the JavaScript thread stalls,
 * touches queue up and then run back to back, and judged by the clock at
 * that moment they'd look like a double tap. Flow 21 lost two Skips to a
 * stall that way. A press too soon after the last accepted one (within its
 * hold: the fly-off and settle) is turned away; any other goes now, or, if
 * the decision before it isn't on screen yet, waits for it, so it runs with
 * that decision's state and never decides the same card twice. Only a
 * decision that may land on a card nobody has seen yet waits (a Skip); a
 * Keep or Remove is turned away instead. No timers: a timer is what runs
 * late after a stall.
 */
export type PressVerdict =
  { verdict: 'go' } | { verdict: 'wait' } | { verdict: 'busy'; sinceMs: number };

export interface DecisionGuard {
  /**
   * A decision pressed at `atMs`, holding off the next for `holdMs`. One
   * that `canWait` waits for the decision before it to show; any other is
   * turned away until then.
   */
  press(atMs: number, holdMs: number, canWait: boolean): PressVerdict;
  /** A decision is on screen. True when another is waiting to go. */
  shown(): boolean;
  /** For Finish, Undo and the list: a press at `atMs` lands mid-decision or in its hold. */
  busy(atMs: number): boolean;
  /** A decision is pressed but not on screen yet. */
  underWay(): boolean;
}

export function createDecisionGuard(): DecisionGuard {
  let lastPress = 0;
  let until = -Infinity;
  // Accepted decisions not on screen yet: the one under way, then any
  // waiting behind it.
  let unshown = 0;
  return {
    press(atMs, holdMs, canWait) {
      if (atMs < until || (unshown > 0 && !canWait))
        return { verdict: 'busy', sinceMs: atMs - lastPress };
      lastPress = atMs;
      until = atMs + holdMs;
      unshown += 1;
      return unshown === 1 ? { verdict: 'go' } : { verdict: 'wait' };
    },
    shown() {
      if (unshown > 0) unshown -= 1;
      return unshown > 0;
    },
    busy(atMs) {
      return unshown > 0 || atMs < until;
    },
    underWay() {
      return unshown > 0;
    },
  };
}
