// The Jest test runner Stryker's mutant runs use (stryker.config.json,
// jest.config.runner; a plain `jest` run keeps Jest's own). It is Jest's
// default runner, loading only the test files that hold a test the run's
// testNamePattern names, so a mutant run skips the related test files that
// would run none of its covering tests. Jest loads this file as it is, as
// Node 24 strips the types, and the tests import all of it
// (__tests__/unit/strykerJestRunner.test.ts).
//
// Stryker's Jest runner tests a mutant by running Jest with
// --findRelatedTests on the mutated file and a testNamePattern naming the
// tests that cover the mutant. findRelatedTests picks every test file that
// imports the mutated file, however indirectly, and Jest loads each one
// (its environment, setup files and imports, about 0.12 s apiece) to find
// out which of its tests the pattern names, though most name none. In the
// October 19 sweep a mutant's run loaded 18.7 test files to run tests from
// 3.4 of them; loading the rest took about half of the sweep's time, and
// the waste grows with both the code mutated and the test files importing
// it, so the sweep's time doubled week on week.
//
// So the runner remembers which file each test is in from the run that
// names no pattern (Stryker's dry run, which runs every related test) and,
// for a run with a pattern, keeps only the files holding a test the pattern
// names, matched as Jest matches it. A file holding none of them would run
// nothing, so the outcome is the same; only the loading is skipped. When
// nothing is known, or the pattern names no known test, every file runs, as
// before.

import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import JestRunner, { type Test, type TestRunnerOptions, type TestWatcher } from 'jest-runner';

/** Each test's full name (describe blocks and title), to the files holding a test of that name. */
export type TestFileMap = Record<string, string[]>;

/** `map` with the tests of one file's run recorded. */
export function recordTests(
  map: TestFileMap,
  testPath: string,
  fullNames: readonly string[],
): TestFileMap {
  const next: TestFileMap = { ...map };
  for (const name of fullNames) {
    const files = next[name] ?? [];
    if (!files.includes(testPath)) next[name] = [...files, testPath];
  }
  return next;
}

/** The files holding a test whose full name `pattern` matches, as Jest matches it (case-insensitive). */
export function filesMatching(pattern: string, map: TestFileMap): Set<string> {
  const re = new RegExp(pattern, 'i');
  const files = new Set<string>();
  for (const [name, paths] of Object.entries(map)) {
    if (re.test(name)) for (const p of paths) files.add(p);
  }
  return files;
}

/**
 * The tests (test files) a run loads: with no pattern, or one that names no
 * test `map` knows, all of them; else those holding a named test.
 */
export function selectTests<T extends { path: string }>(
  tests: readonly T[],
  pattern: string | null | undefined,
  map: TestFileMap,
): T[] {
  if (!pattern) return [...tests];
  const files = filesMatching(pattern, map);
  if (files.size === 0) return [...tests];
  return tests.filter((test) => files.has(test.path));
}

/** The runner's reads and writes of the saved map: Node's, handed over. */
export interface MapFiles {
  read: (file: string) => string;
  write: (file: string, text: string) => void;
  rename: (from: string, to: string) => void;
}

/** The map one runner process works from (testFileMapStore). */
export interface TestFileMapStore {
  load: (file: string) => TestFileMap;
  save: (file: string, map: TestFileMap) => void;
}

/**
 * One map per runner process. `load` reads the saved copy the first time
 * it's needed and keeps it; one not saved yet counts as nothing known, and
 * is looked for again on the next load. `save` keeps `map` and writes it
 * to a file of this process's own (`pid`), renamed over the saved copy, so
 * another process never reads half of it.
 */
export function testFileMapStore(files: MapFiles, pid: number): TestFileMapStore {
  let known: TestFileMap | null = null;
  return {
    load(file) {
      if (known === null) {
        try {
          known = parseTestFileMap(files.read(file));
        } catch {
          return {}; // not saved (yet): run every file, and look again next time
        }
      }
      return known;
    },
    save(file, map) {
      known = map;
      const temp = `${file}.${pid}`;
      files.write(temp, JSON.stringify(map));
      files.rename(temp, file);
    },
  };
}

/**
 * One of the runner's runs. With a test name pattern (a mutant's run), it
 * runs only the files selectTests keeps, by the saved map. With none
 * (Stryker's dry run), it runs every file, records the tests of each file
 * that passed (`onFilePassed` subscribes `record` to Jest's runner, and
 * returns how to unsubscribe), and saves the map once the run is over, even
 * when it failed.
 */
export async function runCovering<T extends { path: string }, R>(input: {
  tests: T[];
  pattern: string | null | undefined;
  /** The saved map, in Stryker's sandbox. */
  file: string;
  store: TestFileMapStore;
  run: (tests: T[]) => Promise<R>;
  onFilePassed: (record: (testPath: string, fullNames: string[]) => void) => () => void;
}): Promise<R> {
  const { tests, pattern, file, store, run, onFilePassed } = input;
  if (pattern) return run(selectTests(tests, pattern, store.load(file)));
  let map = store.load(file);
  const unsubscribe = onFilePassed((testPath, fullNames) => {
    map = recordTests(map, testPath, fullNames);
  });
  try {
    return await run(tests);
  } finally {
    unsubscribe();
    store.save(file, map);
  }
}

/** A saved map read back: anything not of its shape counts as nothing known. */
export function parseTestFileMap(text: string): TestFileMap {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return {};
  }
  if (!isRecord(value)) return {};
  const map: TestFileMap = {};
  for (const [name, paths] of Object.entries(value)) {
    if (isStrings(paths)) map[name] = paths;
  }
  return map;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isStrings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

// Which file holds which test is learned from a run with no pattern
// (Stryker's dry run, in one of its test runner processes) and saved in the
// sandbox, where the other processes read it. Each Stryker run has a fresh
// sandbox, so nothing carries over between runs. Anything unknown runs
// every file, as Jest's own runner would.
const MAP_FILE = '.stryker-test-files.json';

// One map per process: the dry run's process builds it, the others read
// the saved copy the first time they need it.
const store = testFileMapStore(
  { read: (file) => readFileSync(file, 'utf8'), write: writeFileSync, rename: renameSync },
  process.pid,
);

export default class StrykerCoveringFilesRunner extends JestRunner {
  override runTests(
    tests: Test[],
    watcher: TestWatcher,
    options: TestRunnerOptions,
  ): Promise<void> {
    return runCovering({
      tests,
      pattern: this._globalConfig.testNamePattern,
      file: join(this._globalConfig.rootDir, MAP_FILE),
      store,
      run: (chosen) => super.runTests(chosen, watcher, options),
      onFilePassed: (record) =>
        this.on('test-file-success', ([test, result]) => {
          record(
            test.path,
            result.testResults.map((t) => t.fullName),
          );
        }),
    });
  }
}
