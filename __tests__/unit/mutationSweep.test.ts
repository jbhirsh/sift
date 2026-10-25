import { relativeName } from '../../scripts/mutationScope';
import {
  fileWeights,
  mergeReports,
  mergeSummary,
  mutantWeight,
  reportWeights,
  shardConfig,
  shardMatrix,
  shardTable,
  splitShards,
  sweepCounts,
  testKey,
  type SweepReport,
  type SweepTest,
} from '../../scripts/mutationSweep';

const CWD = '/home/runner/work/sift/sift';
const relative = (file: string) => relativeName(file, CWD);

describe('mutantWeight', () => {
  it('counts one run plus each covering test', () => {
    expect(mutantWeight({ status: 'Killed', coveredBy: ['1', '2', '3'] })).toBe(4);
    expect(mutantWeight({ status: 'NoCoverage' })).toBe(1);
  });

  it('counts nothing for an ignored mutant, which never runs', () => {
    expect(mutantWeight({ status: 'Ignored', coveredBy: ['1'] })).toBe(0);
  });
});

describe('reportWeights', () => {
  it("sums each file's mutants, by cwd-relative name", () => {
    const report: SweepReport = {
      files: {
        [`${CWD}/src/utils/a.ts`]: {
          mutants: [{ status: 'Killed', coveredBy: ['0'] }, { status: 'Survived' }],
        },
        'src/utils/b.ts': { mutants: [{ status: 'Ignored' }] },
        'src/utils/c.ts': {},
      },
    };
    expect(reportWeights(report, relative)).toEqual(
      new Map([
        ['src/utils/a.ts', 3],
        ['src/utils/b.ts', 0],
        ['src/utils/c.ts', 0],
      ]),
    );
  });

  it('knows nothing from results with no files', () => {
    expect(reportWeights({}, relative).size).toBe(0);
  });
});

describe('fileWeights', () => {
  const lines = (file: string) => ({ 'a.ts': 100, 'b.ts': 50, 'c.ts': 30 })[file] ?? 0;

  it('takes known weights, and scales the rest by the known weight per line', () => {
    // 200 weight over 100 known lines: 2 a line, so c.ts's 30 lines weigh 60.
    expect(fileWeights(['a.ts', 'c.ts'], lines, new Map([['a.ts', 200]]))).toEqual(
      new Map([
        ['a.ts', 200],
        ['c.ts', 60],
      ]),
    );
  });

  it('rounds a scaled weight', () => {
    expect(fileWeights(['a.ts', 'c.ts'], lines, new Map([['a.ts', 10]])).get('c.ts')).toBe(3);
  });

  it('weighs line counts when nothing is known', () => {
    expect(fileWeights(['a.ts', 'b.ts'], lines, new Map())).toEqual(
      new Map([
        ['a.ts', 100],
        ['b.ts', 50],
      ]),
    );
  });

  it("ignores known weights of files that aren't in scope", () => {
    expect(fileWeights(['b.ts'], lines, new Map([['gone.ts', 999]]))).toEqual(
      new Map([['b.ts', 50]]),
    );
  });
});

describe('splitShards', () => {
  it('puts each file, biggest first, in the lightest shard', () => {
    const weights = new Map([
      ['a', 10],
      ['b', 7],
      ['c', 5],
      ['d', 4],
      ['e', 2],
    ]);
    expect(splitShards(weights, 2)).toEqual([
      { files: ['a', 'd'], weight: 14 },
      { files: ['b', 'c', 'e'], weight: 14 },
    ]);
  });

  it('breaks ties toward the lower shard and equal weights by path', () => {
    const weights = new Map([
      ['z', 1],
      ['y', 1],
      ['x', 1],
    ]);
    expect(splitShards(weights, 2)).toEqual([
      { files: ['x', 'z'], weight: 2 },
      { files: ['y'], weight: 1 },
    ]);
  });

  it('never makes an empty shard', () => {
    expect(splitShards(new Map([['a', 1]]), 8)).toEqual([{ files: ['a'], weight: 1 }]);
    expect(splitShards(new Map(), 3)).toEqual([]);
  });

  it('gives every file to exactly one shard', () => {
    const weights = new Map(Array.from({ length: 30 }, (_, i) => [`f${i}`, (i * 7) % 11]));
    const files = splitShards(weights, 4).flatMap((s) => s.files);
    expect(files.sort()).toEqual([...weights.keys()].sort());
  });
});

