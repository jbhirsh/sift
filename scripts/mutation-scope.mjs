// CLI for the PR mutation run's scope (.github/workflows/mutation.yml).
// Prints the `--mutate` entries for what the branch changed against the base
// ref given as the argument, one per line (nothing when no mutable code
// changed): a file the merge base has narrowed to the blocks of lines the
// branch adds or changes (`file:first-last`), a file new to the branch whole.
// The rules live in mutationScope.ts, typed and unit-tested; Node 22.18+
// runs it directly.
//
// Usage: node scripts/mutation-scope.mjs origin/main
import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { addedRanges, scopeEntries } from './mutationScope.ts';

const base = process.argv[2];
if (!base) {
  process.stderr.write('Usage: node scripts/mutation-scope.mjs <base ref>\n');
  process.exit(2);
}

// stderr piped, not shown: a missing file's `cat-file -e` is an answer.
const git = (args) =>
  execFileSync('git', args, {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
const mergeBase = git(['merge-base', base, 'HEAD']).trim();

// -z: names unquoted, whatever they hold. --diff-filter=d drops deletions,
// since a removed file must not be passed to --mutate.
const changed = git(['diff', '--name-only', '-z', '--diff-filter=d', mergeBase, 'HEAD'])
  .split('\0')
  .filter(Boolean);

const rangesOf = (file) => {
  try {
    git(['cat-file', '-e', `${mergeBase}:${file}`]);
  } catch {
    return null; // new to the branch: mutated whole
  }
  return addedRanges(
    git(['diff', '-U0', '--no-ext-diff', '--no-color', mergeBase, 'HEAD', '--', file]),
  );
};

const entries = scopeEntries(changed, rangesOf);
if (entries.length > 0) process.stdout.write(`${entries.join('\n')}\n`);
