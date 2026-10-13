/** How many cards from the current one a resume warms up before the rest. */
export const UP_NEXT_COUNT = 3;

/**
 * The order a resumed session's songs are put in the native cache: the card
 * on screen and the next few first, so they can play and show artwork at
 * once, then the rest from there on, then the ones already decided (Undo
 * and Restore can still need them). A big library takes a while to warm,
 * and from the top it would reach the current card last.
 */
export function warmUpOrder(trackIDs: readonly string[], cursor: number): { upNext: string[]; rest: string[] } {
  const start = Math.min(Math.max(0, cursor), trackIDs.length);
  const upNextEnd = Math.min(start + UP_NEXT_COUNT, trackIDs.length);
  return {
    upNext: trackIDs.slice(start, upNextEnd),
    rest: [...trackIDs.slice(upNextEnd), ...trackIDs.slice(0, start)],
  };
}
