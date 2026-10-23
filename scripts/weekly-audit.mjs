// CLI for the weekly audit (.github/workflows/weekly-audit.yml). The rules
// live in weeklyAudit.ts, typed and unit-tested; Node 22.18+ runs it
// directly. Commands:
//
//   knip <report.json> <out.md>    knip's JSON report as findings
//   jscpd <report.json> <out.md>   jscpd's JSON report as findings
//   issue <title> <findings.md>    open, update, reopen or close the
//                                  category's tracking issue
//
// The report commands write <out.md> only when there is something to say
// (and remove a stale one), so `issue` reads a missing file as a clean
// sweep. `issue` needs GH_TOKEN, GITHUB_REPOSITORY and RUN_URL.
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { ISSUE_LABEL, issueAction, issueBody, jscpdFindings, knipFindings } from './weeklyAudit.ts';

const [command, ...args] = process.argv.slice(2);

function writeFindings(out, findings) {
  if (findings) writeFileSync(out, `${findings}\n`);
  else rmSync(out, { force: true });
  process.stdout.write(findings ? `Findings written to ${out}.\n` : 'Nothing found.\n');
}

const gh = (...ghArgs) => execFileSync('gh', ghArgs, { encoding: 'utf8' });

function trackIssue(title, findingsPath) {
  const findings = existsSync(findingsPath) ? readFileSync(findingsPath, 'utf8').trim() : '';
  // Every issue this audit made, open or closed, matched by exact title.
  const existing = JSON.parse(
    gh(
      'issue',
      'list',
      '--label',
      ISSUE_LABEL,
      '--state',
      'all',
      '--limit',
      '100',
      '--json',
      'number,title,state',
    ),
  ).find((issue) => issue.title === title);
  const action = issueAction(existing, findings !== '');
  const bodyFile = `${findingsPath}.body`;
  if (findings) writeFileSync(bodyFile, issueBody(findings, process.env.RUN_URL ?? ''));
  switch (action) {
    case 'create':
      gh(
        'label',
        'create',
        ISSUE_LABEL,
        '--force',
        '--color',
        'C5DEF5',
        '--description',
        'Found by the weekly audit',
      );
      gh('issue', 'create', '--title', title, '--label', ISSUE_LABEL, '--body-file', bodyFile);
      break;
    case 'reopen':
      gh('issue', 'reopen', String(existing.number));
      gh('issue', 'edit', String(existing.number), '--body-file', bodyFile);
      break;
    case 'update':
      gh('issue', 'edit', String(existing.number), '--body-file', bodyFile);
      break;
    case 'close':
      gh(
        'issue',
        'close',
        String(existing.number),
        '--comment',
        `This week's sweep found nothing: ${process.env.RUN_URL ?? ''}`,
      );
      break;
    case 'none':
      break;
  }
  process.stdout.write(`${title}: ${action}${existing ? ` (#${existing.number})` : ''}.\n`);
}

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

switch (command) {
  case 'knip':
    writeFindings(args[1], knipFindings(readJson(args[0])));
    break;
  case 'jscpd':
    writeFindings(args[1], jscpdFindings(readJson(args[0]), process.cwd()));
    break;
  case 'issue':
    trackIssue(args[0], args[1]);
    break;
  default:
    process.stderr.write(
      'Usage: weekly-audit.mjs knip|jscpd <report.json> <out.md> | issue <title> <findings.md>\n',
    );
    process.exitCode = 2;
}
