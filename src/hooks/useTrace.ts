import { useEffect, useState } from 'react';
import type { GestureResponderEvent } from 'react-native';
import { currentScreen, enterScreen, trace, traceTouch, tracing } from '../services/trace';
import { STALL_TICK_MS, stallGap } from '../utils/trace';

/**
 * A screen or sheet in the trace: `screen name=… at=render|up|down`, and the
 * name touches carry while it's on top. `render` is when React started
 * drawing it (once per mount), `up` when it's on screen: a slow screen shows
 * as the gap between them, a busy thread before it as the gap from the tap
 * to `render`.
 */
export function useTraceScreen(name: string): void {
  useState(() => trace('screen', { name, at: 'render' }));
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
  onTouchEndCapture?: TouchHandler;
  onTouchCancelCapture?: TouchHandler;
};

const touchHandler = (phase: string): TouchHandler => (event) => {
  const { pageX, pageY, timestamp } = event.nativeEvent;
  traceTouch(phase, pageX, pageY, timestamp);
};

/**
 * Capture handlers for the app's root view: every touch JavaScript sees, on
 * any screen or sheet (a Modal's content is still under the root in React's
 * tree), with where it landed and how late JavaScript saw it. A touch on a
 * disabled button is still recorded, so "no line" means JavaScript never saw
 * it. Capturing only watches: it doesn't take the touch from anything.
 * Nothing in builds that don't trace.
 */
export const touchTraceProps: TouchTraceProps = tracing
  ? {
    onTouchStartCapture: touchHandler('start'),
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
