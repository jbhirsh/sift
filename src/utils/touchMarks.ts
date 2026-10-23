// The marks the GIF build draws for each touch (components/TouchOverlay): a
// phone has no pointer to see, so a recording of the app shows where each
// finger landed, what it pressed and where it dragged. Pure: the overlay
// feeds touches in and asks what to draw at a given time.

/**
 * How long a press ring takes to scale in, and to fade out after release.
 * It shows at full strength the instant a finger lands: a scripted tap is
 * over in a few milliseconds, so a ring that faded in would show only its
 * fade-out. The fade-out lasts several frames of a 15 fps GIF.
 */
export const PRESS_IN_MS = 120;
export const PRESS_OUT_MS = 400;
/** How long a drag's trail dot takes to fade out. */
export const TRAIL_FADE_MS = 600;
/** A drag leaves a dot each time it has moved this far (pt) from the last. */
export const TRAIL_SPACING = 8;

export interface Press {
  x: number;
  y: number;
  /** Where the trail measures from: the last dot, or where the finger landed. */
  fromX: number;
  fromY: number;
  /** When the finger went down. */
  downAt: number;
  /** When it lifted, or null while it's held. */
  upAt: number | null;
}

export interface Dot {
  x: number;
  y: number;
  at: number;
}

export interface TouchMarks {
  press: Press | null;
  trail: Dot[];
}

export const NO_MARKS: TouchMarks = { press: null, trail: [] };

export function touchDown(marks: TouchMarks, x: number, y: number, now: number): TouchMarks {
  return { press: { x, y, fromX: x, fromY: y, downAt: now, upAt: null }, trail: marks.trail };
}

/** The held finger moves: the ring follows it and leaves dots behind. */
export function touchMove(marks: TouchMarks, x: number, y: number, now: number): TouchMarks {
  const { press } = marks;
  if (!press || press.upAt !== null) return marks;
  if (Math.hypot(x - press.fromX, y - press.fromY) < TRAIL_SPACING) {
    return { ...marks, press: { ...press, x, y } };
  }
  return { press: { ...press, x, y, fromX: x, fromY: y }, trail: [...marks.trail, { x, y, at: now }] };
}

export function touchUp(marks: TouchMarks, x: number, y: number, now: number): TouchMarks {
  const { press } = marks;
  if (!press || press.upAt !== null) return marks;
  return { ...marks, press: { ...press, x, y, upAt: now } };
}

/**
 * A native gesture follows the finger (react-native-gesture-handler's pans:
 * the card swipe, the seek bar). Once one takes over a touch, React Native
 * ends its own copy with a cancel and JavaScript sees no more of it, so the
 * ring would stop where the drag began. The gesture's own updates carry it
 * on, picking the press back up if that cancel already let it go.
 */
export function touchFollow(marks: TouchMarks, x: number, y: number, now: number): TouchMarks {
  const { press } = marks;
  if (!press) return touchDown(marks, x, y, now);
  const held = press.upAt === null ? marks : { ...marks, press: { ...press, upAt: null } };
  return touchMove(held, x, y, now);
}

/** Drops what has finished fading by `now`. */
export function prune(marks: TouchMarks, now: number): TouchMarks {
  const pressDone = marks.press?.upAt != null && now - marks.press.upAt >= PRESS_OUT_MS;
  const trail = marks.trail.filter((dot) => now - dot.at < TRAIL_FADE_MS);
  if (!pressDone && trail.length === marks.trail.length) return marks;
  return { press: pressDone ? null : marks.press, trail };
}

/** Whether anything is still on screen (so the overlay keeps animating). */
export function hasMarks(marks: TouchMarks): boolean {
  return marks.press !== null || marks.trail.length > 0;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * The press ring's scale and opacity at `now`: fully there from the first
 * frame, growing to size while held, then spreading and fading on release.
 */
export function pressLook(press: Press, now: number): { scale: number; opacity: number } {
  if (press.upAt === null) {
    const t = clamp01((now - press.downAt) / PRESS_IN_MS);
    return { scale: 0.8 + 0.2 * t, opacity: 1 };
  }
  const t = clamp01((now - press.upAt) / PRESS_OUT_MS);
  return { scale: 1 + 0.4 * t, opacity: 1 - t };
}

/** A trail dot's opacity at `now`. */
export function dotOpacity(dot: Dot, now: number): number {
  return 1 - clamp01((now - dot.at) / TRAIL_FADE_MS);
}
