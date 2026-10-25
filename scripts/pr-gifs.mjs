// `node scripts/pr-gifs.mjs <pr> [options]`: a PR's before/after GIFs, made
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
// (one being changed, say).
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const given = process.env.CI_TOOLING_DIR;
const tooling = given ? path.resolve(given) : path.resolve(root, '..', 'ci');
const say = (line) => process.stderr.write(`${line}\n`);

/** Runs git, its output shown; says whether it worked. */
function git(args) {
  return spawnSync('git', args, { stdio: 'inherit' }).status === 0;
}

if (!given) {
  if (existsSync(path.join(tooling, '.git'))) {
    if (!git(['-C', tooling, 'pull', '--ff-only', '--quiet'])) {
      say(`gif: couldn't update ${tooling}; running it as it is`);
    }
  } else if (!git(['clone', '--quiet', 'https://github.com/jbhirsh/ci', tooling])) {
    say(`gif: couldn't clone jbhirsh/ci into ${tooling}`);
    process.exit(1);
  }
}
const cli = path.join(tooling, 'gif', 'cli.mjs');
if (!existsSync(cli)) {
  say(`gif: ${cli} isn't there: is ${tooling} a clone of jbhirsh/ci?`);
  process.exit(1);
}
const result = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, APP_ROOT: root },
});
process.exitCode = result.status ?? 1;
