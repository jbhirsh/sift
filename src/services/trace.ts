import * as Sentry from '@sentry/react-native';
import { BREADCRUMB_EVENTS, formatTraceLine, traceMode, type TraceData, type TraceMode } from '../utils/trace';

// The E2E trace (CLAUDE.md, "A flaky E2E flow is a bug"): in the E2E build
// each event is a line in the iOS system log, which CI records for the whole
// suite (maestro-results/trace.txt), so a tap that did nothing says where it
// went. React Native writes console.info there (os_log, subsystem
// com.facebook.react.log). Not console.error: a release build reports that
// as a soft exception.

export interface Tracer {
  readonly mode: TraceMode;
  trace(event: string, data?: TraceData): void;
  /** The screen or sheet on top, for touch lines. */
  currentScreen(): string;
  /** Marks a screen as up until the returned function is called. */
  enterScreen(name: string): () => void;
  /**
   * A touch JavaScript saw: where, on what, and how late (its timestamp is
   * on the tracer's clock, performance.now()'s).
   */
  traceTouch(phase: string, x: number, y: number, timestampMs: number): void;
}

export function createTracer(
  mode: TraceMode,
  now: () => number,
  log: (line: string) => void,
  breadcrumb: (event: string, data?: TraceData) => void,
): Tracer {
  const startedAt = now();
  let seq = 0;
  // Screens and sheets in the order they came up: a sheet over a screen is
  // on top until it goes.
  const screens: string[] = [];
  const currentScreen = () => (screens.length > 0 ? screens[screens.length - 1] : 'none');
  const trace = (event: string, data?: TraceData) => {
    if (mode === 'log') {
      seq += 1;
      log(formatTraceLine(seq, now() - startedAt, event, data));
    } else if (BREADCRUMB_EVENTS.has(event)) {
      breadcrumb(event, data);
    }
  };
  return {
    mode,
    trace,
    currentScreen,
    enterScreen(name) {
      screens.push(name);
      return () => {
        const at = screens.lastIndexOf(name);
        if (at >= 0) screens.splice(at, 1);
      };
    },
    traceTouch(phase, x, y, timestampMs) {
      trace(`touch-${phase}`, {
        x: Math.round(x),
        y: Math.round(y),
        screen: currentScreen(),
        lag: Math.round(now() - timestampMs),
      });
    },
  };
}

const tracer = createTracer(
  traceMode(process.env.EXPO_PUBLIC_USE_MOCK_PROVIDER, __DEV__),
  // A touch's timestamp counts on this clock too.
  () => performance.now(),
  (line) => console.info(line),
  (event, data) => Sentry.addBreadcrumb({ category: 'ui.trace', message: event, data, level: 'info' }),
);

/** Whether this build writes trace lines (the E2E build). */
export const tracing = tracer.mode === 'log';
export const trace = tracer.trace;
export const currentScreen = tracer.currentScreen;
export const enterScreen = tracer.enterScreen;
export const traceTouch = tracer.traceTouch;
