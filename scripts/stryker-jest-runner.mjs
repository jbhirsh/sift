// The Jest test runner Stryker's mutant runs use (stryker.config.json,
// jest.config.runner; a plain `jest` run keeps Jest's own). It is Jest's
// default runner, loading only the test files that hold a test the run's
// testNamePattern names, so a mutant run skips the related test files that
// would run none of its covering tests. Why, and the rules, are in
// strykerTestFiles.ts, typed and unit-tested; Node 22.18+ runs it directly.
//
// Which file holds which test is learned from a run with no pattern
// (Stryker's dry run, in one of its test runner processes) and saved in the
// sandbox, where the other processes read it. Each Stryker run has a fresh
// sandbox, so nothing carries over between runs. Anything unknown runs
// every file, as Jest's own runner would.
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import JestRunner from 'jest-runner';
import { parseTestFileMap, recordTests, selectTests } from './strykerTestFiles.ts';

const MAP_FILE = '.stryker-test-files.json';

// One map per process: the dry run's process builds it, the others read
// the saved copy the first time they need it.
let known = null;

function load(file) {
  if (known === null) {
    try {
      known = parseTestFileMap(readFileSync(file, 'utf8'));
    } catch {
      return {}; // not saved (yet): run every file, and look again next time
    }
  }
  return known;
}

function save(file, map) {
  known = map;
  const temp = `${file}.${process.pid}`;
  writeFileSync(temp, JSON.stringify(map));
  renameSync(temp, file);
}

export default class StrykerCoveringFilesRunner extends JestRunner {
  async runTests(tests, watcher, options) {
    const file = join(this._globalConfig.rootDir, MAP_FILE);
    const pattern = this._globalConfig.testNamePattern;
    if (pattern) {
      return super.runTests(selectTests(tests, pattern, load(file)), watcher, options);
    }
    let map = load(file);
    const unsubscribe = this.on('test-file-success', ([test, result]) => {
      map = recordTests(
        map,
        test.path,
        result.testResults.map((t) => t.fullName),
      );
    });
    try {
      return await super.runTests(tests, watcher, options);
    } finally {
      unsubscribe();
      save(file, map);
    }
  }
}
