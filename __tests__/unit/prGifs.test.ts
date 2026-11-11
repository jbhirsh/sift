// scripts/pr-gifs.ts fetches jbhirsh/ci beside the checkout (as ../ci) and
// hands over to its GIF tool. Each test runs it on a scratch checkout, with
// a fake git on PATH (no network, and nothing touches a real ../ci) and a
// fake gif/cli.mjs that writes what it was given to FAKE_OUT.
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { main, prGifs } from '../../scripts/pr-gifs';

// Writes its arguments and APP_ROOT to FAKE_OUT, and exits with FAKE_STATUS.
const FAKE_CLI = `import { writeFileSync } from 'node:fs';
writeFileSync(process.env.FAKE_OUT, JSON.stringify({ args: process.argv.slice(2), appRoot: process.env.APP_ROOT }));
process.exit(Number(process.env.FAKE_STATUS || 0));
`;

// Logs each call; a clone puts the fake GIF tool where it was asked to;
// FAKE_GIT=fail makes every call fail.
const FAKE_GIT = `#!/bin/sh
echo "$*" >> "$GIT_LOG"
[ "$FAKE_GIT" = fail ] && exit 1
if [ "$1" = clone ]; then
  mkdir -p "$4/gif" && cp "$FAKE_CLI_FILE" "$4/gif/cli.mjs"
fi
exit 0
`;

let dir: string;
let app: string;
let ci: string;

beforeEach(() => {
  // Real path, as the tool is told it (macOS's tmpdir is a symlink).
  dir = realpathSync(mkdtempSync(`${tmpdir()}/pr-gifs-`));
  app = `${dir}/app`;
  ci = `${dir}/ci`;
  mkdirSync(app, { recursive: true });
  mkdirSync(`${dir}/bin`, { recursive: true });
  writeFileSync(`${dir}/cli.mjs`, FAKE_CLI);
  writeFileSync(`${dir}/bin/git`, FAKE_GIT, { mode: 0o755 });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** A clone of jbhirsh/ci at `at`, holding the fake GIF tool. */
function cloneAt(at: string): void {
  mkdirSync(`${at}/.git`, { recursive: true });
  mkdirSync(`${at}/gif`, { recursive: true });
  copyFileSync(`${dir}/cli.mjs`, `${at}/gif/cli.mjs`);
}

/** The fake's environment, over this process's, with `env` on top. */
function fakeEnv(env: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    CI_TOOLING_DIR: undefined,
    PATH: `${dir}/bin:${process.env.PATH ?? ''}`,
    GIT_LOG: `${dir}/git.log`,
    FAKE_CLI_FILE: `${dir}/cli.mjs`,
    FAKE_OUT: `${dir}/out.json`,
    ...env,
  };
}

/** What the GIF tool was given, or null when it never ran. */
function toolGot(): unknown {
  const out = `${dir}/out.json`;
  return existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : null;
}

function run(args: string[], env: Record<string, string> = {}) {
  const said: string[] = [];
  const status = prGifs({ root: app, args, env: fakeEnv(env), say: (line) => said.push(line) });
  const log = `${dir}/git.log`;
  const git = existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : [];
  return { status, said, git, tool: toolGot() };
}

test('with no ../ci yet, clones jbhirsh/ci there and runs its GIF tool on this checkout', () => {
  const result = run(['42', '--side-by-side']);
  expect(result.git).toEqual([`clone --quiet https://github.com/jbhirsh/ci ${ci}`]);
  expect(result.tool).toEqual({ args: ['42', '--side-by-side'], appRoot: app });
  expect(result.status).toBe(0);
});

test('with ../ci there, pulls it (fast-forward only) before running it', () => {
  cloneAt(ci);
  const result = run(['42']);
  expect(result.git).toEqual([`-C ${ci} pull --ff-only --quiet`]);
  expect(result.tool).toEqual({ args: ['42'], appRoot: app });
  expect(result.said).toEqual([]);
});

test('runs ../ci as it is when the pull fails, and says so', () => {
  cloneAt(ci);
  const result = run(['42'], { FAKE_GIT: 'fail' });
  expect(result.said).toEqual([`gif: couldn't update ${ci}; running it as it is`]);
  expect(result.tool).toEqual({ args: ['42'], appRoot: app });
  expect(result.status).toBe(0);
});

test('stops when the clone fails', () => {
  const result = run(['42'], { FAKE_GIT: 'fail' });
  expect(result.said).toEqual([`gif: couldn't clone jbhirsh/ci into ${ci}`]);
  expect(result.tool).toBeNull();
  expect(result.status).toBe(1);
});

test('CI_TOOLING_DIR runs that clone as it is, with no git at all', () => {
  cloneAt(`${dir}/mine`);
  const result = run(['7', '--no-before'], { CI_TOOLING_DIR: `${dir}/mine` });
  expect(result.git).toEqual([]);
  expect(result.tool).toEqual({ args: ['7', '--no-before'], appRoot: app });
});

test('stops when the folder holds no GIF tool', () => {
  mkdirSync(`${dir}/empty`, { recursive: true });
  const result = run(['42'], { CI_TOOLING_DIR: `${dir}/empty` });
  expect(result.said).toEqual([
    `gif: ${dir}/empty/gif/cli.mjs isn't there: is ${dir}/empty a clone of jbhirsh/ci?`,
  ]);
  expect(result.status).toBe(1);
});

test('exits as the GIF tool did', () => {
  cloneAt(ci);
  expect(run(['42'], { FAKE_STATUS: '3' }).status).toBe(3);
});

describe('main', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    process.exitCode = undefined;
  });

  test('runs it on this checkout and sets the exit code to the tool’s', () => {
    cloneAt(`${dir}/mine`);
    main(['42'], fakeEnv({ CI_TOOLING_DIR: `${dir}/mine`, FAKE_STATUS: '2' }));
    expect(toolGot()).toEqual({ args: ['42'], appRoot: process.cwd() });
    expect(process.exitCode).toBe(2);
  });

  test('says on stderr why it stopped', () => {
    const said: string[] = [];
    jest.spyOn(process.stderr, 'write').mockImplementation((text) => {
      said.push(String(text));
      return true;
    });
    main(['42'], fakeEnv({ CI_TOOLING_DIR: `${dir}/none` }));
    expect(said).toEqual([
      `gif: ${dir}/none/gif/cli.mjs isn't there: is ${dir}/none a clone of jbhirsh/ci?\n`,
    ]);
    expect(process.exitCode).toBe(1);
  });
});
