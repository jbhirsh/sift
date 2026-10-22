// Claude Review's coverage check: which changed files the review never read.
// The prompt (claude-review.yml) says to read every changed file's diff,
// tests included, yet a review could pass a PR having opened only its
// source files and seen the tests in `--stat` (#188, twice). This reads
// the review's own tool calls from claude-code-action's execution file, so
// the workflow can send it back for what it missed. The logic lives here,
// typed and unit-tested (__tests__/unit/reviewCoverage.test.ts);
// scripts/review-coverage.mjs is the CLI. Imports nothing from Node, so it
// typechecks under the app's tsconfig.
//
// Strict on purpose: a call it can't be sure of reads nothing. The cost of
// a wrong "unread" is a second pass that reads the file again; the cost of
// a wrong "read" is a skipped test passing review. A file counts as read
// only through a call that succeeded and came back whole (or whose saved
// full output was then opened), and that was one of:
//   - one `git diff` with a range from origin/main, naming the file or a
//     folder holding it after `--` (no path: every file);
//   - `git show HEAD:<path>`, the file as the PR leaves it;
//   - `gh pr diff` (every file);
//   - Read of the file itself, whole (no offset or limit).
// A cut-off output's saved file counts once a Read opened it, in parts or
// whole: a diff too long for one Read must be read in parts.
// The command may start with `cd <dir> &&` and is otherwise one plain
// command: no pipe, redirect, chain, substitution or second line, so a
// grep pattern or a heredoc that mentions `git diff` reads nothing.

/** Lockfiles and binaries may be skipped, as the prompt allows. */
const SKIPPABLE = /(^|\/)(package-lock\.json|yarn\.lock|Podfile\.lock)$|\.(png|jpe?g|gif|webp|ico|pdf|svg|ttf|otf)$/i;
/** Flags that leave the diff out of the output, or cut it down. */
const NO_DIFF_FLAGS = new Set([
  '-s', '--no-patch', '--quiet', '--stat', '--numstat', '--shortstat', '--name-only', '--name-status',
  '--summary', '--raw', '--check', '--dirstat', '--compact-summary', '--exit-code',
]);
const NO_DIFF_PREFIXES = ['--stat=', '--dirstat=', '--output=', '--format=', '--pretty=', '-U0'];
/** Shell syntax that makes a command more than one plain command. */
const COMPOUND = /[|;&<>`\n]/;
/** The header Claude Code puts on output it cut to a preview. */
const CUT_OFF = /^\s*(<persisted-output>|Output too large)/i;
const SAVED_TO = /saved to:?\s*(\S+)/i;

export interface ToolCall {
  name: string;
  input: Record<string, unknown>;
  /** The call's result as text, when the execution file had one. */
  result?: string;
  /** The call failed (denied, cancelled, an error). */
  failed?: boolean;
}

/** The files a review must read: the changed ones less the skippable. */
export function filesToRead(changed: string[]): string[] {
  return changed.filter((f) => f && !SKIPPABLE.test(f));
}

/**
 * A plain command's words, quotes honoured, or null when it is more than
 * one plain command. A leading `cd <dir> &&` is allowed and dropped.
 */
export function plainWords(command: string): string[] | null {
  const body = command.trim().replace(/^cd\s+("[^"]*"|'[^']*'|\S+)\s*&&\s*/, '');
  const words: string[] = [];
  let word = '';
  let quote: '"' | "'" | null = null;
  let inWord = false;
  for (const ch of body) {
    if (quote) {
      // A variable or substitution, even in double quotes: can't judge it.
      if (quote === '"' && (ch === '$' || ch === '`')) return null;
      if (ch === quote) quote = null;
      else word += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      inWord = true;
    } else if (/\s/.test(ch) && ch !== '\n') {
      if (inWord) words.push(word);
      word = '';
      inWord = false;
    } else if (COMPOUND.test(ch) || ch === '$') {
      return null;
    } else {
      word += ch;
      inWord = true;
    }
  }
  if (quote) return null;
  if (inWord) words.push(word);
  return words;
}

