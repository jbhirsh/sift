import { Settings } from 'react-native';
import {
  NO_MARKS,
  prune,
  touchDown,
  touchFollow,
  touchMove,
  touchUp,
  type TouchMarks,
} from '../utils/touchMarks';
import { launchFlagOn } from '../utils/launchArgs';
import { tracing } from './trace';

// The touches a PR GIF shows (components/TouchOverlay, utils/touchMarks).
// Only the E2E build draws them, and only when the recording launches the
// app with the SiftShowTouches launch argument (e2e/gifs/*.yaml):
// iOS puts launch arguments in the app's user defaults, which Settings reads.
// The suite, the audit and the screenshots don't pass it, so they never see
// a mark, and a real build never draws one.

function launchedWithTouches(): boolean {
  try {
    return launchFlagOn(Settings.get('SiftShowTouches'));
  } catch {
    return false;
  }
}

/** Whether this launch draws touches. */
export const showTouches = tracing && launchedWithTouches();

type Listener = (marks: TouchMarks) => void;

export interface TouchMarkStore {
  get(): TouchMarks;
  down(x: number, y: number, now: number): void;
  move(x: number, y: number, now: number): void;
  up(x: number, y: number, now: number): void;
  /** A native gesture's update (utils/touchMarks `touchFollow`). */
  follow(x: number, y: number, now: number): void;
  /** Drops what has faded by `now`; returns what's left. */
  tick(now: number): TouchMarks;
  subscribe(listener: Listener): () => void;
  /**
   * A Modal's overlay takes over drawing while it's up, so a touch isn't
   * drawn twice (or, over a page sheet, once more where the root would put
   * it). Returns how to give it back.
   */
  claimLayer(layer: string): () => void;
  /** The newest Modal overlay's layer, or null when the root's draws. */
  topLayer(): string | null;
}

export function createTouchMarkStore(): TouchMarkStore {
  let marks = NO_MARKS;
  const listeners = new Set<Listener>();
  const notify = () => listeners.forEach((listener) => listener(marks));
  const set = (next: TouchMarks) => {
    if (next === marks) return;
    marks = next;
    notify();
  };
  let layers: string[] = [];
  return {
    get: () => marks,
    down: (x, y, now) => set(touchDown(marks, x, y, now)),
    move: (x, y, now) => set(touchMove(marks, x, y, now)),
    up: (x, y, now) => set(touchUp(marks, x, y, now)),
    follow: (x, y, now) => set(touchFollow(marks, x, y, now)),
    tick(now) {
      set(prune(marks, now));
      return marks;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    claimLayer(layer) {
      layers = [...layers, layer];
      notify();
      return () => {
        layers = layers.filter((l) => l !== layer);
        notify();
      };
    },
    topLayer: () => layers[layers.length - 1] ?? null,
  };
}

/** The one store: the root view feeds it, every overlay draws from it. */
export const touchMarks = createTouchMarkStore();

/**
 * For a gesture handler's callbacks (via runOnJS, only when `showTouches`):
 * its pan carries the ring on where React Native's touch stopped.
 */
export function followTouch(x: number, y: number): void {
  touchMarks.follow(x, y, performance.now());
}

export function liftTouch(x: number, y: number): void {
  touchMarks.up(x, y, performance.now());
}
