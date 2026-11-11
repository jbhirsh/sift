import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import JestRunner from 'jest-runner';
import StrykerCoveringFilesRunner, {
  filesMatching,
  parseTestFileMap,
  recordTests,
  runCovering,
  selectTests,
  testFileMapStore,
  type MapFiles,
  type TestFileMap,
} from '../../scripts/stryker-jest-runner';

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

/** A folder in memory, with what was asked of it. */
function memoryFiles(start: Record<string, string> = {}) {
  const disk = new Map(Object.entries(start));
  const files = {
    read: jest.fn((file: string) => {
      const text = disk.get(file);
      if (text === undefined) throw new Error(`ENOENT: ${file}`);
      return text;
    }),
    write: jest.fn((file: string, text: string) => {
      disk.set(file, text);
    }),
    rename: jest.fn((from: string, to: string) => {
      disk.set(to, disk.get(from) ?? '');
      disk.delete(from);
    }),
  } satisfies MapFiles;
  return { disk, files };
}

const SAVED = '/sandbox/.stryker-test-files.json';

describe('testFileMapStore', () => {
  it('reads the saved map once and keeps it', () => {
    const { files } = memoryFiles({ [SAVED]: JSON.stringify(MAP) });
    const store = testFileMapStore(files, 7);
    expect(store.load(SAVED)).toEqual(MAP);
    expect(store.load(SAVED)).toEqual(MAP);
    expect(files.read).toHaveBeenCalledTimes(1);
  });

  it('knows nothing until the map is saved, and looks again each time', () => {
    const { disk, files } = memoryFiles();
    const store = testFileMapStore(files, 7);
    expect(store.load(SAVED)).toEqual({});
    disk.set(SAVED, JSON.stringify(MAP));
    expect(store.load(SAVED)).toEqual(MAP);
    expect(files.read).toHaveBeenCalledTimes(2);
  });

  it('saves through a file of its own process, renamed over the saved copy, and keeps the map', () => {
    const { disk, files } = memoryFiles();
    const store = testFileMapStore(files, 4242);
    store.save(SAVED, MAP);
    expect(files.write).toHaveBeenCalledWith(`${SAVED}.4242`, JSON.stringify(MAP));
    expect(files.rename).toHaveBeenCalledWith(`${SAVED}.4242`, SAVED);
    expect(Object.fromEntries(disk)).toEqual({ [SAVED]: JSON.stringify(MAP) });
    expect(store.load(SAVED)).toBe(MAP);
    expect(files.read).not.toHaveBeenCalled();
  });
});

