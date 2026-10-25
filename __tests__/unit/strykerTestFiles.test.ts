import {
  filesMatching,
  parseTestFileMap,
  recordTests,
  selectTests,
  type TestFileMap,
} from '../../scripts/strykerTestFiles';

const A = '/sandbox/__tests__/unit/a.test.ts';
const B = '/sandbox/__tests__/unit/b.test.tsx';
const C = '/sandbox/__tests__/unit/c.test.ts';

const MAP: TestFileMap = {
  'sorting sorts by title': [A],
  'sorting sorts by plays': [A],
  'SiftScreen Finish shows Done': [B],
  'shared name': [A, C],
};

/** Stryker's testNamePattern for these full names (escaped, each in parentheses). */
const patternFor = (...names: string[]) =>
  names.map((n) => `(${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`).join('|');

describe('recordTests', () => {
  it('maps each full name to the file it ran in', () => {
    expect(recordTests({}, A, ['x one', 'x two'])).toEqual({ 'x one': [A], 'x two': [A] });
  });

  it('keeps every file a name is found in, once each', () => {
    const once = recordTests({}, A, ['same']);
    expect(recordTests(recordTests(once, B, ['same']), A, ['same'])).toEqual({ same: [A, B] });
  });

  it("leaves the map it's given alone", () => {
    const map: TestFileMap = { kept: [A] };
    recordTests(map, B, ['kept', 'new']);
    expect(map).toEqual({ kept: [A] });
  });
});

describe('filesMatching', () => {
  it("finds the files holding the pattern's tests", () => {
    expect(filesMatching(patternFor('SiftScreen Finish shows Done'), MAP)).toEqual(new Set([B]));
  });

  it('collects the files of every alternative', () => {
    expect(
      filesMatching(patternFor('sorting sorts by plays', 'SiftScreen Finish shows Done'), MAP),
    ).toEqual(new Set([A, B]));
  });

  it('includes every file holding a test of that name', () => {
    expect(filesMatching(patternFor('shared name'), MAP)).toEqual(new Set([A, C]));
  });

  it('matches as Jest does: anywhere in the name, ignoring case', () => {
    expect(filesMatching('finish SHOWS', MAP)).toEqual(new Set([B]));
  });

  it('finds nothing for a name it has never seen', () => {
    expect(filesMatching(patternFor('no such test'), MAP).size).toBe(0);
  });
});

describe('selectTests', () => {
  const tests = [{ path: A }, { path: B }, { path: C }];

  it('runs every file when there is no pattern (the dry run)', () => {
    expect(selectTests(tests, undefined, MAP)).toEqual(tests);
    expect(selectTests(tests, null, MAP)).toEqual(tests);
    expect(selectTests(tests, '', MAP)).toEqual(tests);
  });

  it('keeps only the files holding a named test', () => {
    expect(selectTests(tests, patternFor('sorting sorts by title'), MAP)).toEqual([{ path: A }]);
  });

  it('never adds a file Jest did not pick', () => {
    expect(
      selectTests([{ path: B }], patternFor('sorting sorts by title', 'shared name'), MAP),
    ).toEqual([]);
  });

  it('runs every file when the pattern names no known test', () => {
    expect(selectTests(tests, patternFor('a test added since'), MAP)).toEqual(tests);
  });

  it('runs every file when nothing is known', () => {
    expect(selectTests(tests, patternFor('sorting sorts by title'), {})).toEqual(tests);
  });

  it('returns a new array', () => {
    expect(selectTests(tests, undefined, MAP)).not.toBe(tests);
  });
});

describe('parseTestFileMap', () => {
  it('reads back what was saved', () => {
    expect(parseTestFileMap(JSON.stringify(MAP))).toEqual(MAP);
  });

  it.each(['', 'not json', 'null', '[]', '"text"', '3'])('reads %j as nothing known', (text) => {
    expect(parseTestFileMap(text)).toEqual({});
  });

  it('drops entries not of its shape', () => {
    const text = JSON.stringify({ good: [A], number: 3, mixed: [A, 4], object: { a: A } });
    expect(parseTestFileMap(text)).toEqual({ good: [A] });
  });
});
