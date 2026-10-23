import {
  CHANGE_THRESHOLD,
  README_SHOTS,
  README_WIDTH,
  needsUpdate,
  parseCompareCount,
  prBody,
} from '../../scripts/readmeScreenshots';

describe('README_SHOTS', () => {
  it("maps the E2E job's light Setup, Sift and Done shots to the README's images", () => {
    expect(README_SHOTS.map((s) => [s.shot, s.file])).toEqual([
      ['light-01-setup.png', 'docs/screenshots/setup.png'],
      ['light-03-sift.png', 'docs/screenshots/sift.png'],
      ['light-07-done.png', 'docs/screenshots/done.png'],
    ]);
    expect(README_WIDTH).toBe(780);
  });
});

describe('needsUpdate', () => {
  it('replaces an image it could not compare (another size, or none yet)', () => {
    expect(needsUpdate(null)).toBe(true);
  });

  it('keeps an image when only a few pixels moved', () => {
    expect(needsUpdate({ differing: 0, total: 1000 })).toBe(false);
    expect(needsUpdate({ differing: 5, total: 1000 })).toBe(false);
  });

  it('replaces it once more than the threshold of pixels differ', () => {
    expect(CHANGE_THRESHOLD).toBe(0.005);
    expect(needsUpdate({ differing: 6, total: 1000 })).toBe(true);
    expect(needsUpdate({ differing: 6, total: 1000 }, 0.01)).toBe(false);
  });

  it('replaces an empty image', () => {
    expect(needsUpdate({ differing: 0, total: 0 })).toBe(true);
  });
});

describe('parseCompareCount', () => {
  it("reads ImageMagick's pixel count, plain or in exponent form", () => {
    expect(parseCompareCount('0')).toBe(0);
    expect(parseCompareCount('1234')).toBe(1234);
    expect(parseCompareCount('1.5e+06 compare: some warning')).toBe(1_500_000);
    expect(parseCompareCount('  42.6\n')).toBe(43);
  });

  it('is null when it printed no count', () => {
    expect(
      parseCompareCount("compare: image widths or heights differ `a.png' @ error/compare.c"),
    ).toBeNull();
    expect(parseCompareCount('')).toBeNull();
  });
});

describe('prBody', () => {
  const body = prBody({
    repo: 'jbhirsh/sift',
    updated: [README_SHOTS[0], README_SHOTS[2]],
    sourcePr: '190',
    baseSha: 'aaa111',
    headSha: 'bbb222',
    runUrl: 'https://github.com/jbhirsh/sift/actions/runs/1',
  });

  it('shows each replaced screen before and after, linked by commit', () => {
    expect(body).toContain(
      '| Setup | <img src="https://raw.githubusercontent.com/jbhirsh/sift/aaa111/docs/screenshots/setup.png" width="260"> | <img src="https://raw.githubusercontent.com/jbhirsh/sift/bbb222/docs/screenshots/setup.png" width="260"> |',
    );
    expect(body).toContain('| Done |');
    expect(body).not.toContain('| Sift |');
  });

  it("follows the PR template's sections and says where the shots came from", () => {
    expect(body).toMatch(
      /^The README's screenshots, refreshed .* for #190 \(mock library\), which changed how these screens look\./,
    );
    expect(body).toContain('## Visual changes');
    expect(body).toContain('- [ ] No visible UI change');
    expect(body).toContain('## Validation');
    expect(body).toContain(
      '(more than 0.5% of pixels differ): [run](https://github.com/jbhirsh/sift/actions/runs/1)',
    );
  });

  it('speaks of one screen when only one changed', () => {
    expect(
      prBody({
        repo: 'r/s',
        updated: [README_SHOTS[1]],
        sourcePr: '1',
        baseSha: 'a',
        headSha: 'b',
        runUrl: 'u',
      }),
    ).toContain('which changed how this screen looks.');
  });
});
