// CLI for the monthly mutation sweep's shards (.github/workflows/
// mutation.yml). Why the sweep is split, and the rules for splitting and
// merging, are in mutationSweep.ts, typed and unit-tested; Node 22.18+ runs
// it directly.
//
// Usage:
//   node scripts/mutation-sweep.mjs plan <count> [results]
//     Splits the files stryker.config.json's mutate globs take among the
//     tracked ones into <count> shards, weighed by [results] (main's last
//     reports/stryker-incremental.json) when it can be read, else by line
//     count. Prints the split; in Actions also writes `matrix` (one entry
//     per shard, its files comma-joined as `mutate`) and `count` to
//     $GITHUB_OUTPUT, and the table to $GITHUB_STEP_SUMMARY.
//   node scripts/mutation-sweep.mjs config <out>
//     Writes stryker.config.json to <out> with no break threshold.
//   node scripts/mutation-sweep.mjs merge <dir> <count> <out>
//     Merges the shards' results (one directory per shard in <dir>, each
//     with its stryker-incremental.json) into <out>, written only when all
//     <count> reported. Prints the counts; in Actions writes
//     `complete=true|false` to $GITHUB_OUTPUT and the summary to
//     $GITHUB_STEP_SUMMARY. Exits 1 when a shard is missing or nothing was
//     tested. The per-file gate (check-mutation-threshold.mjs) then judges
//     <out>.
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { isMutable, relativeName } from './mutationScope.ts';
import {
  fileWeights,
  mergeReports,
  mergeSummary,
  reportWeights,
  shardConfig,
  shardMatrix,
  shardTable,
  splitShards,
  sweepCounts,
} from './mutationSweep.ts';

const cwd = process.cwd();
const relative = (file) => relativeName(file, cwd);
const out = (line) => process.stdout.write(`${line}\n`);
const err = (line) => process.stderr.write(`${line}\n`);
const read = (file) => {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
};
const readJson = (file) => {
  try {
    return JSON.parse(read(file) ?? '');
  } catch {
    return null;
  }
};
const write = (file, text) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
};
const output = (text) => {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, text);
};
const summary = (text) => {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
};
const count = (text) => {
  const n = Number(text);
  return Number.isInteger(n) && n > 0 ? n : null;
};
const usage = () => {
  err(
    'Usage: mutation-sweep.mjs plan <count> [results] | config <out> | merge <dir> <count> <out>',
  );
  return 2;
};

function plan(shardCount, resultsFile) {
  const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0');
  const files = tracked.filter(isMutable).sort();
  const results = resultsFile ? readJson(resultsFile) : null;
  const known =
    results && typeof results === 'object' ? reportWeights(results, relative) : new Map();
  const lines = (file) => (read(file) ?? '').split('\n').length;
  const shards = splitShards(fileWeights(files, lines, known), shardCount);
  const table = shardTable(shards, known.size > 0);
  out(table);
  for (const [i, { files: own }] of shards.entries()) out(`Shard ${i + 1}: ${own.join(', ')}`);
  output(`matrix=${JSON.stringify(shardMatrix(shards))}\ncount=${shards.length}\n`);
  summary(`### Mutation sweep shards\n\n${table}\n`);
  return 0;
}

function merge(dir, expected, outFile) {
  let shards = [];
  try {
    shards = readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    // No shard reported: counted below.
  }
  const reports = [];
  for (const shard of shards) {
    const report = readJson(join(dir, shard, 'stryker-incremental.json'));
    if (report && typeof report === 'object') reports.push(report);
    else err(`No readable results from ${shard}.`);
  }
  const merged = mergeReports(reports, relative);
  const counts = sweepCounts(merged);
  const complete = reports.length === expected;
  if (complete) write(outFile, JSON.stringify(merged));
  const text = mergeSummary(reports.length, expected, counts);
  out(text);
  output(`complete=${complete}\n`);
  summary(text);
  return complete && counts.score !== null ? 0 : 1;
}

function main([command, ...args]) {
  if (command === 'plan' && count(args[0]) !== null) return plan(count(args[0]), args[1]);
  if (command === 'config' && args[0]) {
    const config = readJson('stryker.config.json');
    write(args[0], `${JSON.stringify(shardConfig(config), null, 2)}\n`);
    return 0;
  }
  if (command === 'merge' && args[0] && count(args[1]) !== null && args[2]) {
    return merge(args[0], count(args[1]), args[2]);
  }
  return usage();
}

process.exitCode = main(process.argv.slice(2));
