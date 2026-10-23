import {
  ISSUE_LABEL,
  MAX_BODY,
  issueAction,
  issueBody,
  jscpdFindings,
  knipFindings,
} from '../../scripts/weeklyAudit';

describe('issueAction', () => {
  it('opens an issue for findings when none exists', () => {
    expect(issueAction(undefined, true)).toBe('create');
  });

  it('keeps the open issue current while findings last', () => {
    expect(issueAction({ state: 'OPEN' }, true)).toBe('update');
  });

  it('reopens a closed issue when findings come back, keeping one history', () => {
    expect(issueAction({ state: 'CLOSED' }, true)).toBe('reopen');
  });

  it('closes the open issue once a sweep is clean', () => {
    expect(issueAction({ state: 'OPEN' }, false)).toBe('close');
  });

  it('does nothing on a clean sweep with no open issue', () => {
    expect(issueAction(undefined, false)).toBe('none');
    expect(issueAction({ state: 'CLOSED' }, false)).toBe('none');
  });
});

describe('issueBody', () => {
  it('puts the findings first, then a link to the run', () => {
    expect(issueBody('  - a finding\n\n', 'https://example.test/run/1')).toBe(
      '- a finding\n\n---\n_Updated by the [weekly audit](https://example.test/run/1). It closes this issue once a sweep finds nothing._\n',
    );
  });

  it('cuts a report too long for an issue at a line, sending the reader to the run', () => {
    const lines = Array.from({ length: 50 }, (_, i) => `- finding ${i}`).join('\n');
    const body = issueBody(lines, 'https://example.test/run/2', 400);
    expect(body.length).toBeLessThanOrEqual(400);
    expect(body).toContain('- finding 0\n');
    expect(body).not.toContain('- finding 49');
    // Whole lines only, then the note, then the footer.
    expect(body).toMatch(
      /- finding \d+\n\n_Cut short: the full report is in \[the run\]\(https:\/\/example\.test\/run\/2\)\._\n\n---\n_Updated by/,
    );
  });

  it('keeps a report that fits, and stays under GitHub’s 65,536-character limit', () => {
    expect(MAX_BODY).toBeLessThan(65_536);
    const fits = 'x'.repeat(100);
    expect(issueBody(fits, 'u', 200)).toBe(issueBody(fits, 'u'));
    expect(issueBody('y'.repeat(70_000), 'u').length).toBeLessThanOrEqual(MAX_BODY);
  });

  it('uses one label for every category', () => {
    expect(ISSUE_LABEL).toBe('weekly-audit');
  });
});

const knipIssue = (file: string, fields: Record<string, unknown>) => ({
  file,
  dependencies: [],
  exports: [],
  files: [],
  types: [],
  ...fields,
});

describe('knipFindings', () => {
  it('is null when knip found nothing', () => {
    expect(knipFindings({ issues: [] })).toBeNull();
    expect(knipFindings({})).toBeNull();
    expect(knipFindings({ issues: [knipIssue('src/a.ts', {})] })).toBeNull();
  });

  it('groups findings by type, naming each with its file and line', () => {
    const md = knipFindings({
      issues: [
        knipIssue('package.json', { dependencies: [{ name: 'left-pad', line: 22, col: 6 }] }),
        knipIssue('src/utils/chorus.ts', {
          exports: [
            { name: 'WINDOW_START', line: 3 },
            { name: 'WINDOW_END', line: 4 },
          ],
          types: [{ name: 'ChorusMethod', line: 9 }],
        }),
        knipIssue('scripts/old.mjs', { files: [{ name: 'scripts/old.mjs' }] }),
        knipIssue('app.json', { unlisted: [{ name: 'expo-system-ui' }] }),
      ],
    });
    expect(md).toContain('### Unused dependencies (1)\n\n- `left-pad` in `package.json:22`');
    expect(md).toContain(
      '### Unused exports (2)\n\n- `WINDOW_START` in `src/utils/chorus.ts:3`\n- `WINDOW_END` in `src/utils/chorus.ts:4`',
    );
    expect(md).toContain(
      '### Unused exported types (1)\n\n- `ChorusMethod` in `src/utils/chorus.ts:9`',
    );
    // An unused file is the finding itself, with no name beside it.
    expect(md).toContain('### Unused files (1)\n\n- `scripts/old.mjs`');
    // Without a line, just the file.
    expect(md).toContain('### Unlisted dependencies (1)\n\n- `expo-system-ui` in `app.json`');
    expect(md?.startsWith('[knip](https://knip.dev) found')).toBe(true);
  });

  it('reports a duplicate export or a cycle, a list of items, as one finding', () => {
    const md = knipFindings({
      issues: [
        knipIssue('src/utils/a.ts', {
          duplicates: [
            [
              { name: 'foo', line: 3 },
              { name: 'default', line: 9 },
            ],
          ],
        }),
        knipIssue('src/b.ts', { cycles: [[{ name: 'src/b.ts' }, { name: 'src/c.ts' }]] }),
      ],
    });
    expect(md).toContain('### Duplicate exports (1)\n\n- `foo`, `default` in `src/utils/a.ts:3`');
    expect(md).toContain('### Circular dependencies (1)\n\n- `src/b.ts`, `src/c.ts` in `src/b.ts`');
  });

  it('labels a type it has no name for by its key', () => {
    expect(
      knipFindings({ issues: [knipIssue('a.ts', { futureKind: [{ name: 'x' }] })] }),
    ).toContain('### futureKind (1)');
  });

  it('skips fields that are not lists of named findings', () => {
    expect(
      knipFindings({
        issues: [
          knipIssue('a.ts', { count: 3, misc: ['plain'], other: [null], odd: [{ line: 1 }] }),
        ],
      }),
    ).toBeNull();
  });
});

const loc = (name: string, start: number, end: number) => ({ name, start, end });

describe('jscpdFindings', () => {
  it('is null when jscpd found no clones', () => {
    expect(jscpdFindings({ duplicates: [] }, '/repo')).toBeNull();
    expect(jscpdFindings({}, '/repo')).toBeNull();
  });

  it('lists clones largest first, with paths relative to the repository', () => {
    const md = jscpdFindings(
      {
        duplicates: [
          {
            format: 'tsx',
            lines: 10,
            firstFile: loc('/repo/src/screens/DoneScreen.tsx', 73, 82),
            secondFile: loc('/repo/src/screens/SiftScreen.tsx', 94, 103),
          },
          {
            format: 'typescript',
            lines: 18,
            firstFile: loc('/repo/src/utils/validators.ts', 170, 187),
            secondFile: loc('/elsewhere/x.ts', 1, 18),
          },
        ],
        statistics: { total: { percentage: 0.7395 } },
      },
      '/repo/',
    );
    expect(md).toContain('found 2 duplicated blocks (0.74% of the lines it read');
    expect(md).toContain(
      '| 18 | `src/utils/validators.ts:170-187` | `/elsewhere/x.ts:1-18` |\n| 10 | `src/screens/DoneScreen.tsx:73-82` | `src/screens/SiftScreen.tsx:94-103` |',
    );
  });

  it('says block for one clone, and 0% when jscpd gave no statistics', () => {
    const md = jscpdFindings(
      {
        duplicates: [
          {
            format: 'swift',
            lines: 9,
            firstFile: loc('/r/a.swift', 1, 9),
            secondFile: loc('/r/b.swift', 1, 9),
          },
        ],
      },
      '/r',
    );
    expect(md).toContain('found 1 duplicated block (0.00% of');
    expect(md).toContain('| 9 | `a.swift:1-9` | `b.swift:1-9` |');
  });
});
