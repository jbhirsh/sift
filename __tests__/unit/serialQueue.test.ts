import { createSerialQueue, QueueStallError } from '../../src/utils/serialQueue';

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

  test('a job that throws before returning a promise rejects for its caller only', async () => {
    const queue = createSerialQueue(1000);
    const failing = queue.run((): Promise<void> => { throw new Error('sync'); });
    await expect(failing).rejects.toThrow('sync');
    await expect(queue.run(async () => 'next')).resolves.toBe('next');
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
      const hung = queue.run(() => new Promise<void>(() => {}));
      hung.catch(() => undefined);
      const next = jest.fn(async () => 'ran');
      const result = queue.run(next);
      await jest.advanceTimersByTimeAsync(999);
      expect(next).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(1);
      expect(next).toHaveBeenCalledTimes(1);
      await expect(result).resolves.toBe('ran');
    });

    test('its caller gets a stall error at the stall time instead of waiting forever', async () => {
      const queue = createSerialQueue(30000);
      const hung = queue.run(() => new Promise<void>(() => {}));
      const outcome = jest.fn();
      hung.then(() => outcome('resolved'), (err: unknown) => outcome(err));
      await jest.advanceTimersByTimeAsync(29999);
      expect(outcome).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(1);
      expect(outcome).toHaveBeenCalledTimes(1);
      const err = outcome.mock.calls[0][0] as Error;
      expect(err).toBeInstanceOf(QueueStallError);
      expect(err.name).toBe('QueueStallError');
      expect(err.message).toBe('No answer after 30 s. It may still finish; try again in a moment.');
    });

    test('a job that settles late doesn\'t change the stall error its caller got', async () => {
      const queue = createSerialQueue(1000);
      const late = deferred<string>();
      const result = queue.run(() => late.promise);
      const assertion = expect(result).rejects.toBeInstanceOf(QueueStallError);
      await jest.advanceTimersByTimeAsync(1000);
      late.resolve('too late');
      await assertion;
    });

    test('the stall time counts from when the job started, not when it was queued', async () => {
      const queue = createSerialQueue(1000);
      const first = deferred();
      void queue.run(() => first.promise);
      // Queued now, starts later; its caller's stall error isn't this test's subject.
      queue.run(() => new Promise<void>(() => {})).catch(() => undefined);
      const third = jest.fn(async () => undefined);
      void queue.run(third);
      await jest.advanceTimersByTimeAsync(900);
      first.resolve(); // the hung job starts at 900 ms
      await jest.advanceTimersByTimeAsync(999);
      expect(third).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(1);
      expect(third).toHaveBeenCalledTimes(1);
    });

    test('settled waits for every job queued so far, a stalled one until it really finishes', async () => {
      const queue = createSerialQueue(1000);
      const late = deferred<string>();
      queue.run(() => late.promise).catch(() => undefined);
      const after = jest.fn(async () => 'next');
      void queue.run(after);
      const settled = jest.fn();
      void queue.settled().then(settled);
      await jest.advanceTimersByTimeAsync(1000);
      // The stall let the next job run, but the stalled one is still going.
      expect(after).toHaveBeenCalledTimes(1);
      expect(settled).not.toHaveBeenCalled();
      late.resolve('landed');
      await jest.advanceTimersByTimeAsync(0);
      expect(settled).toHaveBeenCalledTimes(1);
    });

    test('settled stops waiting for a job that never settles giveUpMs after it started', async () => {
      const queue = createSerialQueue(1000, 5000);
      queue.run(() => new Promise<void>(() => {})).catch(() => undefined);
      const settled = jest.fn();
      void queue.settled().then(settled);
      await jest.advanceTimersByTimeAsync(4999);
      expect(settled).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(1);
      expect(settled).toHaveBeenCalledTimes(1);
      // Later callers aren't held by it either.
      await expect(queue.settled()).resolves.toBeUndefined();
    });

    test('by default settled gives up on a job four stall times after it started', async () => {
      const queue = createSerialQueue(1000);
      queue.run(() => new Promise<void>(() => {})).catch(() => undefined);
      const settled = jest.fn();
      void queue.settled().then(settled);
      await jest.advanceTimersByTimeAsync(3999);
      expect(settled).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(1);
      expect(settled).toHaveBeenCalledTimes(1);
    });

    test('settled counts a failed job as finished, and resolves at once with nothing queued', async () => {
      const queue = createSerialQueue(1000);
      await expect(queue.settled()).resolves.toBeUndefined();
      queue.run(async () => { throw new Error('nope'); }).catch(() => undefined);
      await expect(queue.settled()).resolves.toBeUndefined();
    });

    test('a job that settles in time clears its stall timer', async () => {
      const queue = createSerialQueue(1000);
      await queue.run(async () => undefined);
      await jest.advanceTimersByTimeAsync(0);
      expect(jest.getTimerCount()).toBe(0);
    });
  });
});
