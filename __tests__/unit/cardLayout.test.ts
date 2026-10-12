import { cardSize, flyOffDistance, MAX_CARD_ASPECT, MAX_CARD_WIDTH, MIN_FLY_OFF, PHONE_MAX_AREA_WIDTH } from '../../src/utils/cardLayout';

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