describe('shardMatrix', () => {
  it('numbers the shards from 1 and joins their files for --mutate', () => {
    expect(
      shardMatrix([
        { files: ['a.ts', 'b.ts'], weight: 3 },
        { files: ['c.ts'], weight: 2 },
      ]),
    ).toEqual({
      include: [
        { shard: 1, mutate: 'a.ts,b.ts' },
        { shard: 2, mutate: 'c.ts' },
      ],
    });
  });
});

describe('shardTable', () => {
  const shards = [{ files: ['a.ts', 'b.ts'], weight: 30 }];

  it('says each shard has how many files and how much weight', () => {
    expect(shardTable(shards, true)).toBe(
      [
        '| Shard | Files | Weight (mutants plus covering tests, last results) |',
        '| --- | --- | --- |',
        '| 1 | 2 | 30 |',
        '',
      ].join('\n'),
    );
  });

  it('says when the weights are line counts', () => {
    expect(shardTable(shards, false)).toContain('| Weight (lines) |');
  });
});

describe('shardConfig', () => {
  it('drops the break threshold and keeps the rest', () => {
    expect(
      shardConfig({ testRunner: 'jest', thresholds: { high: 80, low: 65, break: 80 } }),
    ).toEqual({ testRunner: 'jest', thresholds: { high: 80, low: 65, break: null } });
  });

  it('works with no thresholds', () => {
    expect(shardConfig({ testRunner: 'jest' })).toEqual({
      testRunner: 'jest',
      thresholds: { break: null },
    });
  });
});

/** A test as Stryker's results list it. */
const test = (id: string, name: string, line: number, column = 4): SweepTest => ({
  id,
  name,
  location: { start: { line, column } },
});

describe('testKey', () => {
  it('names the file relative to the checkout, the start and the name', () => {
    expect(testKey(`${CWD}/__tests__/unit/a.test.ts`, test('3', 'a works', 12, 2), relative)).toBe(
      '__tests__/unit/a.test.ts@12:2\na works',
    );
  });

  it('reads a missing position as the start of the file', () => {
    expect(testKey('a.test.ts', { id: '1', name: 'a' }, relative)).toBe('a.test.ts@0:0\na');
  });
});

