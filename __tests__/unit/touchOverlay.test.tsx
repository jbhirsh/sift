import React from 'react';
import { act, render } from '@testing-library/react-native';
import TouchOverlay from '../../src/components/TouchOverlay';
import { createTouchMarkStore, touchMarks } from '../../src/services/touchOverlay';
import { PRESS_OUT_MS } from '../../src/utils/touchMarks';
import { a11yViolations } from '../helpers/a11yScan';

// Past a released ring's fade-out.
const FADED_MS = PRESS_OUT_MS + 150;

// Whether this launch draws touches is decided once, from the launch
// argument; here a switch stands in for it.
let mockShowTouches = false;
jest.mock('../../src/services/touchOverlay', () => {
  const actual = jest.requireActual<typeof import('../../src/services/touchOverlay')>(
    '../../src/services/touchOverlay',
  );
  // A getter defined on its own: an object spread would read it once, here.
  return Object.defineProperty({ __esModule: true, ...actual }, 'showTouches', {
    get: () => mockShowTouches,
  });
});

describe('the touch mark store', () => {
  it('feeds touches through to marks and tells subscribers', () => {
    const store = createTouchMarkStore();
    const seen: number[] = [];
    const unsubscribe = store.subscribe((marks) => seen.push(marks.trail.length));
    store.down(10, 10, 0);
    store.move(40, 10, 10);
    store.up(40, 10, 20);
    expect(store.get().press).toMatchObject({ x: 40, y: 10, downAt: 0, upAt: 20 });
    expect(store.get().trail).toEqual([{ x: 40, y: 10, at: 10 }]);
    expect(seen).toEqual([0, 1, 1]);
    unsubscribe();
    store.down(0, 0, 30);
    expect(seen).toHaveLength(3);
  });

  it("follow carries a cancelled press on, as a gesture's update", () => {
    const store = createTouchMarkStore();
    store.down(0, 0, 0);
    store.up(0, 0, 10);
    store.follow(30, 0, 20);
    expect(store.get().press).toMatchObject({ x: 30, upAt: null });
  });

  it('the newest Modal layer draws; giving it back hands drawing to the one before, then the root', () => {
    const store = createTouchMarkStore();
    const listener = jest.fn();
    store.subscribe(listener);
    expect(store.topLayer()).toBeNull();
    const releaseFirst = store.claimLayer('first');
    const releaseSecond = store.claimLayer('second');
    expect(store.topLayer()).toBe('second');
    releaseSecond();
    expect(store.topLayer()).toBe('first');
    releaseFirst();
    expect(store.topLayer()).toBeNull();
    // Each change tells the overlays, so the right one redraws.
    expect(listener).toHaveBeenCalledTimes(4);
  });

  it('tick drops what has faded, telling subscribers only when something changed', () => {
    const store = createTouchMarkStore();
    store.down(0, 0, 0);
    store.up(0, 0, 0);
    const listener = jest.fn();
    store.subscribe(listener);
    expect(store.tick(10).press).not.toBeNull();
    expect(listener).not.toHaveBeenCalled();
    expect(store.tick(10_000).press).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('TouchOverlay', () => {
  afterEach(async () => {
    // Let any held ring scale out so the shared store starts empty.
    await act(async () => {
      touchMarks.up(0, 0, performance.now() - 10_000);
      touchMarks.tick(performance.now());
    });
    mockShowTouches = false;
  });

  it('draws nothing unless the launch asked for touches', async () => {
    const screen = await render(<TouchOverlay />);
    expect(screen.toJSON()).toBeNull();
  });

  it('draws a ring for a press and dots for a drag, never taking a touch or reaching VoiceOver', async () => {
    mockShowTouches = true;
    const screen = await render(<TouchOverlay />);
    const layer = screen.getByTestId('touch-overlay', { includeHiddenElements: true });
    expect(layer.props.pointerEvents).toBe('none');
    expect(layer.props.accessibilityElementsHidden).toBe(true);
    expect(layer.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(screen.queryByTestId('touch-ring', { includeHiddenElements: true })).toBeNull();
    await act(async () => {
      touchMarks.down(100, 200, performance.now());
      touchMarks.move(140, 200, performance.now());
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    const ring = screen.getByTestId('touch-ring', { includeHiddenElements: true });
    expect(ring.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ left: 140 - 17, top: 200 - 17 })]),
    );
    expect(screen.toJSON()).toMatchObject({ children: [expect.anything(), expect.anything()] });
    expect(a11yViolations(screen.toJSON())).toEqual([]);
    // Released, the ring scales out and goes.
    await act(async () => {
      touchMarks.up(140, 200, performance.now());
      await new Promise((resolve) => setTimeout(resolve, FADED_MS));
    });
    expect(screen.queryByTestId('touch-ring', { includeHiddenElements: true })).toBeNull();
  });

  it('stops redrawing once every mark has gone', async () => {
    mockShowTouches = true;
    const raf = jest.spyOn(globalThis, 'requestAnimationFrame');
    try {
      await render(<TouchOverlay />);
      await act(async () => {
        touchMarks.down(10, 10, performance.now());
        touchMarks.up(10, 10, performance.now());
        await new Promise((resolve) => setTimeout(resolve, FADED_MS));
      });
      const frames = raf.mock.calls.length;
      expect(frames).toBeGreaterThan(0);
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });
      expect(raf.mock.calls.length).toBe(frames);
    } finally {
      raf.mockRestore();
    }
  });

  it("only one overlay draws: a Modal's while it's up, the root's otherwise", async () => {
    mockShowTouches = true;
    const screen = await render(<TouchOverlay />);
    const layers = () =>
      screen.queryAllByTestId('touch-overlay', { includeHiddenElements: true }).length;
    expect(layers()).toBe(1);
    await screen.rerender(
      <>
        <TouchOverlay />
        <TouchOverlay inModal />
      </>,
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(layers()).toBe(1);
    expect(screen.toJSON()).not.toBeNull();
    await screen.rerender(<TouchOverlay />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(layers()).toBe(1);
  });

  it('a Modal opening while a ring fades carries the fade on', async () => {
    mockShowTouches = true;
    const screen = await render(<TouchOverlay />);
    await act(async () => {
      touchMarks.down(50, 60, performance.now());
      touchMarks.up(50, 60, performance.now());
    });
    await screen.rerender(
      <>
        <TouchOverlay />
        <TouchOverlay inModal />
      </>,
    );
    const opacity = () => {
      const ring = screen.getByTestId('touch-ring', { includeHiddenElements: true });
      return (ring.props.style as { opacity?: number }[]).find(
        (style) => style.opacity !== undefined,
      )?.opacity;
    };
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    const early = opacity() ?? 0;
    // Nothing else changes in the store meanwhile: only its own loop moves it.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    expect(opacity()).toBeLessThan(early);
  });
});
