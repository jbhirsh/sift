// CLI for Claude Review's coverage check (.github/workflows/claude-review.yml).
// Reads the PR's changed files from stdin (one path per line) and the
// review's tool calls from the execution files named as arguments (the
// first pass's and, after a follow-up, its own), and prints each changed
// file no pass read, one per line. The rules live in reviewCoverage.ts,
// typed and unit-tested; Node 22.18+ runs it directly. A missing or
// unreadable execution file counts as a review that read nothing.
import process from 'node:process';
import { readFileSync } from 'node:fs';
import { toolCalls, unreadFiles } from './reviewCoverage.ts';

let input = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) input += chunk;

const changed = input
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean);
const calls = process.argv.slice(2).flatMap((path) => {
  try {
    return toolCalls(JSON.parse(readFileSync(path, 'utf8')));
  } catch {
    process.stderr.write(`Could not read the execution file ${path}.\n`);
    return [];
  }
});
const unread = unreadFiles(changed, calls, process.env.REPO_DIR ?? process.cwd());
if (unread.length > 0) process.stdout.write(`${unread.join('\n')}\n`);
