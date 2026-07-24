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

const THRESHOLD = 80;
const reportPath = join('reports', 'mutation', 'mutation.json');

const out = (line) => process.stdout.write(`${line}\n`);
const err = (line) => process.stderr.write(`${line}\n`);

if (!existsSync(reportPath)) {
  err(`Mutation report not found at ${reportPath} — did stryker run with the json reporter?`);
  process.exit(1);
}

const report = JSON.parse(readFileSync(reportPath, 'utf8'));
const files = report.files || {};
const rows = [];
const failures = [];

for (const [file, data] of Object.entries(files)) {
  const mutants = data.mutants || [];
  const killed = mutants.filter((m) => m.status === 'Killed').length;
  const timeout = mutants.filter((m) => m.status === 'Timeout').length;
  const survived = mutants.filter((m) => m.status === 'Survived').length;
  const noCoverage = mutants.filter((m) => m.status === 'NoCoverage').length;
  const detected = killed + timeout;
  const total = detected + survived + noCoverage;
  if (total === 0) continue; // nothing scorable (e.g. only compile-error mutants)
  const score = (detected / total) * 100;
  rows.push({ file, score });
  if (score < THRESHOLD) {
    failures.push({ file, score });
  }
}

rows.sort((a, b) => a.score - b.score);
for (const { file, score } of rows) {
  out(`  [${score < THRESHOLD ? 'FAIL' : 'ok'}] ${score.toFixed(2)}%  ${file}`);
}

if (failures.length > 0) {
  err(`\nMutation score below ${THRESHOLD}% for ${failures.length} file(s):`);
  for (const { file, score } of failures) {
    err(`  - ${file}: ${score.toFixed(2)}%`);
  }
  err('\nWrite tests that kill the surviving mutants (see the HTML report) to clear the bar.');
  process.exit(1);
}

out(`\nAll ${rows.length} mutated file(s) >= ${THRESHOLD}% mutation score.`);
