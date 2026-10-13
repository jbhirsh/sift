import {
  cardSize, DRAG_THRESHOLD, FLING_MIN_DISTANCE, FLING_VELOCITY, flyOffDistance, MAX_CARD_ASPECT, MAX_CARD_WIDTH, MIN_FLY_OFF,
  PHONE_MAX_AREA_WIDTH, swipeDecision,
} from '../../src/utils/cardLayout';

describe('cardSize (#149)', () => {
  test('constants', () => {
    expect(MAX_CARD_WIDTH).toBe(600);
    expect(MAX_CARD_ASPECT).toBe(1.3);
    expect(MIN_FLY_OFF).toBe(500);
    expect(PHONE_MAX_AREA_WIDTH).toBe(440);
  });

  test('a phone keeps the whole area, as before', () => {
    // iPhone 15: 393 wide minus the 12pt gutters, ~470 tall.
    expect(cardSize(369, 470)).toEqual({ width: 369, height: 470 });
  });

  test('every phone fills its area, whatever its shape', () => {
    // iPhone SE: the area is wider than tall; the card must not narrow.
    expect(cardSize(351, 283)).toEqual({ width: 351, height: 283 });
    // Pro Max: taller than 1.3x its width; the card must not shorten.
    expect(cardSize(416, 574)).toEqual({ width: 416, height: 574 });
    // The widest phone area, exactly.
    expect(cardSize(440, 300)).toEqual({ width: 440, height: 300 });
  });

  test('just past a phone\'s width, the iPad limits apply', () => {
    expect(cardSize(441, 300)).toEqual({ width: 300, height: 300 });
    expect(cardSize(500, 900)).toEqual({ width: 500, height: 650 });
  });

  test('iPad landscape: a square as tall as the area, never a strip', () => {
    expect(cardSize(1156, 470)).toEqual({ width: 470, height: 470 });
  });

  test('iPad portrait: capped at the max width, phone proportions', () => {
    expect(cardSize(796, 850)).toEqual({ width: 600, height: 780 });
    expect(cardSize(796, 700)).toEqual({ width: 600, height: 700 });
  });

  test('a degenerate area is no card, not a negative one', () => {
    expect(cardSize(0, 0)).toEqual({ width: 0, height: 0 });
    expect(cardSize(-10, 300)).toEqual({ width: 0, height: 300 });
    expect(cardSize(300, -10)).toEqual({ width: 300, height: 0 });
    expect(cardSize(800, -10)).toEqual({ width: 0, height: 0 });
  });
});

describe('flyOffDistance (#149)', () => {
  test('a phone keeps the old 500; a wider window flies the card out of it', () => {
    expect(flyOffDistance(393)).toBe(500);
    expect(flyOffDistance(500)).toBe(500);
    expect(flyOffDistance(1180)).toBe(1180);
  });
});

describe('swipeDecision', () => {
  test('a drag past the threshold decides, at any speed', () => {
    expect(swipeDecision(DRAG_THRESHOLD + 1, 0)).toBe('keep');
    expect(swipeDecision(-DRAG_THRESHOLD - 1, 0)).toBe('remove');
    // Even dragged back a little as it's let go.
    expect(swipeDecision(DRAG_THRESHOLD + 1, -FLING_VELOCITY * 2)).toBe('keep');
  });

  test('a slow drag short of it springs back', () => {
    expect(swipeDecision(DRAG_THRESHOLD, 0)).toBeNull();
    expect(swipeDecision(-DRAG_THRESHOLD, 0)).toBeNull();
    expect(swipeDecision(DRAG_THRESHOLD - 1, FLING_VELOCITY)).toBeNull();
  });

  test('a quick flick decides short of it', () => {
    expect(swipeDecision(FLING_MIN_DISTANCE + 1, FLING_VELOCITY + 1)).toBe('keep');
    expect(swipeDecision(-FLING_MIN_DISTANCE - 1, -FLING_VELOCITY - 1)).toBe('remove');
  });

  test('but not a jitter, nor a flick against the drag', () => {
    expect(swipeDecision(FLING_MIN_DISTANCE, FLING_VELOCITY * 3)).toBeNull();
    expect(swipeDecision(-FLING_MIN_DISTANCE, -FLING_VELOCITY * 3)).toBeNull();
    expect(swipeDecision(FLING_MIN_DISTANCE + 10, -FLING_VELOCITY * 3)).toBeNull();
    expect(swipeDecision(-FLING_MIN_DISTANCE - 10, FLING_VELOCITY * 3)).toBeNull();
    expect(swipeDecision(FLING_MIN_DISTANCE + 10, FLING_VELOCITY)).toBeNull();
  });

  test('the numbers', () => {
    expect([DRAG_THRESHOLD, FLING_VELOCITY, FLING_MIN_DISTANCE]).toEqual([80, 800, 30]);
  });
});
