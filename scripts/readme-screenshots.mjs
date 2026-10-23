// CLI for the README screenshot refresh (.github/workflows/readme-screenshots.yml).
// The rules live in readmeScreenshots.ts, typed and unit-tested; Node 22.18+
// runs it directly. Needs ImageMagick (convert, identify, compare).
//
//   update <shots-dir>
//       Shrinks each README screenshot the E2E job took to the README's
//       width and replaces docs/screenshots/<name>.png when it looks
//       different enough. Prints the replaced files, one per line.
//   body <base-sha> <head-sha> <source-pr> <file>...
//       The bot PR's description for those files. Reads GITHUB_REPOSITORY
//       and RUN_URL.
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  README_SHOTS,
  README_WIDTH,
  needsUpdate,
  parseCompareCount,
  prBody,
} from './readmeScreenshots.ts';

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.error) throw result.error;
  return result;
}

function compareWith(file, candidate) {
  if (!existsSync(file)) return null;
  const size = (path) => run('identify', ['-format', '%w %h', path]).stdout.trim();
  if (size(file) !== size(candidate)) return null;
  const [width, height] = size(candidate).split(' ').map(Number);
  // AE: the count of pixels that differ beyond the fuzz; exit 1 means some
  // do, 2 that it couldn't compare.
  const differing = parseCompareCount(
    run('compare', ['-metric', 'AE', '-fuzz', '2%', candidate, file, 'null:']).stderr,
  );
  return differing === null ? null : { differing, total: width * height };
}

function update(shotsDir) {
  const work = mkdtempSync(join(tmpdir(), 'readme-shots-'));
  const updated = [];
  for (const shot of README_SHOTS) {
    const source = join(shotsDir, shot.shot);
    if (!existsSync(source)) {
      process.stderr.write(
        `::warning::No ${shot.shot} in ${shotsDir}; ${shot.file} stays as it is.\n`,
      );
      continue;
    }
    const candidate = join(work, shot.shot);
    // -strip drops the timestamps and colour profile, so an unchanged
    // screen comes out byte for byte the same.
    const resized = run('convert', [source, '-resize', `${README_WIDTH}x`, '-strip', candidate]);
    if (resized.status !== 0) throw new Error(`convert failed on ${source}: ${resized.stderr}`);
    const comparison = compareWith(shot.file, candidate);
    if (needsUpdate(comparison)) {
      copyFileSync(candidate, shot.file);
      updated.push(shot.file);
    }
    process.stderr.write(
      `${shot.file}: ${comparison ? `${comparison.differing} of ${comparison.total} pixels differ` : 'not comparable'}, ${updated.includes(shot.file) ? 'replaced' : 'kept'}.\n`,
    );
  }
  if (updated.length > 0) process.stdout.write(`${updated.join('\n')}\n`);
}

const [command, ...args] = process.argv.slice(2);
switch (command) {
  case 'update':
    update(args[0]);
    break;
  case 'body': {
    const [baseSha, headSha, sourcePr, ...files] = args;
    process.stdout.write(
      `${prBody({
        repo: process.env.GITHUB_REPOSITORY ?? '',
        updated: README_SHOTS.filter((s) => files.includes(s.file)),
        sourcePr,
        baseSha,
        headSha,
        runUrl: process.env.RUN_URL ?? '',
      })}\n`,
    );
    break;
  }
  default:
    process.stderr.write(
      'Usage: readme-screenshots.mjs update <shots-dir> | body <base> <head> <pr> <file>...\n',
    );
    process.exitCode = 2;
}
