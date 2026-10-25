// Which test files Jest loads for one Stryker mutant run. The Jest runner
// in scripts/stryker-jest-runner.mjs applies these rules; Stryker uses it in
// place of Jest's own (stryker.config.json, jest.config.runner), so a plain
// `jest` run never sees them. Typed and unit-tested
// (__tests__/unit/strykerTestFiles.test.ts); this file imports nothing from
// Node, so it typechecks under the app's tsconfig.
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
