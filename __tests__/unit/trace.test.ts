import {
  BREADCRUMB_EVENTS,
  STALL_REPORT_MS,
  STALL_TICK_MS,
  TRACE_TAG,
  describeAction,
  formatTraceLine,
  stallGap,
  traceMode,
} from '../../src/utils/trace';

describe('traceMode', () => {
  test('only a release build on the mock provider (the E2E build) writes lines', () => {
    expect(traceMode('1', false)).toBe('log');
  });

  test('a dev build, or any build on a real provider, keeps breadcrumbs only', () => {
    expect(traceMode('1', true)).toBe('breadcrumb');
    expect(traceMode(undefined, false)).toBe('breadcrumb');
    expect(traceMode('0', false)).toBe('breadcrumb');
    expect(traceMode('true', false)).toBe('breadcrumb');
  });
});

describe('formatTraceLine', () => {
  test('tag, sequence, whole milliseconds since launch, event, then key=value pairs', () => {
    expect(formatTraceLine(12, 3456.4, 'guard-busy', { input: 'skip', held: 40, ok: false })).toBe(
      '[sift-trace] #12 +3456ms guard-busy input=skip held=40 ok=false',
    );
    expect(formatTraceLine(1, 0.6, 'tick')).toBe('[sift-trace] #1 +1ms tick');
  });

  test('every line starts with the tag CI picks them out by', () => {
    expect(formatTraceLine(3, 9, 'x', {})).toBe(`${TRACE_TAG} #3 +9ms x`);
    expect(TRACE_TAG).toBe('[sift-trace]');
  });
});

describe('describeAction', () => {
  test('names the type, and a decision or phase when the action has one', () => {
    expect(describeAction({ type: 'DECIDE', decision: 'skip' })).toEqual({
      type: 'DECIDE',
      decision: 'skip',
    });
    expect(describeAction({ type: 'SET_PHASE', phase: 'done' })).toEqual({
      type: 'SET_PHASE',
      phase: 'done',
    });
    expect(describeAction({ type: 'UNDO_LAST' })).toEqual({ type: 'UNDO_LAST' });
  });

  test('nothing else from the action: never a track', () => {
    const action = {
      type: 'LOAD_TRACKS',
      tracks: [{ id: 'a', name: 'Secret Song' }],
      decision: 3,
      phase: null,
    };
    expect(describeAction(action)).toEqual({ type: 'LOAD_TRACKS' });
  });

  test("leaves out the poller's position ticks", () => {
    expect(describeAction({ type: 'SET_PLAYBACK_POSITION' })).toBeNull();
    expect(describeAction({ type: 'SET_IS_PLAYING' })).toEqual({ type: 'SET_IS_PLAYING' });
  });
});

describe('stallGap', () => {
  test('a normal tick, or one a little late, is not reported', () => {
    expect(stallGap(1_000, 1_000 + STALL_TICK_MS)).toBeNull();
    expect(stallGap(1_000, 1_000 + STALL_REPORT_MS - 1)).toBeNull();
  });

  test('a gap of a second or more is, in whole milliseconds', () => {
    expect(stallGap(1_000, 1_000 + STALL_REPORT_MS)).toBe(1_000);
    expect(stallGap(1_000, 17_000.6)).toBe(16_001);
  });

  test('ticks four times a second', () => {
    expect(STALL_TICK_MS).toBe(250);
    expect(STALL_REPORT_MS).toBe(1000);
  });
});

test('breadcrumbs carry only a turned-away tap', () => {
  expect([...BREADCRUMB_EVENTS]).toEqual(['guard-busy']);
});
