/**
 * Runs async jobs one at a time, in the order they were queued. A job that
 * never settles holds the queue for at most `stallMs`; after that the next
 * job starts anyway, so one hung call can't block every later one.
 */
export interface SerialQueue {
  run<T>(job: () => Promise<T>): Promise<T>;
}

export function createSerialQueue(stallMs: number): SerialQueue {
  let tail: Promise<void> = Promise.resolve();
  return {
    run<T>(job: () => Promise<T>): Promise<T> {
      const previous = tail;
      const result = previous.then(job);
      // The next job waits for this one to settle, either way, or for the
      // stall timeout counted from when this one started, whichever is first.
      tail = previous.then(() => new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, stallMs);
        const done = () => {
          clearTimeout(timer);
          resolve();
        };
        result.then(done, done);
      }));
      return result;
    },
  };
}
