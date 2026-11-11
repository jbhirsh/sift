// `npm run pr-gifs -- <pr> [options]`: a PR's before/after GIFs, made
// by the GIF tool in jbhirsh/ci, which this app shares with the owner's
// other apps (gif/videos.mjs there says what it does and which options it
// takes; this app's settings for it are the `gif` key of .github/ci.json).
// What it turns into GIFs stays here: CI records each scenario in e2e/gifs
// on the Simulator, touches drawn (components/TouchOverlay), as a video
// (scripts/take-gifs.sh, the ios-gif-videos artifact), and a run by hand on
// main with gifs_only records the "before".
//
// This only fetches the tool and runs it: it makes sure jbhirsh/ci is cloned
// beside this checkout, as ../ci (cloned if missing, `git pull --ff-only` if
// there, so it follows main as CI does; a pull that fails, offline say, runs
// what's there), then runs ../ci/gif/cli.mjs with APP_ROOT set to this
// checkout. CI_TOOLING_DIR points it at another clone instead, left as it is
// (one being changed, say). Node runs this file as it is (it strips the
// types); its command line is main(), run only when Node runs the file
// (import.meta.main), so the tests call it and prGifs() directly.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Fetches the GIF tool as above and runs it on the checkout `root` with
 * `args`, under `env`; `say` reports what went wrong. Returns the exit
 * code: the tool's own, or 1 when it couldn't be fetched.
 */
export function prGifs(input: {
  root: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  say: (line: string) => void;
}): number {
  const { root, args, env, say } = input;
  // Expo's types make a process.env key they don't name `any`; read it as
  // what Node gives, text or nothing.
  const given = (env as Record<string, string | undefined>).CI_TOOLING_DIR;
  const tooling = given ? path.resolve(given) : path.resolve(root, '..', 'ci');
  // Runs git, its output shown; says whether it worked.
  const git = (gitArgs: string[]) =>
    spawnSync('git', gitArgs, { stdio: 'inherit', env }).status === 0;

  if (!given) {
    if (existsSync(path.join(tooling, '.git'))) {
      if (!git(['-C', tooling, 'pull', '--ff-only', '--quiet'])) {
        say(`gif: couldn't update ${tooling}; running it as it is`);
      }
    } else if (!git(['clone', '--quiet', 'https://github.com/jbhirsh/ci', tooling])) {
      say(`gif: couldn't clone jbhirsh/ci into ${tooling}`);
      return 1;
    }
  }
  const cli = path.join(tooling, 'gif', 'cli.mjs');
  if (!existsSync(cli)) {
    say(`gif: ${cli} isn't there: is ${tooling} a clone of jbhirsh/ci?`);
    return 1;
  }
  const result = spawnSync(process.execPath, [cli, ...args], {
    stdio: 'inherit',
    env: { ...env, APP_ROOT: root },
  });
  return result.status ?? 1;
}

/** The command line: prGifs() on this checkout, with Node's arguments and environment. */
export function main(args = process.argv.slice(2), env = process.env): void {
  process.exitCode = prGifs({
    root: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
    args,
    env,
    say: (line) => process.stderr.write(`${line}\n`),
  });
}

if (import.meta.main) main();
