import {
  addedRanges,
  failures,
  fileScores,
  inRanges,
  isMutable,
  mutateEntries,
  parseScope,
  relativeName,
  score,
  scopeEntries,
  type LineRange,
  type MutationReport,
  type ReportMutant,
} from '../../scripts/mutationScope';

// The app's tsconfig loads no Node types, so type the one fs call used here.
const { readFileSync } = jest.requireActual<{
  readFileSync: (path: string, encoding: 'utf8') => string;
}>('fs');

const CWD = '/home/runner/work/sift/sift';

/** A mutant spanning lines `start` to `end`, with `status`. */
const at = (start: number, end: number, status = 'Killed'): ReportMutant => ({
  status,
  location: { start: { line: start }, end: { line: end } },
});

describe('isMutable', () => {
  it("pins stryker.config.json's mutate globs, which isMutable mirrors", () => {
    const config: unknown = JSON.parse(readFileSync('stryker.config.json', 'utf8'));
    expect(config).toMatchObject({
      mutate: [
        'src/context/**/*.{ts,tsx}',
        'src/services/**/*.ts',
        'src/utils/**/*.ts',
        'src/hooks/**/*.ts',
        '!src/**/index.ts',
        '!src/services/MusicProviderInterface.ts',
        '!src/utils/mockData.ts',
        '!src/services/MockMusicProvider.ts',
      ],
    });
  });

  it("takes the context's .ts and .tsx and the services', utils' and hooks' .ts", () => {
    expect(
      [
        'src/context/SiftContext.tsx',
        'src/context/resumeSession.ts',
        'src/services/SessionStore.ts',
        'src/utils/sorting.ts',
        'src/hooks/usePendingDecision.ts',
        'src/utils/nested/deep.ts',
      ].filter(isMutable),
    ).toHaveLength(6);
  });

  it('leaves out barrels, the interface, the mocks, other folders and .tsx outside context', () => {
    expect(
      [
        'src/utils/index.ts',
        'src/services/MusicProviderInterface.ts',
        'src/utils/mockData.ts',
        'src/services/MockMusicProvider.ts',
        'src/components/Button.tsx',
        'src/screens/SiftScreen.tsx',
        'src/hooks/useThing.tsx',
        'src/utils/sorting.js',
        '__tests__/unit/sorting.test.ts',
        'scripts/mutationScope.ts',
        'xsrc/utils/sorting.ts',
      ].filter(isMutable),
    ).toEqual([]);
  });
});

describe('addedRanges', () => {
  it('reads the new side of each hunk, a missing count meaning one line', () => {
    const diff = [
      'diff --git a/x.ts b/x.ts',
      '--- a/x.ts',
      '+++ b/x.ts',
      '@@ -3 +3 @@',
      '-a',
      '+b',
      '@@ -10,0 +11,4 @@ function f() {',
      '+c',
      '+d',
      '+e',
      '+f',
      '@@ -20,2 +25,3 @@',
      '-g',
      '-h',
      '+i',
      '+j',
      '+k',
    ].join('\n');
    expect(addedRanges(diff)).toEqual([
      [3, 3],
      [11, 14],
      [25, 27],
    ]);
  });

  it('adds nothing for a hunk that only deletes', () => {
    expect(addedRanges('@@ -5,2 +4,0 @@\n-a\n-b\n')).toEqual([]);
  });

  it('adds nothing for no diff', () => {
    expect(addedRanges('')).toEqual([]);
  });

  it('ignores an added line that looks like a hunk header', () => {
    expect(addedRanges('@@ -1 +1 @@\n-a\n+@@ -1 +9,9 @@\n')).toEqual([[1, 1]]);
  });
});

describe('mutateEntries', () => {
  it('names a new file whole', () => {
    expect(mutateEntries('src/a.ts', null)).toEqual(['src/a.ts']);
  });

  it('names each changed block of an edited file', () => {
    expect(
      mutateEntries('src/a.ts', [
        [3, 3],
        [11, 14],
      ]),
    ).toEqual(['src/a.ts:3-3', 'src/a.ts:11-14']);
  });

  it('names nothing when the file only lost lines', () => {
    expect(mutateEntries('src/a.ts', [])).toEqual([]);
  });
});

