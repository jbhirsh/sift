import {
  checkNativeBridge,
  parseSwiftFunctions,
  parseWrapperExports,
  type BridgeAllowlist,
} from '../../scripts/nativeBridge';

// The app's tsconfig loads no Node types, so type the one fs call used here.
const { readFileSync } = jest.requireActual<{
  readFileSync: (path: string, encoding: 'utf8') => string;
}>('fs');

const swift = (body: string) => `public class M: Module {\n  public func definition() -> ModuleDefinition {\n${body}\n  }\n}\n`;

const allow = (functions: Record<string, string>, over: Partial<BridgeAllowlist> = {}): BridgeAllowlist => ({
  maxFunctionLines: 40,
  maxFileLines: 500,
  files: { 'M.swift': 'The module.' },
  functions,
  ...over,
});

const files = (source: string) => ({ 'M.swift': source });

describe('parseSwiftFunctions', () => {
  test('finds Function and AsyncFunction declarations with their lengths', () => {
    const source = swift([
      '    Function("seek") { (position: Double) in',
      '      player.playbackTime = position',
      '    }',
      '    AsyncFunction("play") { (id: String) in',
      '      if ok {',
      '        try await player.play()',
      '      }',
      '    }',
    ].join('\n'));
    expect(parseSwiftFunctions(source)).toEqual([
      { name: 'seek', line: 3, lines: 3 },
      { name: 'play', line: 6, lines: 5 },
    ]);
  });

  test('braces in strings, escaped quotes, multi-line strings and comments don\'t count', () => {
    const source = swift([
      '    Function("f") { () -> String in',
      '      // a } in a comment',
      '      /* and { here */',
      '      let s = "a } and \\" { inside"',
      '      let m = """',
      '        } multi-line {',
      '        """',
      '      return s',
      '    }',
    ].join('\n'));
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
      "export async function play(id: string): Promise<void> {}",
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
    expect(checkNativeBridge({ swiftFiles: files(source), wrapper, allowlist: allow({ seek: 'Move the player.' }) })).toEqual([]);
  });

  test('a native function missing from the allowlist, or described with nothing, fails', () => {
    expect(checkNativeBridge({ swiftFiles: files(source), wrapper, allowlist: allow({}) })).toEqual([
      expect.stringContaining("seek (line 3) is a native function that isn't in native-api.json"),
    ]);
    expect(checkNativeBridge({ swiftFiles: files(source), wrapper, allowlist: allow({ seek: '  ' }) })).toEqual([
      expect.stringContaining('seek has an empty description'),
    ]);
  });

  test('a stale allowlist entry fails', () => {
    const problems = checkNativeBridge({ swiftFiles: files(source), wrapper, allowlist: allow({ seek: 'x', gone: 'y' }) });
    expect(problems).toEqual(["native-api.json lists gone, which the Swift module doesn't declare."]);
  });

  test('the Swift and TypeScript surfaces must match both ways', () => {
    expect(checkNativeBridge({ swiftFiles: files(source), wrapper: '', allowlist: allow({ seek: 'x' }) })).toEqual([
      'seek has no exported function in modules/expo-musickit/src/index.ts.',
    ]);
    expect(checkNativeBridge({
      swiftFiles: files(source),
      wrapper: `${wrapper}\nexport async function extra() {}`,
      allowlist: allow({ seek: 'x' }),
    })).toEqual(["index.ts exports extra, which the Swift module doesn't declare."]);
  });

  test('a function over the line budget fails; at the budget passes', () => {
    expect(checkNativeBridge({ swiftFiles: files(source), wrapper, allowlist: allow({ seek: 'x' }, { maxFunctionLines: 3 }) })).toEqual([]);
    expect(checkNativeBridge({ swiftFiles: files(source), wrapper, allowlist: allow({ seek: 'x' }, { maxFunctionLines: 2 }) })).toEqual([
      expect.stringContaining('seek (line 3) is 3 lines, over the 2-line budget'),
    ]);
    // No surrounding class here: its closing braces would end the body.
    const open = 'Function("seek") { (p: Double) in\n  if p {';
    expect(checkNativeBridge({ swiftFiles: files(open), wrapper, allowlist: allow({ seek: 'x' }) })).toEqual([
      expect.stringContaining('seek (line 1) is unterminated, over the 40-line budget'),
    ]);
  });

  test('a file over its line budget fails; at the budget passes', () => {
    const lines = source.split('\n').length;
    expect(checkNativeBridge({ swiftFiles: files(source), wrapper, allowlist: allow({ seek: 'x' }, { maxFileLines: lines }) })).toEqual([]);
    expect(checkNativeBridge({ swiftFiles: files(source), wrapper, allowlist: allow({ seek: 'x' }, { maxFileLines: lines - 1 }) })).toEqual([
      expect.stringContaining(`M.swift is ${lines} lines, over the ${lines - 1}-line budget`),
    ]);
  });

  test('every Swift file must be listed, and every listed file must exist', () => {
    const swiftFiles = { ...files(source), 'Helpers.swift': 'func decide() {}' };
    expect(checkNativeBridge({ swiftFiles, wrapper, allowlist: allow({ seek: 'x' }) })).toEqual([
      expect.stringContaining('Helpers.swift is a Swift file that isn\'t in native-api.json "files"'),
    ]);
    expect(checkNativeBridge({
      swiftFiles: files(source), wrapper, allowlist: allow({ seek: 'x' }, { files: { 'M.swift': 'm', 'Gone.swift': 'g' } }),
    })).toEqual(["native-api.json lists Gone.swift, which doesn't exist."]);
  });

  test('functions declared in any Swift file count', () => {
    const swiftFiles = { ...files(source), 'Extra.swift': 'Function("extra") { }' };
    const problems = checkNativeBridge({
      swiftFiles, wrapper, allowlist: allow({ seek: 'x' }, { files: { 'M.swift': 'm', 'Extra.swift': 'e' } }),
    });
    expect(problems).toEqual([
      expect.stringContaining("extra (line 1) is a native function that isn't in native-api.json"),
      'extra has no exported function in modules/expo-musickit/src/index.ts.',
    ]);
  });

  test('a function declared twice fails', () => {
    const twice = swift('    Function("seek") { }\n    Function("seek") { }');
    expect(checkNativeBridge({ swiftFiles: files(twice), wrapper, allowlist: allow({ seek: 'x' }) })).toEqual([
      'seek is declared twice in the Swift module (line 4).',
    ]);
  });

  test('the real module passes', () => {
    const { readdirSync } = jest.requireActual<{ readdirSync: (path: string) => string[] }>('fs');
    const dir = 'modules/expo-musickit/ios';
    const swiftFiles = Object.fromEntries(
      readdirSync(dir).filter((name) => name.endsWith('.swift')).map((name) => [name, readFileSync(`${dir}/${name}`, 'utf8')]),
    );
    expect(Object.keys(swiftFiles)).toContain('ExpoMusicKitModule.swift');
    expect(checkNativeBridge({
      swiftFiles,
      wrapper: readFileSync('modules/expo-musickit/src/index.ts', 'utf8'),
      allowlist: JSON.parse(readFileSync('modules/expo-musickit/native-api.json', 'utf8')),
    })).toEqual([]);
  });
});
