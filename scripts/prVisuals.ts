// "PR visuals" check: fails a PR that changes how the app looks but shows none
// of it. Reviewers can't judge a UI change from its diff, and on a swipe app a
// GIF shows what a still can't. The logic lives here, typed and unit-tested
// (__tests__/unit/prVisuals.test.ts); scripts/pr-visuals.mjs is the CLI that
// .github/workflows/pr-visuals.yml runs. This file imports nothing from Node,
// so it typechecks under the app's tsconfig (which loads no Node types).
//
// A change to a screen, a component, the root App, the theme (tokens,
// gradients, ThemeContext) or an image asset needs a picture in the
// description (an image, a GIF or a GitHub-uploaded video), or the template's
// ticked "No visible UI change" box for a change nobody can see (a refactor, a
// test-only tweak). Whether a change to motion also needs a GIF is a judgment
// call, so Claude Review makes it (claude-review.yml), not this script.
//
// It only knows the paths above: UI that changes through a hook, a service or
// app.json isn't caught, nor is a reference-style markdown image
// (![alt][ref]). Reviewers cover those.
const UI_FILE =
  /^(src\/App\.tsx|src\/(components|screens)\/.+\.tsx|src\/theme\/.+\.tsx?|assets\/.+)$/;

// Markdown or HTML images (GIFs included), HTML video, and the bare
// user-attachments URL GitHub inserts for a video dropped into the editor.
const VISUAL = [
  /!\[[^\]]*\]\([^)]+\)/,
  /<img\s[^>]*src=/i,
  /<video\s/i,
  /https:\/\/github\.com\/user-attachments\/assets\//,
];
const OPT_OUT = /^\s*[-*]\s*\[[xX]\]\s*No visible UI change/m;

export type PrVisualsResult = { ok: true; reason: string } | { ok: false; ui: string[] };

export function uiFiles(files: string[]): string[] {
  return files.filter((f) => UI_FILE.test(f));
}

// Drops HTML comments the way GitHub's renderer hides them: from each `<!--`
// to the next `-->`, and an unclosed one hides the rest. A scan, not a regex
// replace, so no `<!--` can survive the removal.
function withoutComments(text: string): string {
  let out = '';
  let from = 0;
  for (;;) {
    const start = text.indexOf('<!--', from);
    if (start === -1) return out + text.slice(from);
    out += text.slice(from, start);
    const end = text.indexOf('-->', start + 4);
    if (end === -1) return out;
    from = end + 3;
  }
}

// What renders: the template's example table sits in an HTML comment, and a
// tag quoted in code isn't a picture, so neither may count.
export function visibleText(body: string | undefined): string {
  return withoutComments(body ?? '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`\n]*`/g, '');
}

export function checkPrVisuals({
  files,
  body,
}: {
  files: string[];
  body: string | undefined;
}): PrVisualsResult {
  const ui = uiFiles(files);
  if (ui.length === 0) return { ok: true, reason: 'no UI files changed' };
  const text = visibleText(body);
  if (OPT_OUT.test(text)) return { ok: true, reason: 'marked "No visible UI change"' };
  if (VISUAL.some((re) => re.test(text))) return { ok: true, reason: 'description shows the change' };
  return { ok: false, ui };
}

export function failureMessage(ui: string[]): string {
  return [
    '::error::This PR changes the UI but its description shows none of it.',
    'Changed UI files:',
    ...ui.map((f) => `  ${f}`),
    'Add before/after simulator screenshots to the description (a GIF when the',
    'change affects motion or interaction: swipes, animations, sheets opening),',
    'or tick "No visible UI change" in the template. Editing the description',
    're-runs this check.',
  ].join('\n');
}
