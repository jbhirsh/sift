import {
  checkNativeBridge,
  parseAllowlist,
  parseSwiftFunctions,
  parseWrapperExports,
  main,
  runNativeBridgeCheck,
  type BridgeAllowlist,
} from '../../scripts/check-native-bridge';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const swift = (body: string) =>
  `public class M: Module {\n  public func definition() -> ModuleDefinition {\n${body}\n  }\n}\n`;

const allow = (
  functions: Record<string, string>,
  over: Partial<BridgeAllowlist> = {},
): BridgeAllowlist => ({
  maxFunctionLines: 40,
  maxFileLines: 500,
  files: { 'M.swift': 'The module.' },
  functions,
  ...over,
});

const files = (source: string) => ({ 'M.swift': source });

describe('parseSwiftFunctions', () => {
  test('finds Function and AsyncFunction declarations with their lengths', () => {
    const source = swift(
      [
        '    Function("seek") { (position: Double) in',
        '      player.playbackTime = position',
        '    }',
        '    AsyncFunction("play") { (id: String) in',
        '      if ok {',
        '        try await player.play()',
        '      }',
        '    }',
      ].join('\n'),
    );
    expect(parseSwiftFunctions(source)).toEqual([
      { name: 'seek', line: 3, lines: 3 },
      { name: 'play', line: 6, lines: 5 },
    ]);
  });

  test("braces in strings, escaped quotes, multi-line strings and comments don't count", () => {
    const source = swift(
      [
        '    Function("f") { () -> String in',
        '      // a } in a comment',
        '      /* and { here */',
        '      let s = "a } and \\" { inside"',
        '      let m = """',
        '        } multi-line {',
        '        """',
        '      return s',
        '    }',
      ].join('\n'),
    );
    expect(parseSwiftFunctions(source)).toEqual([{ name: 'f', line: 3, lines: 9 }]);
  });

  test('an unterminated body, string or comment counts as endless', () => {
    expect(parseSwiftFunctions('Function("a") { if x {')[0].lines).toBe(Infinity);
    expect(parseSwiftFunctions('Function("a") { let s = "open\n}')[0].lines).toBe(Infinity);
    expect(parseSwiftFunctions('Function("a") { /* open')[0].lines).toBe(Infinity);
    expect(parseSwiftFunctions('Function("a") { // open')[0].lines).toBe(Infinity);
    expect(parseSwiftFunctions('Function("a") { let s = """\n open')[0].lines).toBe(Infinity);
  });

  test('ignores look-alikes', () => {
    expect(parseSwiftFunctions('MyFunction("x") { }\nlet name = "Function"')).toEqual([]);
  });
});

describe('parseWrapperExports', () => {
  test('lists exported functions, sync or async, not types or locals', () => {
    const source = [
      'export async function play(id: string): Promise<void> {}',
      'export function seek(p: number): void {}',
      'function helper() {}',
      'export type { Thing };',
      'export const X = 1;',
    ].join('\n');
    expect(parseWrapperExports(source)).toEqual(['play', 'seek']);
  });
});

