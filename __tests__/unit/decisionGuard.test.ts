import { createDecisionGuard } from '../../src/utils/decisionGuard';

describe('createDecisionGuard', () => {
  test('free at first, whatever the clock reads', () => {
    const guard = createDecisionGuard();
    expect(guard.busy(0)).toBe(false);
    expect(guard.press(0, 300, true)).toEqual({ verdict: 'go' });
  });

  test('a press within the hold of the last one is turned away, saying how soon it came', () => {
    const guard = createDecisionGuard();
    guard.press(1_000, 300, true);
    guard.shown();
    expect(guard.press(1_299, 300, true)).toEqual({ verdict: 'busy', sinceMs: 299 });
    expect(guard.press(1_300, 300, true)).toEqual({ verdict: 'go' });
  });

  test('a turned-away press doesn\'t restart the hold', () => {
    const guard = createDecisionGuard();
    guard.press(0, 300, true);
    guard.shown();
    expect(guard.press(200, 300, true)).toEqual({ verdict: 'busy', sinceMs: 200 });
    expect(guard.press(300, 300, true)).toEqual({ verdict: 'go' });
  });

  test('taps queued in a stall keep their spacing: the second waits for the first to show (flow 21)', () => {
    // Skips 8 and 9 were 2.3 s apart; JavaScript ran both at the same moment.
    const guard = createDecisionGuard();
    expect(guard.press(18_100, 300, true)).toEqual({ verdict: 'go' });
    expect(guard.press(20_400, 300, true)).toEqual({ verdict: 'wait' });
    // The first is on screen: the second goes.
    expect(guard.shown()).toBe(true);
    // The second is on screen: nothing else is waiting.
    expect(guard.shown()).toBe(false);
    expect(guard.busy(20_700)).toBe(false);
  });

  test('one that can\'t wait is turned away until the decision before it shows', () => {
    // A Keep or Remove would land on a card nobody has seen yet.
    const guard = createDecisionGuard();
    guard.press(0, 300, true);
    expect(guard.press(400, 300, false)).toEqual({ verdict: 'busy', sinceMs: 400 });
    // Turned away without taking the hold: a Skip at the same moment waits.
    expect(guard.press(400, 300, true)).toEqual({ verdict: 'wait' });
    guard.shown();
    guard.shown();
    expect(guard.press(700, 300, false)).toEqual({ verdict: 'go' });
  });

  test('a press on time but before the last decision showed still counts', () => {
    // A slow fly-off: the tap comes after the hold but before the card has gone.
    const guard = createDecisionGuard();
    guard.press(0, 300, true);
    expect(guard.press(400, 300, true)).toEqual({ verdict: 'wait' });
    expect(guard.press(500, 300, true)).toEqual({ verdict: 'busy', sinceMs: 100 });
  });

  test('busy while a decision isn\'t on screen, however long that takes, or within the hold', () => {
    const guard = createDecisionGuard();
    guard.press(0, 300, true);
    expect(guard.busy(60_000)).toBe(true);
    guard.shown();
    expect(guard.busy(299)).toBe(true);
    expect(guard.busy(300)).toBe(false);
  });

  test('under way only until it shows: the hold doesn\'t count', () => {
    const guard = createDecisionGuard();
    expect(guard.underWay()).toBe(false);
    guard.press(0, 300, true);
    expect(guard.underWay()).toBe(true);
    guard.shown();
    expect(guard.underWay()).toBe(false);
    expect(guard.busy(100)).toBe(true);
  });

  test('a screen change with nothing under way changes nothing', () => {
    const guard = createDecisionGuard();
    expect(guard.shown()).toBe(false);
    expect(guard.busy(0)).toBe(false);
    expect(guard.press(0, 300, true)).toEqual({ verdict: 'go' });
    guard.shown();
    expect(guard.shown()).toBe(false);
    expect(guard.busy(300)).toBe(false);
  });
});
