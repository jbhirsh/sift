// `node scripts/check-native-bridge.ts` (npm run bridge): the "Native
// bridge" check, run in CI (Lint, Typecheck & Unit Test) and the pre-commit
// hook. The expo-musickit module is a thin bridge: each native function asks
// MusicKit, ShazamKit or the player one thing, and every decision lives in
// TypeScript so it ships with an EAS Update (CLAUDE.md). This check can't
// tell a primitive from a policy, but it makes native growth impossible to
// miss: a new native function needs an allowlist entry saying what it asks,
// the Swift and TypeScript surfaces must match, and functions and the file
// stay under a size budget.
//
// Node runs this file as it is (it strips the types), and the command line
// is main(), run only when Node runs the file (import.meta.main), so Jest
// imports and tests all of it.
import { readdirSync, readFileSync } from 'node:fs';

export interface BridgeAllowlist {
  /** Longest a native function body may be, in lines. */
  maxFunctionLines: number;
  /** Longest any Swift file of the module may be, in lines. */
  maxFileLines: number;
  /** Every Swift file of the module, with what it holds. */
  files: Record<string, string>;
  /** Every native function, with the one thing it asks of the platform. */
  functions: Record<string, string>;
}

export interface NativeFunction {
  name: string;
  /** 1-based line of the declaration. */
  line: number;
  /** Lines from the declaration to the closing brace, inclusive. */
  lines: number;
}

/**
 * The functions an Expo module's Swift definition exposes
 * (`Function("name") { ... }` and `AsyncFunction("name") { ... }`), with
 * the length of each body. Braces inside string literals and comments
 * don't count.
 */
export function parseSwiftFunctions(source: string): NativeFunction[] {
  const declaration = /\b(?:Async)?Function\("([^"]+)"\)/g;
  const found: NativeFunction[] = [];
  for (const match of source.matchAll(declaration)) {
    const start = match.index ?? 0;
    const end = closingBrace(source, start + match[0].length);
    found.push({
      name: match[1],
      line: lineAt(source, start),
      lines: end < 0 ? Infinity : lineAt(source, end) - lineAt(source, start) + 1,
    });
  }
  return found;
}

/** Index of the brace closing the first block opened at or after `from`; -1 if none. */
function closingBrace(source: string, from: number): number {
  let depth = 0;
  let opened = false;
  for (let i = from; i < source.length; i++) {
    const ch = source[i];
    const next = source[i + 1];
    if (ch === '/' && next === '/') {
      const newline = source.indexOf('\n', i);
      if (newline < 0) return -1;
      i = newline;
    } else if (ch === '/' && next === '*') {
      const close = source.indexOf('*/', i + 2);
      if (close < 0) return -1;
      i = close + 1;
    } else if (source.startsWith('"""', i)) {
      // A multi-line string literal: skip to its closing delimiter.
      const close = source.indexOf('"""', i + 3);
      if (close < 0) return -1;
      i = close + 2;
    } else if (ch === '"') {
      i = stringEnd(source, i);
      if (i < 0) return -1;
    } else if (ch === '{') {
      depth++;
      opened = true;
    } else if (ch === '}') {
      depth--;
      if (opened && depth === 0) return i;
    }
  }
  return -1;
}

/** Index of the quote closing the string literal opened at `open`; -1 if none. */
function stringEnd(source: string, open: number): number {
  for (let i = open + 1; i < source.length; i++) {
    if (source[i] === '\\') i++;
    else if (source[i] === '"') return i;
    else if (source[i] === '\n') return -1;
  }
  return -1;
}

function lineAt(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) if (source[i] === '\n') line++;
  return line;
}

/** Names of the functions a TypeScript module exports. */
export function parseWrapperExports(source: string): string[] {
  return [...source.matchAll(/^export\s+(?:async\s+)?function\s+(\w+)/gm)].map((m) => m[1]);
}

