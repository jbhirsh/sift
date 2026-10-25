// Per-file mutation-score gate.
//
// Stryker's own `thresholds.break` is a single GLOBAL floor (the aggregate
// score across all mutated files). The project requires every mutated file to
// clear the bar on its own, so this script reads the JSON report and fails if
// any individual file is below THRESHOLD.
//
// Run after `stryker run` (which must emit the json reporter to
// reports/mutation/mutation.json — see stryker.config.json). Used by the
// mutation.yml workflow on both the PR-scoped run and the weekly full sweep.
// On a PR, MUTATE_SCOPE holds the run's --mutate entries, and only the files
// and lines they name are scored: a file's score is then its changed lines'
// alone, and the results Stryker's incremental mode carries over from the
// baseline don't count. A file with nothing scorable there has no score and
// passes. The rules live in mutationScope.ts, typed and unit-tested.
//
// MockMusicProvider.ts is excluded from the mutate scope in
// stryker.config.json — it is fixture-heavy dev scaffolding whose surviving
// mutants are seed-data strings, so an 80% bar there would only force circular
// assertions on the mock's own fixture. So it never appears in this report.
//
// ESM (.mjs) with explicit node: imports and process streams so it lints
// clean under the RN/TS flat config without any require() or ambient globals.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { failures, fileScores, parseScope } from './mutationScope.ts';

const THRESHOLD = 80;
const reportPath = join('reports', 'mutation', 'mutation.json');

const out = (line) => process.stdout.write(`${line}\n`);
const err = (line) => process.stderr.write(`${line}\n`);

if (!existsSync(reportPath)) {
  err(`Mutation report not found at ${reportPath} — did stryker run with the json reporter?`);
  process.exit(1);
}

const report = JSON.parse(readFileSync(reportPath, 'utf8'));
const cwd = process.cwd();
const scope = process.env.MUTATE_SCOPE ? parseScope(process.env.MUTATE_SCOPE, cwd) : null;
const scores = fileScores(report, scope, cwd);
const failed = failures(scores, THRESHOLD);
const where = scope ? 'in its changed lines ' : '';

for (const { file, score } of scores) {
  if (score === null) out(`  [none] nothing scorable ${where}— ${file}`);
  else out(`  [${score < THRESHOLD ? 'FAIL' : 'ok'}] ${score.toFixed(2)}%  ${file}`);
}

if (failed.length > 0) {
  err(`\nMutation score below ${THRESHOLD}% for ${failed.length} file(s):`);
  for (const { file, score } of failed) {
    err(`  - ${file}: ${score.toFixed(2)}%`);
  }
  err('\nWrite tests that kill the surviving mutants (see the HTML report) to clear the bar.');
  process.exit(1);
}

const scored = scores.filter(({ score }) => score !== null).length;
out(`\nAll ${scored} scored file(s) >= ${THRESHOLD}% mutation score.`);