/** Which of the files one call read, or null when it read none. */
function filesReadBy(words: string[], files: string[]): string[] {
  const [tool, sub, ...rest] = words;
  if (tool === 'gh' && sub === 'pr' && rest[0] === 'diff') {
    return rest.some((w) => w.startsWith('--name') || w === '--stat') ? [] : files;
  }
  if (tool !== 'git' || (sub !== 'diff' && sub !== 'show')) return [];
  if (rest.some((w) => NO_DIFF_FLAGS.has(w) || NO_DIFF_PREFIXES.some((p) => w.startsWith(p)))) return [];
  const dashes = rest.indexOf('--');
  const args = dashes === -1 ? rest : rest.slice(0, dashes);
  const paths = dashes === -1 ? [] : rest.slice(dashes + 1);
  const revisions = args.filter((w) => !w.startsWith('-'));
  if (sub === 'show') {
    // Only `git show <rev>:<path>`: plain `git show HEAD` on a pull
    // request's merge commit prints no diff at all.
    const shown = revisions.filter((w) => w.startsWith('HEAD:')).map((w) => w.slice('HEAD:'.length));
    return files.filter((f) => shown.includes(f));
  }
  // The PR's diff and nothing else: origin/main to HEAD, three dots or two,
  // or the two ends given apart.
  const range = revisions.join(' ');
  if (!/^origin\/main(\.\.\.?(HEAD)?| HEAD)$/.test(range)) return [];
  if (paths.length === 0) return files;
  // A magic pathspec (`:!x`, an exclude) names no file, so reads nothing.
  const named = paths.map((p) => p.replace(/^\.\//, '').replace(/\/+$/, ''));
  return files.filter((f) => named.some((p) => p === '' || p === '.' || f === p || f.startsWith(`${p}/`)));
}

/** Path relative to the repo, for a Read of an absolute path inside it. */
function relative(path: string, repoDir: string): string {
  const root = repoDir.replace(/\/+$/, '');
  return path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path.replace(/^\.\//, '');
}

/** The path a Read that worked opened, whole or (with `part`) in part. */
function readPath(call: ToolCall, part: boolean): string | null {
  if (call.name !== 'Read' || call.failed || typeof call.input.file_path !== 'string') return null;
  if (!part && (call.input.offset !== undefined || call.input.limit !== undefined)) return null;
  return call.input.file_path;
}

/** The changed files the review never read, in the order given. */
export function unreadFiles(changed: string[], calls: ToolCall[], repoDir: string): string[] {
  const needed = filesToRead(changed);
  const paths = (part: boolean) => calls.map((c) => readPath(c, part)).filter((p): p is string => p !== null);
  // A saved full output too long for one Read is read in parts.
  const opened = new Set(paths(true));
  const read = new Set(paths(false).map((p) => relative(p, repoDir)));
  for (const call of calls) {
    if (call.name !== 'Bash' || call.failed || typeof call.input.command !== 'string') continue;
    const result = call.result ?? '';
    if (CUT_OFF.test(result)) {
      // The saved path is in the header, not anywhere in the diff.
      const saved = SAVED_TO.exec(result.slice(0, 400))?.[1];
      if (!saved || !opened.has(saved)) continue;
    }
    const words = plainWords(call.input.command);
    if (words) for (const file of filesReadBy(words, needed)) read.add(file);
  }
  return needed.filter((f) => !read.has(f));
}

/**
 * The tool calls in claude-code-action's execution file (the SDK's message
 * list), each with its result. Unknown shapes are skipped, not fatal.
 */
export function toolCalls(execution: unknown): ToolCall[] {
  const uses: { id: string; call: ToolCall }[] = [];
  const results = new Map<string, { text: string; failed: boolean }>();
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!node || typeof node !== 'object') return;
    const o = node as Record<string, unknown>;
    if (o.type === 'tool_use' && typeof o.name === 'string' && o.input && typeof o.input === 'object') {
      uses.push({ id: String(o.id ?? ''), call: { name: o.name, input: o.input as Record<string, unknown> } });
    } else if (o.type === 'tool_result' && typeof o.tool_use_id === 'string') {
      results.set(o.tool_use_id, { text: resultText(o.content), failed: o.is_error === true });
    }
    Object.values(o).forEach(visit);
  };
  visit(execution);
  return uses.map(({ id, call }) => {
    const result = results.get(id);
    // No result at all: cancelled before it ran.
    return result ? { ...call, result: result.text, failed: result.failed } : { ...call, failed: true };
  });
}

function resultText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string'
        ? (part as { text: string }).text
        : ''))
      .join('\n');
  }
  return '';
}
