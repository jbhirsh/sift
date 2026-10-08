import { checkPrVisuals, failureMessage, uiFiles, visibleText } from '../../scripts/prVisuals';

// The app's tsconfig loads no Node types, so type the one fs call used here.
const { readFileSync } = jest.requireActual<{
  readFileSync: (path: string, encoding: 'utf8') => string;
}>('fs');

describe('uiFiles', () => {
  it('keeps screens, components, the root App, the theme and image assets', () => {
    expect(
      uiFiles([
        'src/screens/SiftScreen.tsx',
        'src/components/InteractiveCard.tsx',
        'src/App.tsx',
        'src/theme/index.ts',
        'src/theme/ThemeContext.tsx',
        'assets/icon.png',
      ]),
    ).toEqual([
      'src/screens/SiftScreen.tsx',
      'src/components/InteractiveCard.tsx',
      'src/App.tsx',
      'src/theme/index.ts',
      'src/theme/ThemeContext.tsx',
      'assets/icon.png',
    ]);
  });

  it('drops logic, tests, E2E flows and config', () => {
    expect(
      uiFiles([
        'src/context/SiftContext.tsx',
        'src/hooks/useMusicProvider.ts',
        'src/services/SessionStore.ts',
        'src/utils/sorting.ts',
        '__tests__/unit/SiftScreen.test.tsx',
        '.maestro/02_sift_flow.yaml',
        'package.json',
        'README.md',
      ]),
    ).toEqual([]);
  });
});

describe('checkPrVisuals', () => {
  const ui = ['src/components/InteractiveCard.tsx'];
  const template = () => readFileSync('.github/pull_request_template.md', 'utf8');

  it('passes a PR with no UI files, whatever the description', () => {
    expect(checkPrVisuals({ files: ['src/services/SessionStore.ts'], body: '' }).ok).toBe(true);
    expect(checkPrVisuals({ files: ['package-lock.json'], body: undefined }).ok).toBe(true);
  });

  it('fails a UI change with no picture, naming the files', () => {
    expect(checkPrVisuals({ files: ui, body: 'Fixes the card.' })).toEqual({ ok: false, ui });
    expect(checkPrVisuals({ files: ui, body: undefined }).ok).toBe(false);
  });

  it.each([
    ['a markdown image', '![after](https://example.com/a.png)'],
    ['a markdown GIF', '![swipe](https://example.com/swipe.gif)'],
    ['an HTML image', '<img src="https://example.com/a.png" width="300">'],
    ['an HTML video', '<video src="https://example.com/a.mp4"></video>'],
    ['an uploaded video', 'https://github.com/user-attachments/assets/0f1e2d3c'],
  ])('passes a UI change whose description has %s', (_, body) => {
    expect(checkPrVisuals({ files: ui, body }).ok).toBe(true);
  });

  it('passes a UI change ticked "No visible UI change"', () => {
    expect(checkPrVisuals({ files: ui, body: '- [x] No visible UI change' }).ok).toBe(true);
    expect(checkPrVisuals({ files: ui, body: '* [X] No visible UI change (refactor)' }).ok).toBe(true);
  });

  it('fails the untouched template, whose example sits in a comment', () => {
    expect(checkPrVisuals({ files: ui, body: template() }).ok).toBe(false);
  });

  it('passes the template once its box is ticked', () => {
    const ticked = template().replace('- [ ] No visible UI change', '- [x] No visible UI change');
    expect(ticked).not.toEqual(template());
    expect(checkPrVisuals({ files: ui, body: ticked }).ok).toBe(true);
  });

  it('ignores pictures in comments, closed or not', () => {
    const img = '<img src="a.png">';
    expect(checkPrVisuals({ files: ui, body: `<!-- ${img} -->` }).ok).toBe(false);
    // An unclosed comment hides the rest of the description.
    expect(checkPrVisuals({ files: ui, body: `<!-- note\n${img}` }).ok).toBe(false);
    // Text after a closed comment still counts.
    expect(checkPrVisuals({ files: ui, body: `<!-- note -->\n${img}` }).ok).toBe(true);
    expect(checkPrVisuals({ files: ui, body: `<!-- a --><!-- b -->${img}` }).ok).toBe(true);
  });

  it('ignores pictures quoted in code', () => {
    expect(checkPrVisuals({ files: ui, body: 'Use `<img src="a.png">` here' }).ok).toBe(false);
    expect(checkPrVisuals({ files: ui, body: '```html\n<img src="a.png">\n```' }).ok).toBe(false);
  });

  it('does not count an unticked box or a mention of an image', () => {
    expect(checkPrVisuals({ files: ui, body: '- [ ] No visible UI change' }).ok).toBe(false);
    expect(checkPrVisuals({ files: ui, body: 'Screenshots: <img> to follow' }).ok).toBe(false);
    expect(checkPrVisuals({ files: ui, body: 'see ![]() later' }).ok).toBe(false);
  });
});

describe('visibleText', () => {
  it('keeps text around comments and code and treats a missing body as empty', () => {
    expect(visibleText('a <!-- hidden --> b `code` c')).toBe('a  b  c');
    expect(visibleText(undefined)).toBe('');
  });
});

describe('failureMessage', () => {
  it('starts with a GitHub error annotation and names every UI file', () => {
    const msg = failureMessage(['src/App.tsx', 'assets/icon.png']);
    expect(msg.startsWith('::error::')).toBe(true);
    expect(msg).toContain('  src/App.tsx\n  assets/icon.png');
    expect(msg).toContain('No visible UI change');
  });
});
