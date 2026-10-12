// Sizing the Sift card stack for the space the screen gives it (#149).
// On a phone the card fills that space, as it always has; on iPad the
// space is far wider (or taller) than a card should be, and a wide box
// with contentFit="cover" crops square album art to a strip.

/** The widest the card gets, so it stays a card on a 13" iPad. */
export const MAX_CARD_WIDTH = 600;
/** The tallest the card gets relative to its width: a phone's proportions. */
export const MAX_CARD_ASPECT = 1.3;
/** A programmatic decision's fly-off distance on a phone. */
export const MIN_FLY_OFF = 500;
/**
 * The widest card area a phone gives (the largest iPhone is 440pt wide,
 * less the gutters). Up to this the card fills its area exactly, as it
 * always has: an iPhone SE's short, wide area and a Pro Max's tall one
 * included.
 */
export const PHONE_MAX_AREA_WIDTH = 440;

/**
 * The card's size in an area `width` x `height`. A phone-width area is
 * filled. A wider one (iPad) gets a card never wider than the area,
 * MAX_CARD_WIDTH or the area's height (so the artwork is never wider than
 * tall), and never taller than the area or MAX_CARD_ASPECT times its width.
 */
export function cardSize(width: number, height: number): { width: number; height: number } {
  if (width <= PHONE_MAX_AREA_WIDTH) {
    return { width: Math.max(0, width), height: Math.max(0, height) };
  }
  const cardWidth = Math.max(0, Math.min(width, height, MAX_CARD_WIDTH));
  const cardHeight = Math.max(0, Math.min(height, cardWidth * MAX_CARD_ASPECT));
  return { width: cardWidth, height: cardHeight };
}

/**
 * How far a Keep/Remove button sends the card: far enough to leave a
 * window `windowWidth` wide from the middle, and never less than on a phone.
 */
export function flyOffDistance(windowWidth: number): number {
  return Math.max(MIN_FLY_OFF, windowWidth);
}
