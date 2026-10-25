// Rules for the monthly mutation sweep's shards (.github/workflows/
// mutation.yml; scripts/mutation-sweep.mjs is the command line). Typed and
// unit-tested (__tests__/unit/mutationSweep.test.ts); this file imports
// nothing from Node, so it typechecks under the app's tsconfig.
//
// The sweep mutates every in-scope file, and as one job it outgrew the
// job's limit: 20 minutes in September, then 28, 57 and 117 by October 19,
// against 120. A run cut off by the limit saves nothing, not even the
// baseline PR runs start from. So a plan job splits the files into shards
// of near-equal weight, each shard runs as its own job and saves its
// results, and a merge job puts them back together, applies the per-file
// gate to the whole and saves it as main's baseline.
//
// Splitting: each file goes whole to one shard (Stryker's line ranges can't
// split a file safely: a mutant spanning two ranges belongs to neither),
// biggest first, each to the lightest shard so far, ties to the lower
// shard and equal weights in path order, so the same files and weights
// always give the same split. A file weighs what testing it took in the
// last results (main's baseline, when the cache still has one): each
// mutant Stryker ran counts one, plus one for each test covering it, since
// a mutant's run takes about as long as its covering tests (src/context/
// SiftContext.tsx's mutants each run about a hundred, many of them whole
// screens, and it alone was a quarter of the October 19 sweep). A file the
// results don't have weighs its line count at the known files' weight per
// line (its line count when none is known).
//
// Merging: each shard mutated its own files, so the reports' files are
// disjoint; a file in two of them means the split went wrong, and the merge
// stops. But Stryker numbers a report's tests in the order its run met
// them, so test "7" in one shard is another test in the next. Tests are
// matched across shards the way Stryker's incremental mode matches them
// (test file, start position and name), numbered once, and every mutant's
// coveredBy and killedBy renumbered to match; a test a shard names but
// doesn't list is dropped from them. The merged results become main's
// baseline only when every shard reported: one missing a shard would send
// PR runs to re-test that shard's files, or score them on nothing.

// Paths are compared as the scope names them, relative to the checkout:
// each function taking `relative` is given mutationScope.ts's relativeName
// bound to the working directory (the command line imports both; this
// file imports neither, so Node's type stripping can run it as is).
type Relative = (file: string) => string;

interface Position {
  line?: number;
  column?: number;
}
export interface SweepTest {
  id: string;
  name: string;
  location?: { start?: Position; end?: Position };
  [key: string]: unknown;
}
export interface SweepMutant {
  status?: string;
  coveredBy?: string[];
  killedBy?: string[];
  [key: string]: unknown;
}
/** The parts of Stryker's incremental results (reports/stryker-incremental.json) the sweep reads. */
export interface SweepReport {
  files?: Record<string, { mutants?: SweepMutant[]; [key: string]: unknown }>;
  testFiles?: Record<string, { tests?: SweepTest[]; [key: string]: unknown }>;
  [key: string]: unknown;
}

export interface Shard {
  files: string[];
  weight: number;
}

/** What testing one mutant took: one run, plus each test covering it. Ignored mutants never run. */
export function mutantWeight(mutant: SweepMutant): number {
  return mutant.status === 'Ignored' ? 0 : 1 + (mutant.coveredBy?.length ?? 0);
}

/** Each file's weight in a set of results, by cwd-relative name. */
export function reportWeights(report: SweepReport, relative: Relative): Map<string, number> {
  const weights = new Map<string, number>();
  for (const [name, file] of Object.entries(report.files ?? {})) {
    const weight = (file.mutants ?? []).reduce((sum, m) => sum + mutantWeight(m), 0);
    weights.set(relative(name), weight);
  }
  return weights;
}

/**
 * Each file's weight: its weight in `known` when there is one, else its
 * line count at the weight per line of the files `known` has (1 when it
 * has none of them).
 */
export function fileWeights(
  files: readonly string[],
  lines: (file: string) => number,
  known: Map<string, number>,
): Map<string, number> {
  let weight = 0;
  let knownLines = 0;
  for (const file of files) {
    const w = known.get(file);
    if (w === undefined) continue;
    weight += w;
    knownLines += lines(file);
  }
  const perLine = knownLines > 0 ? weight / knownLines : 1;
  return new Map(files.map((file) => [file, known.get(file) ?? Math.round(lines(file) * perLine)]));
}

/** The files in at most `count` shards of near-equal weight (never an empty one), each in path order. */
export function splitShards(weights: Map<string, number>, count: number): Shard[] {
  const weightOf = (file: string) => weights.get(file) ?? 0;
  const order = [...weights.keys()].sort((a, b) => weightOf(b) - weightOf(a) || (a < b ? -1 : 1));
  const shards: Shard[] = Array.from({ length: Math.min(count, order.length) }, () => ({
    files: [],
    weight: 0,
  }));
  for (const file of order) {
    let lightest = 0;
    for (let i = 1; i < shards.length; i++) {
      if (shards[i].weight < shards[lightest].weight) lightest = i;
    }
    shards[lightest].files.push(file);
    shards[lightest].weight += weightOf(file);
  }
  for (const shard of shards) shard.files.sort();
  return shards;
}

