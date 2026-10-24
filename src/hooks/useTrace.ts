import { useEffect, useLayoutEffect, useState } from 'react';
import type { GestureResponderEvent } from 'react-native';
import { currentScreen, enterScreen, trace, traceTouch, tracing } from '../services/trace';
import { showTouches, touchMarks } from '../services/touchOverlay';
import { STALL_TICK_MS, stallGap } from '../utils/trace';

/**
 * A screen or sheet in the trace: `screen name=… at=render|commit|up|down`,
 * and the name touches carry while it's on top. `render` is when React
 * started drawing it (once per mount), `commit` when React had committed it
 * (before paint), `up` when its effects ran. A busy thread before it shows
 * as the gap from the tap to `render`. `render` to `commit` is React drawing
 * it (its children's layout effects too) and swapping out the screen it
 * replaced. `commit` to `up` is effects: the old screen's cleanups (its
 * `down`) and the new screen's other effects. After a tap that is all it
 * holds, as React runs them in the same task; after an update from an
 * animation (a swiped card's last decision) React can run other queued work
 * first. A stall in either gap with no work to show for it is the thread
 * being held (#172).
 */
export function useTraceScreen(name: string): void {
  useState(() => trace('screen', { name, at: 'render' }));
  useLayoutEffect(() => {
    trace('screen', { name, at: 'commit' });
  }, [name]);
  useEffect(() => {
    trace('screen', { name, at: 'up' });
    const leave = enterScreen(name);
    return () => {
      leave();
      trace('screen', { name, at: 'down' });
    };
  }, [name]);
}

type TouchHandler = (event: GestureResponderEvent) => void;
type TouchTraceProps = {
  onTouchStartCapture?: TouchHandler;
  onTouchMoveCapture?: TouchHandler;
  onTouchEndCapture?: TouchHandler;
  onTouchCancelCapture?: TouchHandler;
};

// What a touch phase does to the drawn marks of a PR GIF (TouchOverlay).
const markPhase = {
  start: touchMarks.down,
  move: touchMarks.move,
  end: touchMarks.up,
  cancel: touchMarks.up,
};

const touchHandler =
  (phase: keyof typeof markPhase): TouchHandler =>
  (event) => {
    const { pageX, pageY, timestamp } = event.nativeEvent;
    // Moves would bury the trace; only the overlay wants them.
    if (phase !== 'move') traceTouch(phase, pageX, pageY, timestamp);
    if (showTouches) markPhase[phase](pageX, pageY, performance.now());
  };

/**
 * Capture handlers for the app's root view: every touch JavaScript sees, on
 * any screen or sheet (a Modal's content is still under the root in React's
 * tree), with where it landed and how late JavaScript saw it. A touch on a
 * disabled button is still recorded, so "no line" means JavaScript never saw
 * it. Capturing only watches: it doesn't take the touch from anything.
 * When a GIF recording asked for it, the same handlers draw each touch
 * (components/TouchOverlay). Nothing in builds that don't trace.
 */
export const touchTraceProps: TouchTraceProps = tracing
  ? {
      onTouchStartCapture: touchHandler('start'),
      // Only a GIF recording follows the finger (services/touchOverlay).
      ...(showTouches && { onTouchMoveCapture: touchHandler('move') }),
      onTouchEndCapture: touchHandler('end'),
      onTouchCancelCapture: touchHandler('cancel'),
    }
  : {};

/**
 * A heartbeat that says when the JavaScript thread stalled: `js-stall
 * gap=…` for a gap between ticks of a second or more, nothing otherwise.
 * Runs only in the E2E build.
 */
export function useJsStallWatch(): void {
  useEffect(() => {
    if (!tracing) return undefined;
    let previous = Date.now();
    const timer = setInterval(() => {
      const now = Date.now();
      const gap = stallGap(previous, now);
      if (gap != null) trace('js-stall', { gap, screen: currentScreen() });
      previous = now;
    }, STALL_TICK_MS);
    return () => clearInterval(timer);
  }, []);
}
