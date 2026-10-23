// The weekly audit (.github/workflows/weekly-audit.yml): the checks that need
// the whole repository at once, too slow or too noisy to gate a PR. Each
// writes its findings into one tracking issue per category, opened when
// something turns up, updated each week while it lasts and closed once a
// sweep comes back clean; the run itself stays green unless a tool breaks.
// The logic lives here, typed and unit-tested
// (__tests__/unit/weeklyAudit.test.ts); scripts/weekly-audit.mjs is the CLI
// that runs the reports and gh through it. Imports nothing from Node,
// so it typechecks under the app's tsconfig.
//
// Categories:
//   - Dead code: knip's JSON report (unused files, exports, dependencies).
//   - Duplicated code: jscpd's JSON report.
//   - Broken links: lychee's markdown report, passed through as it is.

export const ISSUE_LABEL = 'weekly-audit';

export type IssueState = 'OPEN' | 'CLOSED';
export type IssueAction = 'create' | 'update' | 'reopen' | 'close' | 'none';

/**
 * What to do with a category's tracking issue: open one for new findings,
 * keep the open one current (or reopen a closed one, so its history stays
 * in one place), close it once the sweep is clean.
 */
export function issueAction(
  existing: { state: IssueState } | undefined,
  findings: boolean,
): IssueAction {
  if (findings) {
    if (!existing) return 'create';
    return existing.state === 'OPEN' ? 'update' : 'reopen';
  }
  return existing?.state === 'OPEN' ? 'close' : 'none';
}

/** GitHub refuses an issue body over 65,536 characters; this leaves room. */
export const MAX_BODY = 65_000;

/**
 * The issue body: the findings, then where they came from. A report too long
 * for an issue is cut at a line, with a note sending the reader to the run.
 */
export function issueBody(findings: string, runUrl: string, maxLength = MAX_BODY): string {
  const footer = `\n\n---\n_Updated by the [weekly audit](${runUrl}). It closes this issue once a sweep finds nothing._\n`;
  const cut = `\n\n_Cut short: the full report is in [the run](${runUrl})._`;
  let text = findings.trim();
  if (text.length + footer.length > maxLength) {
    text = text.slice(0, Math.max(0, maxLength - footer.length - cut.length));
    const lastLine = text.lastIndexOf('\n');
    if (lastLine > 0) text = text.slice(0, lastLine);
    text += cut;
  }
  return text + footer;
}

// --- Dead code (knip) ------------------------------------------------------

interface KnipItem {
  name: string;
  line?: number;
}
type KnipIssue = { file: string } & Record<string, unknown>;

/** knip's issue types, as the issue lists them. */
const KNIP_LABELS: Record<string, string> = {
  files: 'Unused files',
  dependencies: 'Unused dependencies',
  devDependencies: 'Unused devDependencies',
  optionalPeerDependencies: 'Referenced optional peer dependencies',
  unlisted: 'Unlisted dependencies',
  binaries: 'Unlisted binaries',
  unresolved: 'Unresolved imports',
  exports: 'Unused exports',
  types: 'Unused exported types',
  nsExports: 'Unused exports in namespaces',
  nsTypes: 'Unused exported types in namespaces',
  enumMembers: 'Unused enum members',
  namespaceMembers: 'Unused namespace members',
  classMembers: 'Unused class members',
  duplicates: 'Duplicate exports',
  cycles: 'Circular dependencies',
  catalog: 'Unused catalog entries',
};

function isKnipItem(value: unknown): value is KnipItem {
  return (
    typeof value === 'object' && value !== null && typeof (value as KnipItem).name === 'string'
  );
}

/** knip's `--reporter json` output as markdown, or null when it found nothing. */
export function knipFindings(report: { issues?: KnipIssue[] }): string | null {
  const byType = new Map<string, string[]>();
  for (const issue of report.issues ?? []) {
    for (const [type, value] of Object.entries(issue)) {
      if (!Array.isArray(value)) continue;
      const items: unknown[] = value;
      for (const item of items) {
        // Most findings are one named item; a duplicate export or a cycle
        // is a list of them, reported as one finding.
        const group: unknown[] = Array.isArray(item) ? item : [item];
        const named = group.filter(isKnipItem);
        if (named.length === 0) continue;
        const line = named[0].line;
        const where = line ? `${issue.file}:${line}` : issue.file;
        const names = named.map((n) => `\`${n.name}\``).join(', ');
        // An unused file is its own finding: no name to add.
        const entry = type === 'files' ? `\`${where}\`` : `${names} in \`${where}\``;
        byType.set(type, [...(byType.get(type) ?? []), entry]);
      }
    }
  }
  if (byType.size === 0) return null;
  const sections = [...byType].map(
    ([type, entries]) =>
      `### ${KNIP_LABELS[type] ?? type} (${entries.length})\n\n${entries.map((e) => `- ${e}`).join('\n')}`,
  );
  return [
    '[knip](https://knip.dev) found code and dependencies nothing uses. Delete them, or, if something does use them in a way knip can’t see, say so in `knip.jsonc`.',
    ...sections,
  ].join('\n\n');
}

// --- Duplicated code (jscpd) -----------------------------------------------

interface JscpdLocation {
  name: string;
  start: number;
  end: number;
}
interface JscpdReport {
  duplicates?: {
    format: string;
    lines: number;
    firstFile: JscpdLocation;
    secondFile: JscpdLocation;
  }[];
  statistics?: { total?: { percentage?: number } };
}

/** A report path relative to the repository (jscpd writes absolute ones). */
function relative(path: string, root: string): string {
  const prefix = root.endsWith('/') ? root : `${root}/`;
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

/** jscpd's JSON report as markdown, largest clones first, or null when it found none. */
export function jscpdFindings(report: JscpdReport, root: string): string | null {
  const clones = [...(report.duplicates ?? [])].sort((a, b) => b.lines - a.lines);
  if (clones.length === 0) return null;
  const at = (loc: JscpdLocation) => `\`${relative(loc.name, root)}:${loc.start}-${loc.end}\``;
  const percentage = report.statistics?.total?.percentage ?? 0;
  return [
    `[jscpd](https://github.com/kucherenko/jscpd) found ${clones.length} duplicated block${clones.length === 1 ? '' : 's'} (${percentage.toFixed(2)}% of the lines it read, \`.jscpd.json\`). Pull a repeated one into a shared function or component; a repeat that reads better spelled out twice can stay, with a line in \`.jscpd.json\`'s \`ignore\`.`,
    '| Lines | First | Second |\n|---:|---|---|\n' +
      clones.map((c) => `| ${c.lines} | ${at(c.firstFile)} | ${at(c.secondFile)} |`).join('\n'),
  ].join('\n\n');
}
