// Rules for the PR mutation run (.github/workflows/mutation.yml): which code
// it mutates (scripts/mutation-scope.mjs prints the `--mutate` entries) and
// what the per-file gate scores (scripts/check-mutation-threshold.mjs), and
// whether a PR with no mutable change runs Stryker at all.
// Typed and unit-tested (__tests__/unit/mutationScope.test.ts); this file
// imports nothing from Node, so it typechecks under the app's tsconfig.
//
// A PR mutates only the lines it adds or changes: one `file:first-last`
// entry per block, read from `git diff -U0` against the merge base, which
// Stryker's --mutate accepts. The rest of a file is code the PR didn't
// write, and mutating every line of each touched file made a big PR outrun
// the job (in jbhirsh/BoardGames, 77 touched components came to 5,176
// mutants and hit the three-hour limit at 52%, saving nothing). A file new
// to the branch is mutated whole, and one whose change only deletes lines
// has nothing left to mutate.
//
// The gate scores the same lines. Stryker's incremental mode carries every
// old result outside the --mutate scope into the report (the restored
// baseline's other files, and a scoped file's other lines), so the gate
// keeps only the mutants the run's scope names, by Stryker's own rule: a
// mutant counts when it starts and ends inside a named range. A file with
// nothing scorable in its changed lines (only types or comments changed, or
// only compile-error mutants) has no score, which isn't a failure.

export type LineRange = [first: number, last: number];

// SYNC POINT: `--mutate` REPLACES the `mutate` array in stryker.config.json
// (no merge), so that array is the source of truth and these patterns
// mirror it: the context's .ts and .tsx, the services', utils' and hooks'
// .ts, less the barrels, the interface, the mock data and the mock
// provider. Change them in the same commit as the config's entries, or PR
// runs and the monthly sweep silently diverge in scope.
// __tests__/unit/mutationScope.test.ts pins the config's array.
const MUTABLE = /^(src\/context\/.*\.tsx?|src\/(services|utils|hooks)\/.*\.ts)$/;
const NOT_MUTATED =
  /(\/index\.ts$|MusicProviderInterface\.ts$|mockData\.ts$|MockMusicProvider\.ts$)/;

/** Whether stryker.config.json's `mutate` globs take `file`. */
export function isMutable(file: string): boolean {
  return MUTABLE.test(file) && !NOT_MUTATED.test(file);
}

/**
 * The line ranges a diff with no context lines (`git diff -U0`) adds to its
 * new side; a hunk that only deletes (`+c,0`) adds none.
 */
export function addedRanges(diff: string): LineRange[] {
  const ranges: LineRange[] = [];
  for (const [, start, count] of diff.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
    const lines = count === undefined ? 1 : Number(count);
    if (lines > 0) ranges.push([Number(start), Number(start) + lines - 1]);
  }
  return ranges;
}

/**
 * `file` as --mutate entries: whole when `ranges` is null (new to the
 * branch), else one `file:first-last` per range, so none when it only lost
 * lines.
 */
export function mutateEntries(file: string, ranges: LineRange[] | null): string[] {
  return ranges === null ? [file] : ranges.map(([first, last]) => `${file}:${first}-${last}`);
}

/**
 * The --mutate entries for a PR's changed files (deletions already left
 * out): the mutable ones, each narrowed by `rangesOf` to the lines it adds
 * or changes (null for a file the merge base doesn't have).
 */
export function scopeEntries(
  changed: string[],
  rangesOf: (file: string) => LineRange[] | null,
): string[] {
  return changed.filter(isMutable).flatMap((file) => mutateEntries(file, rangesOf(file)));
}

// When a PR changes no mutable line, there is nothing of its own to
// mutate, but a change to the Stryker setup could still break the sweep
// and every later PR run, so it gets a small smoke run over three short
// utils files. Anything else (a screen, a test, an image, the docs) skips
// Stryker: the install and dry run alone took minutes and held up bot PRs
// that change only pictures or docs. The workflow still reports the
// required check, as only its Stryker steps are skipped.
//
// The setup is Stryker's config, Jest's (jest.config.js and what it loads
// from the repository: its setup files, Babel's config), the dependencies
// (package.json, the lockfile, patches/), the workflow, and the scripts
// that scope, run, split and gate the runs, with their tests.
// __tests__/unit/mutationScope.test.ts checks that every local file
// jest.config.js loads is listed.
const WIRING = [
  /^stryker\.conf(ig)?\.[^/]+$/,
  /^jest\.(config|setup)[^/]*$/,
  /^babel\.config\.[^/]+$/,
  /^\.babelrc[^/]*$/,
  /^__tests__\/helpers\/[^/]*\.setup\.ts$/,
  /^package(-lock)?\.json$/,
  /^patches\//,
  /^\.github\/workflows\/mutation\.yml$/,
  /^scripts\/(mutation-scope\.mjs|mutationScope\.ts|check-mutation-threshold\.mjs)$/,
  /^scripts\/(stryker-jest-runner\.mjs|strykerTestFiles\.ts|mutation-sweep\.mjs|mutationSweep\.ts)$/,
  /^__tests__\/unit\/(mutationScope|strykerTestFiles|mutationSweep)\.test\.ts$/,
];