/** A GitHub Actions job matrix with one entry per shard, its files comma-joined for --mutate. */
export function shardMatrix(shards: readonly Shard[]): {
  include: { shard: number; mutate: string }[];
} {
  return { include: shards.map(({ files }, i) => ({ shard: i + 1, mutate: files.join(',') })) };
}

/** The split as a Markdown table. */
export function shardTable(shards: readonly Shard[], fromResults: boolean): string {
  const unit = fromResults ? 'mutants plus covering tests, last results' : 'lines';
  const rows = shards.map(({ files, weight }, i) => `| ${i + 1} | ${files.length} | ${weight} |`);
  return [`| Shard | Files | Weight (${unit}) |`, '| --- | --- | --- |', ...rows, ''].join('\n');
}

/**
 * stryker.config.json for one shard: no break threshold, as a shard's
 * score is one part's (the merge job judges the whole, file by file).
 */
export function shardConfig(config: Record<string, unknown>): Record<string, unknown> {
  const thresholds =
    typeof config.thresholds === 'object' && config.thresholds !== null ? config.thresholds : {};
  return { ...config, thresholds: { ...thresholds, break: null } };
}

/** The key Stryker's incremental mode knows a test by across runs: its file, start and name. */
export function testKey(fileName: string, test: SweepTest, relative: Relative): string {
  const start = test.location?.start;
  return `${relative(fileName)}@${start?.line ?? 0}:${start?.column ?? 0}\n${test.name}`;
}

/** The shards' results as one, tests numbered once across them. Throws on a file in two shards. */
export function mergeReports(reports: readonly SweepReport[], relative: Relative): SweepReport {
  const files: NonNullable<SweepReport['files']> = {};
  const testFiles: NonNullable<SweepReport['testFiles']> = {};
  const seen = new Set<string>();
  const ids = new Map<string, string>();
  for (const report of reports) {
    const local = new Map<string, string>();
    for (const [fileName, testFile] of Object.entries(report.testFiles ?? {})) {
      const merged = (testFiles[fileName] ??= { ...testFile, tests: [] });
      for (const test of testFile.tests ?? []) {
        const key = testKey(fileName, test, relative);
        let id = ids.get(key);
        if (id === undefined) {
          id = String(ids.size);
          ids.set(key, id);
          merged.tests?.push({ ...test, id });
        }
        local.set(test.id, id);
      }
    }
    const renumber = (list: string[] | undefined) =>
      list?.map((id) => local.get(id)).filter((id): id is string => id !== undefined);
    for (const [fileName, file] of Object.entries(report.files ?? {})) {
      const name = relative(fileName);
      if (seen.has(name)) throw new Error(`${name} is in more than one shard's results`);
      seen.add(name);
      files[fileName] = {
        ...file,
        mutants: (file.mutants ?? []).map((mutant) => ({
          ...mutant,
          coveredBy: renumber(mutant.coveredBy),
          killedBy: renumber(mutant.killedBy),
        })),
      };
    }
  }
  return { ...reports[0], files, testFiles };
}

export interface SweepCounts {
  killed: number;
  timeout: number;
  survived: number;
  noCoverage: number;
  errors: number;
  ignored: number;
  /** Stryker's score over the whole: detected over valid, null with nothing valid. */
  score: number | null;
}

/** A report's mutants by status, and the whole's score as Stryker computes it. */
export function sweepCounts(report: SweepReport): SweepCounts {
  const count = new Map<string, number>();
  for (const file of Object.values(report.files ?? {})) {
    for (const { status = 'unknown' } of file.mutants ?? []) {
      count.set(status, (count.get(status) ?? 0) + 1);
    }
  }
  const n = (status: string) => count.get(status) ?? 0;
  const detected = n('Killed') + n('Timeout');
  const valid = detected + n('Survived') + n('NoCoverage');
  return {
    killed: n('Killed'),
    timeout: n('Timeout'),
    survived: n('Survived'),
    noCoverage: n('NoCoverage'),
    errors: n('CompileError') + n('RuntimeError'),
    ignored: n('Ignored'),
    score: valid > 0 ? (detected / valid) * 100 : null,
  };
}

/** The merge's summary, and whether every shard reported (only then is it main's baseline). */
export function mergeSummary(found: number, expected: number, counts: SweepCounts): string {
  const complete = found === expected;
  const score = counts.score === null ? 'none' : `${counts.score.toFixed(2)}%`;
  const lines = [
    `### Mutation sweep${complete ? '' : ' (incomplete)'}`,
    '',
    `Shards reported: ${found} of ${expected}.`,
    '',
    '| Score | Killed | Timeout | Survived | No coverage | Errors | Ignored |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    `| ${score} | ${counts.killed} | ${counts.timeout} | ${counts.survived} | ${counts.noCoverage} | ${counts.errors} | ${counts.ignored} |`,
    '',
  ];
  if (!complete) {
    lines.push(
      "Not every shard reported, so these counts cover only some files, and main's baseline is left as it was.",
      '',
    );
  } else if (counts.score === null) {
    lines.push('No mutant was tested.', '');
  }
  return lines.join('\n');
}
