import fc from 'fast-check';
import { createSerialQueue } from '../../src/utils/serialQueue';

// Property-based test: a native playlist removal reads the playlist and
// writes it back, so two writes at once would undo each other (CLAUDE.md,
// "Library writes run one at a time"). Whatever mix of quick, slow and
// failing jobs is queued, each starts only after the one before it has
// settled, in the order queued, and every caller gets its own job's result.

// A job: how many microtask turns it takes, and whether it fails.
const job = fc.record({ turns: fc.nat({ max: 5 }), fails: fc.boolean() });

const turns = async (n: number) => {
  for (let i = 0; i < n; i++) await Promise.resolve();
};

describe('createSerialQueue properties', () => {
  test('jobs run one at a time, in order, each caller getting its own outcome', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(job, { minLength: 1, maxLength: 12 }), async (jobs) => {
        // Long enough that no stall timer fires: every job here settles
        // within a few microtask turns, and settling clears its timers.
        const queue = createSerialQueue(60_000);
        const log: string[] = [];
        let running = 0;
        const results = jobs.map((spec, i) =>
          queue
            .run(async () => {
              running++;
              expect(running).toBe(1);
              log.push(`start ${i}`);
              await turns(spec.turns);
              log.push(`end ${i}`);
              running--;
              if (spec.fails) throw new Error(`job ${i}`);
              return i;
            })
            .then(
              (value) => ({ ok: true, value }),
              (err: Error) => ({ ok: false, value: err.message }),
            ),
        );
        const outcomes = await Promise.all(results);
        await queue.settled();

        expect(log).toEqual(jobs.flatMap((_, i) => [`start ${i}`, `end ${i}`]));
        expect(outcomes).toEqual(
          jobs.map((spec, i) =>
            spec.fails ? { ok: false, value: `job ${i}` } : { ok: true, value: i },
          ),
        );
      }),
    );
  });
});
