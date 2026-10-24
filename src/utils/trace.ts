// The E2E trace's pure parts: when a build writes it, what a line looks
// like, which actions it names, and the arithmetic behind its touch lag and
// stall lines. services/trace writes the lines.

/** What a trace line may carry: ids, counts and flags, never a song's name. */
export type TraceData = Readonly<Record<string, string | number | boolean>>;

/** Every line starts with this, so CI can pick them out of the system log. */
export const TRACE_TAG = '[sift-trace]';

/**
 * `log`: every event is a line in the system log. Only a release build on
 * the mock provider, which is only ever the E2E build: a dev build would
 * just fill Metro with them, and a real one has no use for them.
 * `breadcrumb`: no lines; a turned-away tap becomes a Sentry breadcrumb,
 * which leaves the phone only with an error report.
 */
export type TraceMode = 'log' | 'breadcrumb';

export function traceMode(useMockProvider: string | undefined, isDev: boolean): TraceMode {
  return useMockProvider === '1' && !isDev ? 'log' : 'breadcrumb';
}

/**
 * The events breadcrumb mode records. Sentry already records every tap; this
 * says why one did nothing. (The stall watch runs only in the E2E build.)
 */
export const BREADCRUMB_EVENTS: ReadonlySet<string> = new Set(['guard-busy']);

/** `[sift-trace] #12 +3456ms guard-busy input=skip held=40` */
export function formatTraceLine(
  seq: number,
  elapsedMs: number,
  event: string,
  data?: TraceData,
): string {
  const pairs = data
    ? Object.entries(data)
        .map(([key, value]) => ` ${key}=${value}`)
        .join('')
    : '';
  return `${TRACE_TAG} #${seq} +${Math.round(elapsedMs)}ms ${event}${pairs}`;
}

/**
 * The trace's name for an action, or null for one it leaves out: the
 * playback poller's position ticks, twice a second, would bury the rest.
 * Only the type and plain fields: a track never goes in a line.
 */
export function describeAction(action: {
  type: string;
  decision?: unknown;
  phase?: unknown;
}): TraceData | null {
  if (action.type === 'SET_PLAYBACK_POSITION') return null;
  const data: Record<string, string> = { type: action.type };
  if (typeof action.decision === 'string') data.decision = action.decision;
  if (typeof action.phase === 'string') data.phase = action.phase;
  return data;
}

/** The stall watch ticks this often... */
export const STALL_TICK_MS = 250;
/** ...and reports a gap between ticks at least this long. */
export const STALL_REPORT_MS = 1000;

/** A gap between two ticks worth reporting, in ms, or null for a normal one. */
export function stallGap(previousTickMs: number, nowMs: number): number | null {
  const gap = nowMs - previousTickMs;
  return gap >= STALL_REPORT_MS ? Math.round(gap) : null;
}