describe('scopeEntries', () => {
  it('narrows the mutable files to their changed lines, a new one whole', () => {
    const ranges: Record<string, LineRange[] | null> = {
      'src/utils/sorting.ts': [
        [4, 9],
        [20, 20],
      ],
      'src/utils/brandNew.ts': null,
      'src/hooks/useOnlyDeleted.ts': [],
    };
    const asked: string[] = [];
    const entries = scopeEntries(
      [
        'src/utils/sorting.ts',
        'src/components/Button.tsx',
        'src/utils/brandNew.ts',
        'src/hooks/useOnlyDeleted.ts',
      ],
      (file) => {
        asked.push(file);
        return ranges[file] ?? null;
      },
    );
    expect(entries).toEqual([
      'src/utils/sorting.ts:4-9',
      'src/utils/sorting.ts:20-20',
      'src/utils/brandNew.ts',
    ]);
    // Only the mutable files are diffed.
    expect(asked).toEqual([
      'src/utils/sorting.ts',
      'src/utils/brandNew.ts',
      'src/hooks/useOnlyDeleted.ts',
    ]);
  });

  it('is empty when nothing mutable changed', () => {
    expect(scopeEntries(['README.md'], () => null)).toEqual([]);
  });
});

describe('relativeName', () => {
  it("strips the working directory, a leading ./ and Windows' separators", () => {
    expect(relativeName(`${CWD}/src/a.ts`, CWD)).toBe('src/a.ts');
    expect(relativeName(`${CWD}/src/a.ts`, `${CWD}/`)).toBe('src/a.ts');
    expect(relativeName('./src/a.ts', CWD)).toBe('src/a.ts');
    expect(relativeName('src\\utils\\a.ts', CWD)).toBe('src/utils/a.ts');
    expect(relativeName('C:\\repo\\src\\a.ts', 'C:\\repo')).toBe('src/a.ts');
  });

  it('leaves a path outside the working directory as it is', () => {
    expect(relativeName('/elsewhere/src/a.ts', CWD)).toBe('/elsewhere/src/a.ts');
    expect(relativeName(`${CWD}-other/src/a.ts`, CWD)).toBe(`${CWD}-other/src/a.ts`);
  });
});

describe('parseScope', () => {
  it("collects each file's ranges, a file named whole staying whole", () => {
    const scope = parseScope(
      'src/a.ts:1-2,src/a.ts:7-7,src/b.ts,src/b.ts:3-4,src/c.ts:5-6,src/c.ts',
      CWD,
    );
    expect(scope.get('src/a.ts')).toEqual([
      [1, 2],
      [7, 7],
    ]);
    expect(scope.get('src/b.ts')).toBeNull();
    expect(scope.get('src/c.ts')).toBeNull();
    expect([...scope.keys()]).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts']);
  });

  it('skips empty entries and spaces, and names files relative to the working directory', () => {
    const scope = parseScope(` ${CWD}/src/a.ts:3-4 ,,src/b.ts, `, CWD);
    expect([...scope.entries()]).toEqual([
      ['src/a.ts', [[3, 4]]],
      ['src/b.ts', null],
    ]);
  });

  it('is empty for an empty scope', () => {
    expect(parseScope('', CWD).size).toBe(0);
  });
});