describe('checkNativeBridge', () => {
  const source = swift('    Function("seek") { (p: Double) in\n      x = p\n    }');
  const wrapper = 'export function seek(p: number): void {}';

  test('a matching bridge passes', () => {
    expect(
      checkNativeBridge({
        swiftFiles: files(source),
        wrapper,
        allowlist: allow({ seek: 'Move the player.' }),
      }),
    ).toEqual([]);
  });

  test('a native function missing from the allowlist, or described with nothing, fails', () => {
    expect(checkNativeBridge({ swiftFiles: files(source), wrapper, allowlist: allow({}) })).toEqual(
      [expect.stringContaining("seek (line 3) is a native function that isn't in native-api.json")],
    );
    expect(
      checkNativeBridge({ swiftFiles: files(source), wrapper, allowlist: allow({ seek: '  ' }) }),
    ).toEqual([expect.stringContaining('seek has an empty description')]);
  });

  test('a stale allowlist entry fails', () => {
    const problems = checkNativeBridge({
      swiftFiles: files(source),
      wrapper,
      allowlist: allow({ seek: 'x', gone: 'y' }),
    });
    expect(problems).toEqual([
      "native-api.json lists gone, which the Swift module doesn't declare.",
    ]);
  });

  test('the Swift and TypeScript surfaces must match both ways', () => {
    expect(
      checkNativeBridge({
        swiftFiles: files(source),
        wrapper: '',
        allowlist: allow({ seek: 'x' }),
      }),
    ).toEqual(['seek has no exported function in modules/expo-musickit/src/index.ts.']);
    expect(
      checkNativeBridge({
        swiftFiles: files(source),
        wrapper: `${wrapper}\nexport async function extra() {}`,
        allowlist: allow({ seek: 'x' }),
      }),
    ).toEqual(["index.ts exports extra, which the Swift module doesn't declare."]);
  });

  test('a function over the line budget fails; at the budget passes', () => {
    expect(
      checkNativeBridge({
        swiftFiles: files(source),
        wrapper,
        allowlist: allow({ seek: 'x' }, { maxFunctionLines: 3 }),
      }),
    ).toEqual([]);
    expect(
      checkNativeBridge({
        swiftFiles: files(source),
        wrapper,
        allowlist: allow({ seek: 'x' }, { maxFunctionLines: 2 }),
      }),
    ).toEqual([expect.stringContaining('seek (line 3) is 3 lines, over the 2-line budget')]);
    // No surrounding class here: its closing braces would end the body.
    const open = 'Function("seek") { (p: Double) in\n  if p {';
    expect(
      checkNativeBridge({ swiftFiles: files(open), wrapper, allowlist: allow({ seek: 'x' }) }),
    ).toEqual([expect.stringContaining('seek (line 1) is unterminated, over the 40-line budget')]);
  });

  test('a file over its line budget fails; at the budget passes', () => {
    const lines = source.split('\n').length;
    expect(
      checkNativeBridge({
        swiftFiles: files(source),
        wrapper,
        allowlist: allow({ seek: 'x' }, { maxFileLines: lines }),
      }),
    ).toEqual([]);
    expect(
      checkNativeBridge({
        swiftFiles: files(source),
        wrapper,
        allowlist: allow({ seek: 'x' }, { maxFileLines: lines - 1 }),
      }),
    ).toEqual([
      expect.stringContaining(`M.swift is ${lines} lines, over the ${lines - 1}-line budget`),
    ]);
  });

  test('every Swift file must be listed, and every listed file must exist', () => {
    const swiftFiles = { ...files(source), 'Helpers.swift': 'func decide() {}' };
    expect(checkNativeBridge({ swiftFiles, wrapper, allowlist: allow({ seek: 'x' }) })).toEqual([
      expect.stringContaining(
        'Helpers.swift is a Swift file that isn\'t in native-api.json "files"',
      ),
    ]);
    expect(
      checkNativeBridge({
        swiftFiles: files(source),
        wrapper,
        allowlist: allow({ seek: 'x' }, { files: { 'M.swift': 'm', 'Gone.swift': 'g' } }),
      }),
    ).toEqual(["native-api.json lists Gone.swift, which doesn't exist."]);
  });

  test('functions declared in any Swift file count', () => {
    const swiftFiles = { ...files(source), 'Extra.swift': 'Function("extra") { }' };
    const problems = checkNativeBridge({
      swiftFiles,
      wrapper,
      allowlist: allow({ seek: 'x' }, { files: { 'M.swift': 'm', 'Extra.swift': 'e' } }),
    });
    expect(problems).toEqual([
      expect.stringContaining("extra (line 1) is a native function that isn't in native-api.json"),
      'extra has no exported function in modules/expo-musickit/src/index.ts.',
    ]);
  });

  test('a function declared twice fails', () => {
    const twice = swift('    Function("seek") { }\n    Function("seek") { }');
    expect(
      checkNativeBridge({ swiftFiles: files(twice), wrapper, allowlist: allow({ seek: 'x' }) }),
    ).toEqual(['seek is declared twice in the Swift module (line 4).']);
  });
});

