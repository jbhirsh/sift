// CLI for the "Native bridge" check: keeps modules/expo-musickit a thin
// bridge (CLAUDE.md). The rules live in nativeBridge.ts, typed and
// unit-tested; Node 22.18+ runs it directly. Runs in CI (Lint, Typecheck &
// Unit Test) and the pre-commit hook.
//
// ESM (.mjs) with explicit node: imports, like the other CLIs here, so it lints
// and runs without Node types in the app's tsconfig.
import { readdirSync, readFileSync } from 'node:fs';
import process from 'node:process';
import { URL } from 'node:url';
import { checkNativeBridge } from './nativeBridge.ts';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const iosDir = 'modules/expo-musickit/ios';
const swiftFiles = Object.fromEntries(
  readdirSync(new URL(`../${iosDir}`, import.meta.url))
    .filter((name) => name.endsWith('.swift'))
    .map((name) => [name, read(`${iosDir}/${name}`)]),
);

const problems = checkNativeBridge({
  swiftFiles,
  wrapper: read('modules/expo-musickit/src/index.ts'),
  allowlist: JSON.parse(read('modules/expo-musickit/native-api.json')),
});

if (problems.length === 0) {
  process.stdout.write('Native bridge: ok.\n');
} else {
  process.stdout.write(`Native bridge: ${problems.length} problem(s)\n`);
  for (const problem of problems) process.stdout.write(`  - ${problem}\n`);
  process.exitCode = 1;
}