describe('mergeReports', () => {
  const shardA: SweepReport = {
    schemaVersion: '2',
    files: {
      'src/utils/a.ts': {
        language: 'typescript',
        mutants: [{ id: '1', status: 'Killed', coveredBy: ['0', '1'], killedBy: ['1'] }],
      },
    },
    testFiles: {
      '__tests__/unit/a.test.ts': { tests: [test('0', 'a one', 3)] },
      '__tests__/unit/shared.test.ts': { tests: [test('1', 'shared', 5)] },
    },
  };
  const shardB: SweepReport = {
    schemaVersion: '2',
    files: {
      'src/utils/b.ts': {
        mutants: [
          { id: '1', status: 'Survived', coveredBy: ['0', '7'] },
          { id: '2', status: 'NoCoverage' },
        ],
      },
    },
    testFiles: {
      // The same test as shard A's "1", numbered 0 here.
      '__tests__/unit/shared.test.ts': { tests: [test('0', 'shared', 5)] },
      '__tests__/unit/b.test.ts': { tests: [test('1', 'b one', 3)] },
    },
  };

  it('keeps every file and numbers each test once across the shards', () => {
    const merged = mergeReports([shardA, shardB], relative);
    expect(merged.schemaVersion).toBe('2');
    expect(merged.testFiles).toEqual({
      '__tests__/unit/a.test.ts': { tests: [test('0', 'a one', 3)] },
      '__tests__/unit/shared.test.ts': { tests: [test('1', 'shared', 5)] },
      '__tests__/unit/b.test.ts': { tests: [test('2', 'b one', 3)] },
    });
    expect(merged.files?.['src/utils/a.ts']).toEqual({
      language: 'typescript',
      mutants: [{ id: '1', status: 'Killed', coveredBy: ['0', '1'], killedBy: ['1'] }],
    });
  });

  it("renumbers a mutant's tests, dropping one its shard doesn't list", () => {
    const [survived, noCoverage] = mergeReports([shardA, shardB], relative).files?.[
      'src/utils/b.ts'
    ]?.mutants ?? [undefined, undefined];
    expect(survived).toEqual({
      id: '1',
      status: 'Survived',
      coveredBy: ['1'],
      killedBy: undefined,
    });
    expect(noCoverage).toEqual({
      id: '2',
      status: 'NoCoverage',
      coveredBy: undefined,
      killedBy: undefined,
    });
  });

  it('tells apart tests of one name at different places', () => {
    const other: SweepReport = {
      testFiles: { '__tests__/unit/shared.test.ts': { tests: [test('0', 'shared', 9)] } },
    };
    const merged = mergeReports([shardA, other], relative);
    expect(merged.testFiles?.['__tests__/unit/shared.test.ts']?.tests).toEqual([
      test('1', 'shared', 5),
      test('2', 'shared', 9),
    ]);
  });

  it('stops on a file in two shards, whatever its path form', () => {
    const twice: SweepReport = { files: { [`${CWD}/src/utils/a.ts`]: { mutants: [] } } };
    expect(() => mergeReports([shardA, twice], relative)).toThrow(
      "src/utils/a.ts is in more than one shard's results",
    );
  });

  it('merges nothing into nothing', () => {
    expect(mergeReports([], relative)).toEqual({ files: {}, testFiles: {} });
  });
});

describe('sweepCounts', () => {
  it('counts each status and scores as Stryker does', () => {
    const report: SweepReport = {
      files: {
        'a.ts': {
          mutants: [
            { status: 'Killed' },
            { status: 'Killed' },
            { status: 'Timeout' },
            { status: 'Survived' },
            { status: 'Ignored' },
          ],
        },
        'b.ts': {
          mutants: [
            { status: 'NoCoverage' },
            { status: 'CompileError' },
            { status: 'RuntimeError' },
            {},
          ],
        },
        'c.ts': {},
      },
    };
    expect(sweepCounts(report)).toEqual({
      killed: 2,
      timeout: 1,
      survived: 1,
      noCoverage: 1,
      errors: 2,
      ignored: 1,
      score: 60,
    });
  });

  it('has no score with nothing valid', () => {
    expect(sweepCounts({ files: { 'a.ts': { mutants: [{ status: 'Ignored' }] } } }).score).toBe(
      null,
    );
    expect(sweepCounts({}).score).toBe(null);
  });
});

describe('mergeSummary', () => {
  const counts = {
    killed: 8,
    timeout: 1,
    survived: 1,
    noCoverage: 0,
    errors: 2,
    ignored: 3,
    score: 90,
  };

  it('shows the counts of a complete sweep', () => {
    expect(mergeSummary(8, 8, counts)).toBe(
      [
        '### Mutation sweep',
        '',
        'Shards reported: 8 of 8.',
        '',
        '| Score | Killed | Timeout | Survived | No coverage | Errors | Ignored |',
        '| --- | --- | --- | --- | --- | --- | --- |',
        '| 90.00% | 8 | 1 | 1 | 0 | 2 | 3 |',
        '',
      ].join('\n'),
    );
  });

  it("says an incomplete sweep leaves main's baseline alone", () => {
    const text = mergeSummary(7, 8, counts);
    expect(text).toContain('### Mutation sweep (incomplete)');
    expect(text).toContain('Shards reported: 7 of 8.');
    expect(text).toContain("main's baseline is left as it was");
  });

  it('says when nothing was tested', () => {
    const text = mergeSummary(8, 8, { ...counts, score: null });
    expect(text).toContain('| none |');
    expect(text).toContain('No mutant was tested.');
  });
});