describe('runNativeBridgeCheck', () => {
  const IOS = 'modules/expo-musickit/ios';
  const ok = swift('    Function("seek") { }');
  const allowlistText = JSON.stringify({ $comment: 'x', ...allow({ seek: 'Seeks.' }) });

  /** A checkout holding these files (paths from its root). */
  const checkout = (tree: Record<string, string>) => ({
    read: (path: string) => {
      const text = tree[path];
      if (text === undefined) throw new Error(`no ${path}`);
      return text;
    },
    list: (dir: string) =>
      Object.keys(tree)
        .filter((path) => path.startsWith(`${dir}/`))
        .map((path) => path.slice(dir.length + 1)),
  });

  test('reads only the Swift files of the module, and passes', () => {
    const io = checkout({
      [`${IOS}/M.swift`]: ok,
      [`${IOS}/Info.plist`]: 'not swift',
      'modules/expo-musickit/src/index.ts': 'export function seek() {}\n',
      'modules/expo-musickit/native-api.json': allowlistText,
    });
    expect(runNativeBridgeCheck(io)).toEqual({ lines: ['Native bridge: ok.'], ok: true });
  });

  test('prints each problem under a count, and fails', () => {
    const io = checkout({
      [`${IOS}/M.swift`]: ok,
      'modules/expo-musickit/src/index.ts':
        'export function seek() {}\nexport function pause() {}\n',
      'modules/expo-musickit/native-api.json': JSON.stringify(
        allow({ seek: 'Seeks.', play: 'Plays.' }),
      ),
    });
    expect(runNativeBridgeCheck(io)).toEqual({
      lines: [
        'Native bridge: 2 problem(s)',
        "  - native-api.json lists play, which the Swift module doesn't declare.",
        "  - index.ts exports pause, which the Swift module doesn't declare.",
      ],
      ok: false,
    });
  });
});

describe('main', () => {
  let written: string[];
  beforeEach(() => {
    written = [];
    jest.spyOn(process.stdout, 'write').mockImplementation((text) => {
      written.push(String(text));
      return true;
    });
  });
  afterEach(() => {
    jest.restoreAllMocks();
    process.exitCode = undefined;
  });

  test('passes on this checkout, leaving the exit code alone', () => {
    main();
    expect(written).toEqual(['Native bridge: ok.\n']);
    expect(process.exitCode).toBeUndefined();
  });

  test('reports each problem and exits 1 on a checkout that fails', () => {
    const root = mkdtempSync(join(tmpdir(), 'bridge-'));
    try {
      cpSync('modules/expo-musickit', join(root, 'modules/expo-musickit'), { recursive: true });
      const wrapper = join(root, 'modules/expo-musickit/src/index.ts');
      writeFileSync(wrapper, `${readFileSync(wrapper, 'utf8')}\nexport function extra() {}\n`);
      main(pathToFileURL(`${root}/`));
      expect(written).toEqual([
        'Native bridge: 1 problem(s)\n',
        "  - index.ts exports extra, which the Swift module doesn't declare.\n",
      ]);
      expect(process.exitCode).toBe(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('parseAllowlist', () => {
  test('keeps the four settings and drops the rest', () => {
    expect(
      parseAllowlist(JSON.stringify({ $comment: 'why', ...allow({ seek: 'Seeks.' }) })),
    ).toEqual(allow({ seek: 'Seeks.' }));
  });

  test.each([
    ['a list', '[]'],
    ['null', 'null'],
    ['a budget that is text', JSON.stringify({ ...allow({}), maxFunctionLines: '40' })],
    ['a missing file budget', JSON.stringify({ ...allow({}), maxFileLines: undefined })],
    ['files as a list', JSON.stringify({ ...allow({}), files: ['M.swift'] })],
    [
      'a function described by a number',
      JSON.stringify(allow({ seek: 'x', play: 3 as unknown as string })),
    ],
  ])('throws, naming the file, on %s', (_what, text) => {
    expect(() => parseAllowlist(text)).toThrow('modules/expo-musickit/native-api.json must hold');
  });

  test('throws, naming the file, on text that is not JSON', () => {
    expect(() => parseAllowlist('{"maxFunctionLines": 40,')).toThrow(
      'modules/expo-musickit/native-api.json is not JSON: SyntaxError',
    );
  });
});