/** The smoke run's --mutate entries: three short utils files. */
export const SMOKE_SCOPE = [
  'src/utils/formatTime.ts',
  'src/utils/sorting.ts',
  'src/utils/trackIdentity.ts',
];

/** Whether any of `files` (repository-relative) is part of the Stryker setup. */
export function wiringChanged(files: readonly string[]): boolean {
  return files.some((file) => WIRING.some((re) => re.test(file)));
}

/**
 * The PR run's --mutate entries: its changed lines (`scopeEntries`), else
 * the smoke scope when `touched` (every file the PR changes, deletions
 * included) changes the Stryker setup, else none: Stryker doesn't run.
 */
export function prScope(
  changed: string[],
  touched: readonly string[],
  rangesOf: (file: string) => LineRange[] | null,
): string[] {
  const entries = scopeEntries(changed, rangesOf);
  if (entries.length > 0) return entries;
  return wiringChanged(touched) ? [...SMOKE_SCOPE] : [];
}

/** A path as the scope names it: relative to `cwd`, with forward slashes. */
export function relativeName(file: string, cwd: string): string {
  const name = file.replace(/\\/g, '/');
  const root = `${cwd.replace(/\\/g, '/').replace(/\/$/, '')}/`;
  return (name.startsWith(root) ? name.slice(root.length) : name).replace(/^\.\//, '');
}

/**
 * A comma-separated --mutate value by file: null for a file named whole,
 * else the ranges named for it (a file named whole anywhere stays whole).
 */
export function parseScope(scope: string, cwd: string): Map<string, LineRange[] | null> {
  const byFile = new Map<string, LineRange[] | null>();
  for (const entry of scope.split(',').map((e) => e.trim())) {
    if (!entry) continue;
    const lines = /^(.+):(\d+)-(\d+)$/.exec(entry);
    const name = relativeName(lines ? lines[1] : entry, cwd);
    const known = byFile.get(name);
    if (!lines || known === null) byFile.set(name, null);
    else byFile.set(name, [...(known ?? []), [Number(lines[2]), Number(lines[3])]]);
  }
  return byFile;
}

interface Position {
  line?: number;
}
export interface ReportMutant {
  status?: string;
  location?: { start?: Position; end?: Position };
}
/** The parts of Stryker's JSON report (reports/mutation/mutation.json) the gate reads. */
export interface MutationReport {
  files?: Record<string, { mutants?: ReportMutant[] }>;
}

/** Whether a mutant starts and ends inside one of `ranges` (1-based lines). */
export function inRanges(mutant: ReportMutant, ranges: LineRange[]): boolean {
  const start = mutant.location?.start?.line;
  const end = mutant.location?.end?.line;
  if (start === undefined || end === undefined) return false;
  return ranges.some(([first, last]) => start >= first && end <= last);
}

/** Killed and timed-out mutants over every scorable one, as a percentage; null when none is scorable. */
export function score(mutants: ReportMutant[]): number | null {
  const count = (status: string) => mutants.filter((m) => m.status === status).length;
  const detected = count('Killed') + count('Timeout');
  const total = detected + count('Survived') + count('NoCoverage');
  return total === 0 ? null : (detected / total) * 100;
}

export interface FileScore {
  file: string;
  /** Null when nothing in the file's scope is scorable: not a failure. */
  score: number | null;
}

/**
 * Each scored file's mutation score, lowest first, files without a score
 * last. With a `scope` (a PR run), only the files it names count, each
 * scored on its named lines; without one (the monthly sweep), every file
 * counts whole.
 */
export function fileScores(
  report: MutationReport,
  scope: Map<string, LineRange[] | null> | null,
  cwd: string,
): FileScore[] {
  const scores: FileScore[] = [];
  for (const [file, data] of Object.entries(report.files ?? {})) {
    const name = relativeName(file, cwd);
    if (scope && !scope.has(name)) continue;
    const ranges = scope?.get(name) ?? null;
    const mutants = data.mutants ?? [];
    scores.push({
      file: name,
      score: score(ranges ? mutants.filter((m) => inRanges(m, ranges)) : mutants),
    });
  }
  const rank = (s: number | null) => s ?? Infinity;
  return scores.sort((a, b) => rank(a.score) - rank(b.score));
}

/** The scored files below `threshold`. */
export function failures(scores: FileScore[], threshold: number): FileScore[] {
  return scores.filter((s) => s.score !== null && s.score < threshold);
}
