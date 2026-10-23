import {
  NO_MARKS,
  PRESS_IN_MS,
  PRESS_OUT_MS,
  TRAIL_FADE_MS,
  TRAIL_SPACING,
  dotOpacity,
  hasMarks,
  pressLook,
  prune,
  touchDown,
  touchMove,
  touchUp,
  touchFollow,
} from '../../src/utils/touchMarks';

describe('touch marks for PR GIFs', () => {
  it('a press puts a ring where the finger lands', () => {
    const marks = touchDown(NO_MARKS, 100, 200, 1000);
    expect(marks.press).toEqual({ x: 100, y: 200, fromX: 100, fromY: 200, downAt: 1000, upAt: null });
    expect(marks.trail).toEqual([]);
    expect(hasMarks(marks)).toBe(true);
    expect(hasMarks(NO_MARKS)).toBe(false);
  });

  it('a drag moves the ring and leaves a dot each time it has gone far enough', () => {
    let marks = touchDown(NO_MARKS, 0, 0, 0);
    marks = touchMove(marks, TRAIL_SPACING - 1, 0, 10);
    expect(marks.press).toMatchObject({ x: TRAIL_SPACING - 1, y: 0 });
    expect(marks.trail).toEqual([]);
    marks = touchMove(marks, TRAIL_SPACING, 0, 20);
    expect(marks.trail).toEqual([{ x: TRAIL_SPACING, y: 0, at: 20 }]);
    // Measured from the last dot, not from where the press began.
    marks = touchMove(marks, TRAIL_SPACING + 5, 0, 30);
    expect(marks.trail).toHaveLength(1);
    marks = touchMove(marks, TRAIL_SPACING, TRAIL_SPACING, 40);
    expect(marks.trail).toHaveLength(2);
  });

  it('a slow drag still leaves dots: it measures from the last dot, not the moving ring', () => {
    let marks = touchDown(NO_MARKS, 0, 0, 0);
    for (let x = 1; x <= TRAIL_SPACING * 3; x += 1) marks = touchMove(marks, x, 0, x);
    expect(marks.trail.map((dot) => dot.x)).toEqual([TRAIL_SPACING, TRAIL_SPACING * 2, TRAIL_SPACING * 3]);
    expect(marks.press).toMatchObject({ x: TRAIL_SPACING * 3 });
  });

  it('a move with no finger down, or after it lifted, changes nothing', () => {
    expect(touchMove(NO_MARKS, 50, 50, 0)).toBe(NO_MARKS);
    const lifted = touchUp(touchDown(NO_MARKS, 0, 0, 0), 0, 0, 10);
    expect(touchMove(lifted, 50, 50, 20)).toBe(lifted);
    expect(touchUp(lifted, 9, 9, 30)).toBe(lifted);
    expect(touchUp(NO_MARKS, 9, 9, 30)).toBe(NO_MARKS);
  });

  it('a native gesture carries the ring on, even after React Native\'s touch was cancelled', () => {
    // React Native's copy of the touch ends in a cancel when a pan takes it.
    const cancelled = touchUp(touchDown(NO_MARKS, 0, 0, 0), 2, 0, 50);
    const followed = touchFollow(cancelled, TRAIL_SPACING * 2, 0, 60);
    expect(followed.press).toEqual({
      x: TRAIL_SPACING * 2, y: 0, fromX: TRAIL_SPACING * 2, fromY: 0, downAt: 0, upAt: null,
    });
    expect(followed.trail).toEqual([{ x: TRAIL_SPACING * 2, y: 0, at: 60 }]);
    // Still held, it just moves; with nothing pressed, it starts a press.
    expect(touchFollow(followed, TRAIL_SPACING * 2 + 1, 0, 70).press).toMatchObject({ x: TRAIL_SPACING * 2 + 1, upAt: null });
    expect(touchFollow(NO_MARKS, 5, 6, 80).press).toEqual({ x: 5, y: 6, fromX: 5, fromY: 6, downAt: 80, upAt: null });
  });

  it('a release leaves the ring where the finger lifted, to scale out', () => {
    const marks = touchUp(touchDown(NO_MARKS, 0, 0, 0), 30, 40, 90);
    expect(marks.press).toMatchObject({ x: 30, y: 40, downAt: 0, upAt: 90 });
  });

  it('the ring is fully there from the first frame, grows while held, and fades out on release', () => {
    const press = { x: 0, y: 0, fromX: 0, fromY: 0, downAt: 0, upAt: null };
    // A scripted tap lasts milliseconds: it must show at once, not fade in.
    expect(pressLook(press, 0)).toEqual({ scale: 0.8, opacity: 1 });
    expect(pressLook(press, PRESS_IN_MS / 2)).toEqual({ scale: 0.9, opacity: 1 });
    expect(pressLook(press, PRESS_IN_MS * 3)).toEqual({ scale: 1, opacity: 1 });
    const released = { ...press, upAt: 1000 };
    expect(pressLook(released, 1000)).toEqual({ scale: 1, opacity: 1 });
    expect(pressLook(released, 1000 + PRESS_OUT_MS / 2)).toEqual({ scale: 1.2, opacity: 0.5 });
    expect(pressLook(released, 1000 + PRESS_OUT_MS * 2)).toEqual({ scale: 1.4, opacity: 0 });
    // Long enough to land in several frames of a 15 fps GIF.
    expect(PRESS_OUT_MS).toBeGreaterThanOrEqual(5 * (1000 / 15));
  });

  it('a dot fades out over its fade time', () => {
    const dot = { x: 0, y: 0, at: 100 };
    expect(dotOpacity(dot, 100)).toBe(1);
    expect(dotOpacity(dot, 100 + TRAIL_FADE_MS / 2)).toBe(0.5);
    expect(dotOpacity(dot, 100 + TRAIL_FADE_MS)).toBe(0);
    expect(dotOpacity(dot, 100 + TRAIL_FADE_MS * 2)).toBe(0);
  });

  it('pruning drops faded dots and a released ring once it has scaled out, and nothing else', () => {
    let marks = touchDown(NO_MARKS, 0, 0, 0);
    marks = touchMove(marks, 20, 0, 0);
    marks = touchMove(marks, 40, 0, 300);
    // Held, with fresh dots: nothing to drop, and the same object back.
    expect(prune(marks, 100)).toBe(marks);
    const afterFirstFade = prune(marks, TRAIL_FADE_MS);
    expect(afterFirstFade.trail).toEqual([{ x: 40, y: 0, at: 300 }]);
    expect(afterFirstFade.press).not.toBeNull();
    // A held ring never goes, however long it's held.
    expect(prune(marks, 60_000).press).not.toBeNull();
    const released = touchUp(marks, 40, 0, 1000);
    expect(prune(released, 1000 + PRESS_OUT_MS - 1).press).not.toBeNull();
    const gone = prune(released, 1000 + PRESS_OUT_MS);
    expect(gone.press).toBeNull();
    expect(hasMarks(gone)).toBe(false);
  });
});
