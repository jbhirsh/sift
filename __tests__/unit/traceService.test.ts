import * as Sentry from '@sentry/react-native';
import {
  createTracer,
  currentScreen,
  enterScreen,
  trace,
  traceTouch,
  tracing,
} from '../../src/services/trace';

const clock = (start: number) => {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
};

describe('createTracer, log mode (the E2E build)', () => {
  test('numbers each line and times it from launch; no breadcrumbs', () => {
    const c = clock(1_000);
    const log = jest.fn();
    const breadcrumb = jest.fn();
    const tracer = createTracer('log', c.now, log, breadcrumb);
    c.advance(42);
    tracer.trace('screen', { name: 'sift', at: 'up' });
    c.advance(8);
    tracer.trace('guard-busy', { input: 'skip', held: 3 });
    expect(log.mock.calls).toEqual([
      ['[sift-trace] #1 +42ms screen name=sift at=up'],
      ['[sift-trace] #2 +50ms guard-busy input=skip held=3'],
    ]);
    expect(breadcrumb).not.toHaveBeenCalled();
    expect(tracer.mode).toBe('log');
  });

  test('a touch line says where, on which screen, and how late JavaScript saw it', () => {
    // A touch's timestamp is on the tracer's own clock.
    const c = clock(10_000);
    const log = jest.fn();
    const tracer = createTracer('log', c.now, log, jest.fn());
    const leave = tracer.enterScreen('sift');
    c.advance(100);
    tracer.traceTouch('start', 200.4, 797.6, 10_099.6);
    c.advance(3_000);
    tracer.traceTouch('end', 200, 798, 10_200);
    leave();
    tracer.traceTouch('start', 1, 2, 13_100);
    expect(log.mock.calls).toEqual([
      ['[sift-trace] #1 +100ms touch-start x=200 y=798 screen=sift lag=0'],
      ['[sift-trace] #2 +3100ms touch-end x=200 y=798 screen=sift lag=2900'],
      ['[sift-trace] #3 +3100ms touch-start x=1 y=2 screen=none lag=0'],
    ]);
  });
});

describe('createTracer, breadcrumb mode (every other build)', () => {
  test('writes no lines; only a turned-away tap becomes a breadcrumb', () => {
    const log = jest.fn();
    const breadcrumb = jest.fn();
    const tracer = createTracer('breadcrumb', () => 0, log, breadcrumb);
    tracer.trace('screen', { name: 'sift', at: 'up' });
    tracer.trace('guard-take', { input: 'skip' });
    tracer.trace('guard-busy', { input: 'skip', held: 3 });
    tracer.trace('js-stall', { gap: 16_000 });
    tracer.traceTouch('start', 1, 2, 3);
    expect(log).not.toHaveBeenCalled();
    expect(breadcrumb.mock.calls).toEqual([['guard-busy', { input: 'skip', held: 3 }]]);
  });
});

describe('screens', () => {
  test('the last one up is on top; one going down takes only itself', () => {
    const tracer = createTracer('log', () => 0, jest.fn(), jest.fn());
    expect(tracer.currentScreen()).toBe('none');
    const leaveSift = tracer.enterScreen('sift');
    const leaveSheet = tracer.enterScreen('decisions');
    expect(tracer.currentScreen()).toBe('decisions');
    leaveSift();
    expect(tracer.currentScreen()).toBe('decisions');
    leaveSheet();
    expect(tracer.currentScreen()).toBe('none');
    // Going down twice is harmless, even with another screen up.
    const leaveDone = tracer.enterScreen('done');
    leaveSheet();
    expect(tracer.currentScreen()).toBe('done');
    leaveDone();
    expect(tracer.currentScreen()).toBe('none');
  });

  test('two of the same name: each leave removes one', () => {
    const tracer = createTracer('log', () => 0, jest.fn(), jest.fn());
    const first = tracer.enterScreen('setup');
    tracer.enterScreen('setup');
    first();
    expect(tracer.currentScreen()).toBe('setup');
  });
});

describe("the app's tracer", () => {
  test("in tests (a dev build) it doesn't trace: breadcrumbs only, through Sentry", () => {
    const info = jest.spyOn(console, 'info').mockImplementation(() => {});
    (Sentry.addBreadcrumb as jest.Mock).mockClear();
    expect(tracing).toBe(false);
    trace('guard-take', { input: 'skip' });
    trace('guard-busy', { input: 'keep', held: 40 });
    traceTouch('start', 1, 2, 3);
    expect(info).not.toHaveBeenCalled();
    expect(Sentry.addBreadcrumb).toHaveBeenCalledTimes(1);
    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith({
      category: 'ui.trace',
      message: 'guard-busy',
      data: { input: 'keep', held: 40 },
      level: 'info',
    });
    const leave = enterScreen('done');
    expect(currentScreen()).toBe('done');
    leave();
    info.mockRestore();
  });

  test('the E2E build writes each line with console.info', () => {
    const globals = globalThis as unknown as { __DEV__: boolean };
    const wasDev = globals.__DEV__;
    const wasMock = process.env.EXPO_PUBLIC_USE_MOCK_PROVIDER;
    const info = jest.spyOn(console, 'info').mockImplementation(() => {});
    try {
      globals.__DEV__ = false;
      process.env.EXPO_PUBLIC_USE_MOCK_PROVIDER = '1';
      jest.isolateModules(() => {
        const e2e: typeof import('../../src/services/trace') = require('../../src/services/trace');
        expect(e2e.tracing).toBe(true);
        e2e.trace('play', { id: 'mock-3' });
      });
      expect(info).toHaveBeenCalledTimes(1);
      expect(info.mock.calls[0][0]).toMatch(/^\[sift-trace\] #1 \+\d+ms play id=mock-3$/);
    } finally {
      globals.__DEV__ = wasDev;
      if (wasMock === undefined) delete process.env.EXPO_PUBLIC_USE_MOCK_PROVIDER;
      else process.env.EXPO_PUBLIC_USE_MOCK_PROVIDER = wasMock;
      info.mockRestore();
    }
  });
});
