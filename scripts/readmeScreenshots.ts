// Keeps the README's screenshots current (.github/workflows/readme-screenshots.yml).
// When a PR merges, its CI run's E2E job has already photographed the app on
// the iOS Simulator (scripts/take-screenshots.sh, the `ios-screenshots`
// artifact, the mock library); the workflow takes the README's three from
// there, shrinks them to the README's size and replaces each one that looks
// different enough, then opens or updates one bot PR with them. The logic
// lives here, typed and unit-tested (__tests__/unit/readmeScreenshots.test.ts);
// scripts/readme-screenshots.mjs is the CLI that runs ImageMagick and git
// through it. Imports nothing from Node, so it typechecks under the app's
// tsconfig.
//
// Settings isn't refreshed: the README shows a crop of it, chosen by hand.

export interface ReadmeShot {
  /** The E2E job's screenshot, light appearance (e2e/screenshots/screens.yaml). */
  shot: string;
  /** Where the README shows it. */
  file: string;
  /** What it shows, for the PR's table. */
  label: string;
}

export const README_SHOTS: readonly ReadmeShot[] = [
  { shot: 'light-01-setup.png', file: 'docs/screenshots/setup.png', label: 'Setup' },
  { shot: 'light-03-sift.png', file: 'docs/screenshots/sift.png', label: 'Sift' },
  { shot: 'light-07-done.png', file: 'docs/screenshots/done.png', label: 'Done' },
];

/** The README's images are 390 points wide at 2x. */
export const README_WIDTH = 780;

/**
 * Share of pixels that must differ (beyond ImageMagick's colour fuzz) before
 * a screenshot is replaced. The status bar is pinned (take-screenshots.sh),
 * but the playing song's progress and font antialiasing still move a few
 * pixels from run to run; a real UI change moves far more.
 */
export const CHANGE_THRESHOLD = 0.005;

/**
 * The result of comparing the new screenshot with the README's: null when
 * they couldn't be compared pixel by pixel (a different size, or no image
 * there yet), otherwise how many pixels differ out of how many.
 */
export type Comparison = { differing: number; total: number } | null;

export function needsUpdate(comparison: Comparison, threshold = CHANGE_THRESHOLD): boolean {
  if (comparison === null) return true;
  return comparison.total === 0 || comparison.differing / comparison.total > threshold;
}

/**
 * ImageMagick's `compare -metric AE` count, from what it wrote to stderr
 * (a number, sometimes in exponent form, then any warnings). Null when it
 * printed no count: it couldn't compare the two.
 */
export function parseCompareCount(stderr: string): number | null {
  const match = /^\s*(\d+(?:\.\d+)?(?:e[+-]?\d+)?)/i.exec(stderr);
  return match ? Math.round(Number(match[1])) : null;
}

/**
 * The bot PR's description: what changed and why, the before/after pictures
 * linked by commit (so a later push can't change what it shows), and the
 * template's sections (.github/pull_request_template.md).
 */
export function prBody(input: {
  repo: string;
  updated: readonly ReadmeShot[];
  sourcePr: string;
  baseSha: string;
  headSha: string;
  runUrl: string;
}): string {
  const raw = (sha: string, file: string) =>
    `https://raw.githubusercontent.com/${input.repo}/${sha}/${file}`;
  const rows = input.updated.map(
    (s) =>
      `| ${s.label} | <img src="${raw(input.baseSha, s.file)}" width="260"> | <img src="${raw(input.headSha, s.file)}" width="260"> |`,
  );
  return [
    `The README's screenshots, refreshed from the iOS Simulator shots CI took for #${input.sourcePr} (mock library), which changed how ${input.updated.length === 1 ? 'this screen looks' : 'these screens look'}.`,
    '',
    '## Visual changes',
    '',
    '| Screen | Before (`main`) | After |',
    '|---|---|---|',
    ...rows,
    '',
    '- [ ] No visible UI change',
    '',
    '## Validation',
    '',
    `Taken by the E2E job's screenshot pass and compared pixel by pixel with the README's (more than ${(CHANGE_THRESHOLD * 100).toFixed(1)}% of pixels differ): [run](${input.runUrl}). Images only, so the E2E job skips it.`,
  ].join('\n');
}
