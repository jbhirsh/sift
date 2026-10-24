/**
 * Runs async jobs one at a time, in the order they were queued. A job that
 * never settles holds the queue for at most `stallMs`; after that the next
 * job starts anyway, so one hung call can't block every later one, and the
 * hung job's caller gets a QueueStallError instead of waiting forever.
 */
export interface SerialQueue {
  run<T>(job: () => Promise<T>): Promise<T>;
  /**
   * Resolves once every job queued so far has really settled, one whose
   * caller already got a QueueStallError included, but waits for a job at
   * most `giveUpMs` after it started: one that never settles can't hold
   * every later caller for the rest of the launch.
   */
  settled(): Promise<void>;
}

/**
 * A queued job that didn't settle within the stall time. The job itself
 * may still finish later: nothing can cancel it.
 */
export class QueueStallError extends Error {
  constructor(stallMs: number) {
    super(
      `No answer after ${Math.round(stallMs / 1000)} s. It may still finish; try again in a moment.`,
    );
    this.name = 'QueueStallError';
  }
}

export function createSerialQueue(stallMs: number, giveUpMs = stallMs * 4): SerialQueue {
  let tail: Promise<void> = Promise.resolve();
  let everything: Promise<void> = Promise.resolve();
  return {
    run<T>(job: () => Promise<T>): Promise<T> {
      let finished!: () => void;
      const done = new Promise<void>((resolve) => {
        finished = resolve;
      });
      everything = Promise.all([everything, done]).then(() => undefined);
      // The stall time counts from when this job starts, not when it was
      // queued. Whichever comes first, the job settling or the stall
      // timeout, settles the caller's promise and lets the next job start.
      const result = tail.then(
        () =>
          new Promise<T>((resolve, reject) => {
            const timer = setTimeout(() => reject(new QueueStallError(stallMs)), stallMs);
            const giveUp = setTimeout(finished, giveUpMs);
            const settle = () => {
              clearTimeout(timer);
              clearTimeout(giveUp);
              finished();
            };
            Promise.resolve()
              .then(job)
              .then(
                (value) => {
                  settle();
                  resolve(value);
                },
                (err: unknown) => {
                  settle();
                  reject(err);
                },
              );
          }),
      );
      tail = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
    settled(): Promise<void> {
      return everything;
    },
  };
}
