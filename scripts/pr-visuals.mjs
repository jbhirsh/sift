// CLI for the "PR visuals" check (.github/workflows/pr-visuals.yml). Reads the
// PR's changed files from stdin (one path per line) and its description from
// PR_BODY, and fails when a UI change shows no picture. The rules live in
// prVisuals.ts, typed and unit-tested; Node 22.18+ runs it directly.
//
// ESM (.mjs) with explicit node: imports, like check-mutation-threshold.mjs,
// so it lints and runs without Node types in the app's tsconfig.
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { checkPrVisuals, failureMessage } from './prVisuals.ts';

const files = readFileSync(0, 'utf8')
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean);
const result = checkPrVisuals({ files, body: process.env.PR_BODY });
if (result.ok) {
  process.stdout.write(`PR visuals: ok (${result.reason}).\n`);
} else {
  process.stdout.write(`${failureMessage(result.ui)}\n`);
  process.exitCode = 1;
}
