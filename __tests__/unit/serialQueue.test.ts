import { createSerialQueue } from '../../src/utils/serialQueue';

/** A promise the test settles by hand. */
function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const flush = () => new Promise<void>((resolve) => setImmediate(() => resolve()));

describe('createSerialQueue', () => {
  test('runs one job at a time, in the order queued', async () => {
    const queue = createSerialQueue(1000);
    const first = deferred();
    const log: string[] = [];
    const a = queue.run(async () => { log.push('a starts'); await first.promise; log.push('a ends'); });
    const b = queue.run(async () => { log.push('b starts'); });
    await flush();
    expect(log).toEqual(['a starts']);
    first.resolve();
    await Promise.all([a, b]);
    expect(log).toEqual(['a starts', 'a ends', 'b starts']);
  });

  test('hands each caller its own job\'s result', async () => {
    const queue = createSerialQueue(1000);
    await expect(Promise.all([queue.run(async () => 1), queue.run(async () => 'two')])).resolves.toEqual([1, 'two']);
  });

  test('a job that fails rejects for its caller only; the next still runs', async () => {
    const queue = createSerialQueue(1000);
    const failing = queue.run(async () => { throw new Error('nope'); });
    const next = queue.run(async () => 'ran');
    await expect(failing).rejects.toThrow('nope');
    await expect(next).resolves.toBe('ran');
  });

  describe('a job that never settles', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    test('holds the queue for the stall time, then lets the next job start', async () => {
      const queue = createSerialQueue(1000);
      void queue.run(() => new Promise<void>(() => {}));
      const next = jest.fn(async () => 'ran');
      const result = queue.run(next);
      await jest.advanceTimersByTimeAsync(999);
      expect(next).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(1);
      expect(next).toHaveBeenCalledTimes(1);
      await expect(result).resolves.toBe('ran');
    });

    test('the stall time counts from when the job started, not when it was queued', async () => {
      const queue = createSerialQueue(1000);
      const first = deferred();
      void queue.run(() => first.promise);
      void queue.run(() => new Promise<void>(() => {})); // queued now, starts later
      const third = jest.fn(async () => undefined);
      void queue.run(third);
      await jest.advanceTimersByTimeAsync(900);
      first.resolve(); // the hung job starts at 900 ms
      await jest.advanceTimersByTimeAsync(999);
      expect(third).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(1);
      expect(third).toHaveBeenCalledTimes(1);
    });

    test('a job that settles in time clears its stall timer', async () => {
      const queue = createSerialQueue(1000);
      await queue.run(async () => undefined);
      await jest.advanceTimersByTimeAsync(0);
      expect(jest.getTimerCount()).toBe(0);
    });
  });
});