describe('runCovering', () => {
  const tests = [{ path: A }, { path: B }, { path: C }];

  /** A Jest runner run: the files it got, and its subscription to passed files. */
  function jestRun(passed: [string, string[]][] = []) {
    let listener: ((testPath: string, fullNames: string[]) => void) | null = null;
    const unsubscribe = jest.fn(() => {
      listener = null;
    });
    const run = jest.fn(async (chosen: { path: string }[]) => {
      for (const [path, names] of passed) listener?.(path, names);
      return chosen.map((t) => t.path);
    });
    const onFilePassed = jest.fn((record: (testPath: string, fullNames: string[]) => void) => {
      listener = record;
      return unsubscribe;
    });
    return { run, onFilePassed, unsubscribe };
  }

  it('runs only the files holding a test the pattern names, saving nothing', async () => {
    const { files } = memoryFiles({ [SAVED]: JSON.stringify(MAP) });
    const store = testFileMapStore(files, 1);
    const { run, onFilePassed } = jestRun();
    const ran = await runCovering({
      tests,
      pattern: patternFor('SiftScreen Finish shows Done'),
      file: SAVED,
      store,
      run,
      onFilePassed,
    });
    expect(ran).toEqual([B]);
    expect(onFilePassed).not.toHaveBeenCalled();
    expect(files.write).not.toHaveBeenCalled();
  });

  it('with a pattern and nothing saved, runs every file', async () => {
    const { files } = memoryFiles();
    const { run, onFilePassed } = jestRun();
    const ran = await runCovering({
      tests,
      pattern: patternFor('sorting sorts by title'),
      file: SAVED,
      store: testFileMapStore(files, 1),
      run,
      onFilePassed,
    });
    expect(ran).toEqual([A, B, C]);
  });

  it('with no pattern, runs every file and saves which tests each passed file held', async () => {
    const { disk, files } = memoryFiles();
    const store = testFileMapStore(files, 1);
    const { run, onFilePassed, unsubscribe } = jestRun([
      [A, ['sorting sorts by title', 'shared name']],
      [C, ['shared name']],
    ]);
    const ran = await runCovering({ tests, pattern: '', file: SAVED, store, run, onFilePassed });
    expect(ran).toEqual([A, B, C]);
    expect(run).toHaveBeenCalledWith(tests);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(parseTestFileMap(disk.get(SAVED) ?? '')).toEqual({
      'sorting sorts by title': [A],
      'shared name': [A, C],
    });
  });

  it('adds to what it already knew, and saves even when the run fails', async () => {
    const { disk, files } = memoryFiles({ [SAVED]: JSON.stringify({ 'old test': [B] }) });
    const store = testFileMapStore(files, 1);
    const { onFilePassed, unsubscribe } = jestRun();
    const run = jest.fn(async () => {
      throw new Error('worker crashed');
    });
    onFilePassed.mockImplementation((record) => {
      record(A, ['new test']);
      return unsubscribe;
    });
    await expect(
      runCovering({ tests, pattern: undefined, file: SAVED, store, run, onFilePassed }),
    ).rejects.toThrow('worker crashed');
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(parseTestFileMap(disk.get(SAVED) ?? '')).toEqual({ 'old test': [B], 'new test': [A] });
  });
});

describe('StrykerCoveringFilesRunner', () => {
  type Listener = (event: [{ path: string }, { testResults: { fullName: string }[] }]) => void;
  let rootDir: string;
  let ran: string[][];
  let passed: Listener | undefined;

  beforeEach(() => {
    rootDir = mkdtempSync(join(tmpdir(), 'stryker-runner-'));
    ran = [];
    passed = undefined;
    jest.spyOn(JestRunner.prototype, 'on').mockImplementation((_name, listener) => {
      passed = listener as unknown as Listener;
      return () => {
        passed = undefined;
      };
    });
    jest.spyOn(JestRunner.prototype, 'runTests').mockImplementation((tests) => {
      ran.push(tests.map((t) => t.path));
      passed?.([{ path: A }, { testResults: [{ fullName: 'sorting sorts by title' }] }]);
      return Promise.resolve();
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    rmSync(rootDir, { recursive: true, force: true });
  });

  const runner = (testNamePattern?: string) =>
    new StrykerCoveringFilesRunner(
      { rootDir, testNamePattern } as ConstructorParameters<typeof JestRunner>[0],
      {} as ConstructorParameters<typeof JestRunner>[1],
    );
  const tests = [A, B].map((path) => ({ path })) as Parameters<JestRunner['runTests']>[0];
  const run = (testNamePattern?: string) =>
    runner(testNamePattern).runTests(
      tests,
      {} as Parameters<JestRunner['runTests']>[1],
      {} as Parameters<JestRunner['runTests']>[2],
    );

  it("runs every file in the dry run and saves which file held each test in the run's root", async () => {
    await run();
    expect(ran).toEqual([[A, B]]);
    expect(JSON.parse(readFileSync(join(rootDir, '.stryker-test-files.json'), 'utf8'))).toEqual({
      'sorting sorts by title': [A],
    });
  });

  it("then runs only the files holding a test a mutant's pattern names", async () => {
    await run();
    await run(patternFor('sorting sorts by title'));
    expect(ran).toEqual([[A, B], [A]]);
  });
});