/** Every rule the bridge breaks; empty when it passes. */
export function checkNativeBridge(input: {
  /** The module's Swift files (modules/expo-musickit/ios), by file name. */
  swiftFiles: Record<string, string>;
  wrapper: string;
  allowlist: BridgeAllowlist;
}): string[] {
  const { swiftFiles, wrapper, allowlist } = input;
  const problems: string[] = [];
  const native = Object.values(swiftFiles).flatMap(parseSwiftFunctions);
  const nativeNames = new Set(native.map((fn) => fn.name));
  const wrapperNames = new Set(parseWrapperExports(wrapper));
  const allowed = allowlist.functions;

  const seen = new Set<string>();
  for (const fn of native) {
    if (seen.has(fn.name))
      problems.push(`${fn.name} is declared twice in the Swift module (line ${fn.line}).`);
    seen.add(fn.name);
    const description = allowed[fn.name];
    if (description === undefined) {
      problems.push(
        `${fn.name} (line ${fn.line}) is a native function that isn't in native-api.json. If it asks the ` +
          'platform one thing, add it there with that one thing; if it decides something, move the decision to TypeScript.',
      );
    } else if (description.trim() === '') {
      problems.push(
        `${fn.name} has an empty description in native-api.json: say the one thing it asks the platform.`,
      );
    }
    if (fn.lines > allowlist.maxFunctionLines) {
      problems.push(
        `${fn.name} (line ${fn.line}) is ${fn.lines === Infinity ? 'unterminated' : `${fn.lines} lines`}, over the ` +
          `${allowlist.maxFunctionLines}-line budget: a native function this long is probably deciding something that belongs in TypeScript.`,
      );
    }
    if (!wrapperNames.has(fn.name)) {
      problems.push(`${fn.name} has no exported function in modules/expo-musickit/src/index.ts.`);
    }
  }
  for (const name of Object.keys(allowed)) {
    if (!nativeNames.has(name))
      problems.push(`native-api.json lists ${name}, which the Swift module doesn't declare.`);
  }
  for (const name of wrapperNames) {
    if (!nativeNames.has(name))
      problems.push(`index.ts exports ${name}, which the Swift module doesn't declare.`);
  }
  for (const [file, source] of Object.entries(swiftFiles)) {
    if (allowlist.files[file] === undefined) {
      problems.push(
        `${file} is a Swift file that isn't in native-api.json "files". Native code needs a reinstall to change: ` +
          'put decisions in TypeScript, and list a file here only for platform plumbing.',
      );
    }
    const fileLines = source.split('\n').length;
    if (fileLines > allowlist.maxFileLines) {
      problems.push(
        `${file} is ${fileLines} lines, over the ${allowlist.maxFileLines}-line budget. Move decisions to ` +
          'TypeScript, or raise the budget in native-api.json and say why in the PR.',
      );
    }
  }
  for (const file of Object.keys(allowlist.files)) {
    if (swiftFiles[file] === undefined)
      problems.push(`native-api.json lists ${file}, which doesn't exist.`);
  }
  return problems;
}

const IOS_DIR = 'modules/expo-musickit/ios';
const WRAPPER = 'modules/expo-musickit/src/index.ts';
const ALLOWLIST = 'modules/expo-musickit/native-api.json';

/**
 * The check over the module as it is in this checkout, for the command
 * line: reads its Swift files, the TypeScript wrapper and native-api.json
 * through `io` (paths from the repo's root; `list` gives a folder's file
 * names) and says what to print, and whether it passed.
 */
export function runNativeBridgeCheck(io: {
  read: (path: string) => string;
  list: (dir: string) => string[];
}): { lines: string[]; ok: boolean } {
  const swiftFiles = Object.fromEntries(
    io
      .list(IOS_DIR)
      .filter((name) => name.endsWith('.swift'))
      .map((name) => [name, io.read(`${IOS_DIR}/${name}`)]),
  );
  const problems = checkNativeBridge({
    swiftFiles,
    wrapper: io.read(WRAPPER),
    allowlist: parseAllowlist(io.read(ALLOWLIST)),
  });
  if (problems.length === 0) return { lines: ['Native bridge: ok.'], ok: true };
  return {
    lines: [`Native bridge: ${problems.length} problem(s)`, ...problems.map((p) => `  - ${p}`)],
    ok: false,
  };
}

/** native-api.json read back; throws, naming the file, when it isn't JSON of that shape. */
export function parseAllowlist(text: string): BridgeAllowlist {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new Error(`${ALLOWLIST} is not JSON: ${String(error)}`, { cause: error });
  }
  if (
    isRecord(value) &&
    typeof value.maxFunctionLines === 'number' &&
    typeof value.maxFileLines === 'number' &&
    isStringRecord(value.files) &&
    isStringRecord(value.functions)
  ) {
    const { maxFunctionLines, maxFileLines, files, functions } = value;
    return { maxFunctionLines, maxFileLines, files, functions };
  }
  throw new Error(
    `${ALLOWLIST} must hold maxFunctionLines and maxFileLines (numbers) and files and functions (text by name).`,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((v) => typeof v === 'string');
}

/**
 * The command line: the check over the checkout `root` (this one by
 * default), its report on stdout, and exit code 1 when it fails.
 */
export function main(root: URL = new URL('../', import.meta.url)): void {
  const at = (path: string) => new URL(path, root);
  const { lines, ok } = runNativeBridgeCheck({
    read: (path) => readFileSync(at(path), 'utf8'),
    list: (dir) => readdirSync(at(dir)),
  });
  for (const line of lines) process.stdout.write(`${line}\n`);
  if (!ok) process.exitCode = 1;
}

if (import.meta.main) main();