describe('inRanges', () => {
  const ranges: LineRange[] = [
    [4, 6],
    [10, 10],
  ];

  it('takes a mutant that starts and ends inside one range', () => {
    expect(inRanges(at(4, 4), ranges)).toBe(true);
    expect(inRanges(at(4, 6), ranges)).toBe(true);
    expect(inRanges(at(6, 6), ranges)).toBe(true);
    expect(inRanges(at(10, 10), ranges)).toBe(true);
  });

  it('refuses one outside, or reaching past a range, as Stryker does', () => {
    expect(inRanges(at(3, 3), ranges)).toBe(false);
    expect(inRanges(at(7, 7), ranges)).toBe(false);
    expect(inRanges(at(11, 11), ranges)).toBe(false);
    expect(inRanges(at(3, 4), ranges)).toBe(false);
    expect(inRanges(at(6, 7), ranges)).toBe(false);
    // Across both ranges, inside neither.
    expect(inRanges(at(5, 10), ranges)).toBe(false);
  });

  it('refuses a mutant with no location', () => {
    expect(inRanges({ status: 'Killed' }, ranges)).toBe(false);
    expect(inRanges({ location: { start: { line: 4 } } }, ranges)).toBe(false);
    expect(inRanges({ location: { end: { line: 4 } } }, ranges)).toBe(false);
  });
});

describe('score', () => {
  it('counts killed and timed-out mutants as detected, survived and uncovered ones not', () => {
    expect(
      score([
        at(1, 1, 'Killed'),
        at(1, 1, 'Timeout'),
        at(1, 1, 'Survived'),
        at(1, 1, 'NoCoverage'),
        at(1, 1, 'CompileError'),
        at(1, 1, 'RuntimeError'),
        at(1, 1, 'Ignored'),
      ]),
    ).toBe(50);
  });

  it('is null when nothing is scorable', () => {
    expect(score([])).toBeNull();
    expect(score([at(1, 1, 'CompileError'), at(1, 1, 'Ignored')])).toBeNull();
  });

  it('is 0 when every scorable mutant got through', () => {
    expect(score([at(1, 1, 'NoCoverage'), at(2, 2, 'Survived')])).toBe(0);
  });
});

describe('fileScores', () => {
  const report: MutationReport = {
    files: {
      'src/utils/a.ts': {
        mutants: [
          at(2, 2, 'Survived'),
          at(5, 5, 'Killed'),
          at(5, 6, 'Killed'),
          at(9, 9, 'Survived'),
          at(9, 12, 'Survived'),
        ],
      },
      [`${CWD}/src/utils/b.ts`]: { mutants: [at(1, 1, 'Killed'), at(2, 2, 'Survived')] },
      'src/utils/carried.ts': { mutants: [at(1, 1, 'Survived')] },
      'src/utils/typesOnly.ts': { mutants: [at(30, 30, 'Survived')] },
      'src/utils/empty.ts': {},
    },
  };

  it('scores every file whole without a scope (the weekly sweep), lowest first', () => {
    expect(fileScores(report, null, CWD)).toEqual([
      { file: 'src/utils/carried.ts', score: 0 },
      { file: 'src/utils/typesOnly.ts', score: 0 },
      { file: 'src/utils/a.ts', score: 40 },
      { file: 'src/utils/b.ts', score: 50 },
      { file: 'src/utils/empty.ts', score: null },
    ]);
  });

  it("scores only the scope's files, each on its named lines", () => {
    const scope = parseScope(
      'src/utils/a.ts:4-6,src/utils/a.ts:9-9,src/utils/b.ts,src/utils/typesOnly.ts:1-3',
      CWD,
    );
    expect(fileScores(report, scope, CWD)).toEqual([
      // Lines 5, 5-6 killed and 9 survived; 2 and 9-12 aren't its changed lines.
      { file: 'src/utils/b.ts', score: 50 },
      { file: 'src/utils/a.ts', score: (2 / 3) * 100 },
      // Its changed lines hold no mutant: no score, not a failure.
      { file: 'src/utils/typesOnly.ts', score: null },
    ]);
  });

  it('copes with a report that has no files', () => {
    expect(fileScores({}, null, CWD)).toEqual([]);
    expect(fileScores({}, parseScope('src/a.ts', CWD), CWD)).toEqual([]);
  });
});

describe('failures', () => {
  it('fails only the scored files below the threshold', () => {
    expect(
      failures(
        [
          { file: 'low.ts', score: 79.99 },
          { file: 'edge.ts', score: 80 },
          { file: 'high.ts', score: 100 },
          { file: 'none.ts', score: null },
        ],
        80,
      ),
    ).toEqual([{ file: 'low.ts', score: 79.99 }]);
  });
});
