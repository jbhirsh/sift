// One command for a PR's before/after GIFs (CLAUDE.md, "Show UI changes in
// the PR"). The rules and ffmpeg filters live in prGifs.ts, typed and
// unit-tested; Node 22.18+ runs it directly. Needs gh (signed in), git,
// unzip and ffmpeg.
//
//   node scripts/pr-gifs.mjs <pr> [--side-by-side] [--no-before] [--width 360] [--fps 15]
//
// 1. "After": waits for the PR head's CI run and takes its ios-gif-videos
//    artifact (scripts/take-gifs.sh records every scenario in e2e/gifs on
//    the Simulator, touches drawn by components/TouchOverlay). A scenario
//    that stopped early was set aside there and is left out here.
// 2. "Before": runs CI by hand on main with gifs_only and the PR's
//    scenarios (gif_scenarios_from), so the same steps play against main's
//    app, and takes that run's artifact.
// 3. Turns each video into a GIF: idle ends trimmed, still frames dropped
//    at real timing, scaled sharp (prGifs.ts). --side-by-side also joins
//    each pair into one labelled GIF playing in step.
// 4. Commits them to the `screenshots` branch under pr-<n>/<scenario>/ and
//    prints the Visual changes table, linked by that commit's SHA.
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { setTimeout as sleep } from 'node:timers/promises';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import {
  activeWindow,
  cutFilter,
  finalDelayCs,
  gifFilter,
  keptStretches,
  keptTimes,
  lastChangeIn,
  markdownTable,
  parseArgs,
  rawUrl,
  ringPixels,
  sideBySideFilter,
  sizeWarning,
  touchSpans,
} from './prGifs.ts';

const POLL_MS = 30_000;
const WAIT_LIMIT_MS = 3 * 60 * 60 * 1000;
const FONT =
  [
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
  ].find((path) => existsSync(path)) ?? null;

const log = (line) => process.stderr.write(`${line}\n`);

function run(cmd, args, { input, allowFail = false } = {}) {
  const result = spawnSync(cmd, args, { encoding: 'utf8', input, maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0 && !allowFail) {
    throw new Error(
      `${cmd} ${args.slice(0, 4).join(' ')} failed: ${(result.stderr || result.stdout || '').slice(0, 500)}`,
    );
  }
  return result;
}
const gh = (args, opts) => run('gh', ['api', ...args], opts).stdout;
const ghJson = (args) => JSON.parse(gh(args));

async function waitForRun(repo, runId) {
  const startedAt = Date.now();
  for (;;) {
    const r = ghJson([`repos/${repo}/actions/runs/${runId}`]);
    if (r.status === 'completed') {
      if (r.conclusion === 'cancelled')
        throw new Error(`Run ${runId} was cancelled before it finished: run this again`);
      // A red run (a failing test, say) still records its GIFs.
      if (r.conclusion !== 'success')
        log(`  run ${runId} ended ${r.conclusion}; using its videos anyway`);
      return r;
    }
    if (Date.now() - startedAt > WAIT_LIMIT_MS)
      throw new Error(`Run ${runId} still ${r.status} after 3 h`);
    log(`  run ${runId}: ${r.status}…`);
    await sleep(POLL_MS);
  }
}

function downloadVideos(repo, runId, into) {
  const artifacts = ghJson([`repos/${repo}/actions/runs/${runId}/artifacts`]).artifacts;
  const artifact = artifacts.find((a) => a.name === 'ios-gif-videos');
  if (!artifact) throw new Error(`Run ${runId} has no ios-gif-videos artifact`);
  const zip = join(into, 'videos.zip');
  // Binary: straight to a file, not through a string.
  const r = spawnSync('gh', ['api', `repos/${repo}/actions/artifacts/${artifact.id}/zip`], {
    maxBuffer: 1024 ** 3,
  });
  if (r.status !== 0) throw new Error(`Downloading the videos of run ${runId} failed`);
  writeFileSync(zip, r.stdout);
  run('unzip', ['-q', '-o', zip, '-d', into]);
  const failed = join(into, 'failed');
  for (const f of existsSync(failed) ? readdirSync(failed) : []) {
    log(
      `  warning: run ${runId}'s ${basename(f, '.mp4')} stopped before its last step; no GIF of it`,
    );
  }
  return Object.fromEntries(
    readdirSync(into)
      .filter((f) => f.endsWith('.mp4'))
      .map((f) => [basename(f, '.mp4'), join(into, f)]),
  );
}

/** The PR head's CI run: the newest pull_request run on that commit. */
async function afterRun(repo, sha) {
  for (const startedAt = Date.now(); ;) {
    const runs = ghJson([
      `repos/${repo}/actions/workflows/ci.yml/runs?head_sha=${sha}&event=pull_request&per_page=5`,
    ]).workflow_runs;
    if (runs.length > 0) return runs[0];
    if (Date.now() - startedAt > WAIT_LIMIT_MS) throw new Error(`No CI run for ${sha}`);
    log(`  waiting for CI to start on ${sha.slice(0, 7)}…`);
    await sleep(POLL_MS);
  }
}

const dispatchRuns = (repo) =>
  ghJson([
    `repos/${repo}/actions/workflows/ci.yml/runs?event=workflow_dispatch&branch=main&per_page=5`,
  ]).workflow_runs;

/** Runs CI by hand on main, recording the PR's scenarios only. */
async function beforeRun(repo, sha) {
  // Runs by hand before this one, so a run found later is ours (not
  // another dispatch's, and with no trust in the local clock).
  const newestBefore = Math.max(0, ...dispatchRuns(repo).map((r) => r.id));
  // Inputs go as strings (-f): the dispatch API turns away a JSON boolean.
  const dispatch = [
    '-X',
    'POST',
    `repos/${repo}/actions/workflows/ci.yml/dispatches`,
    '-f',
    'ref=main',
    '-f',
    'inputs[gifs_only]=true',
    '-f',
    `inputs[gif_scenarios_from]=${sha}`,
  ];
  // GitHub names the run it started when asked; if it turns the question
  // away (422: nothing was dispatched), ask without it.
  let reply = run('gh', ['api', ...dispatch, '-F', 'return_run_details=true'], { allowFail: true });
  if (reply.status !== 0 && /422|return_run_details/.test(reply.stderr))
    reply = run('gh', ['api', ...dispatch]);
  else if (reply.status !== 0)
    throw new Error(`Starting the run on main failed: ${reply.stderr.slice(0, 500)}`);
  const named = reply.stdout.trim() ? JSON.parse(reply.stdout).workflow_run_id : undefined;
  if (named) return { id: named };
  for (const startedAt = Date.now(); ;) {
    const found = dispatchRuns(repo)
      .filter((r) => r.id > newestBefore)
      .sort((a, b) => a.id - b.id)[0];
    if (found) return found;
    if (Date.now() - startedAt > 5 * 60 * 1000) throw new Error('The run on main never started');
    await sleep(5000);
  }
}

/** Each frame's ring-pixel count, streamed from ffmpeg at a third of the size. */
async function ringCounts(video) {
  const [w, h] = run('ffprobe', [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=width,height',
    '-of',
    'csv=p=0',
    video,
  ])
    .stdout.trim()
    .split(',')
    .map(Number);
  const width = 2 * Math.round(w / 6);
  const height = 2 * Math.round(h / 6);
  const frameBytes = width * height * 3;
  const times = run('ffprobe', [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'frame=pts_time',
    '-of',
    'csv=p=0',
    video,
  ])
    .stdout.split(/\s+/)
    .filter(Boolean)
    .map((t) => Number(t.replace(/,$/, '')));
  const counts = [];
  const decoder = spawn('ffmpeg', [
    '-v',
    'error',
    '-i',
    video,
    '-vf',
    `scale=${width}:${height}`,
    '-fps_mode',
    'passthrough',
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgb24',
    '-',
  ]);
  let pending = Buffer.alloc(0);
  for await (const chunk of decoder.stdout) {
    pending = Buffer.concat([pending, chunk]);
    while (pending.length >= frameBytes) {
      counts.push(ringPixels(pending.subarray(0, frameBytes)));
      pending = pending.subarray(frameBytes);
    }
  }
  const code = await new Promise((resolve) => decoder.on('close', resolve));
  if (code !== 0) throw new Error(`decoding ${basename(video)} failed`);
  return { times: times.slice(0, counts.length), counts };
}

/**
 * The video with the waits between its touches cut (prGifs.ts), or the
 * video itself when no touch shows in it.
 */
async function cutWaits(video) {
  const duration = Number(
    run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', video])
      .stdout,
  );
  const { times, counts } = await ringCounts(video);
  const stretches = keptStretches(touchSpans(times, counts), duration);
  if (!stretches) {
    log(
      `  ${basename(video)}: no drawn touch found (was it launched with SiftShowTouches?); keeping its whole length`,
    );
    return video;
  }
  const out = video.replace(/\.mp4$/, '.cut.mp4');
  run('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    video,
    '-filter_complex',
    cutFilter(stretches),
    '-map',
    '[cut]',
    '-fps_mode',
    'vfr',
    '-c:v',
    'libx264',
    '-crf',
    '12',
    '-preset',
    'veryfast',
    out,
  ]);
  const kept = stretches.reduce((sum, w) => sum + w.end - w.start, 0);
  log(
    `  ${basename(video)}: ${stretches.length} touch stretch(es) kept, ${kept.toFixed(1)} s of ${duration.toFixed(1)} s`,
  );
  return out;
}

/** Where a video changes, and the window worth keeping. */
function analyse(video) {
  const probe = run(
    'ffmpeg',
    ['-hide_banner', '-i', video, '-vf', 'mpdecimate,showinfo', '-f', 'null', '-'],
    { allowFail: true },
  );
  const duration = Number(
    run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', video])
      .stdout,
  );
  const times = keptTimes(probe.stderr);
  return { times, window: activeWindow(times, duration) };
}

function makeGif(video, out, options) {
  const { times, window } = analyse(video);
  if (!window) throw new Error('nothing ever changed on screen');
  const finalDelay = finalDelayCs(lastChangeIn(times, window), window.end - window.start);
  run('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-ss',
    String(window.start),
    '-to',
    String(window.end),
    '-i',
    video,
    '-vf',
    gifFilter(options),
    '-fps_mode',
    'vfr',
    '-final_delay',
    String(finalDelay),
    '-loop',
    '0',
    out,
  ]);
  return { times, window };
}

/** A video's height over its width. */
function aspect(video) {
  const [w, h] = run('ffprobe', [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=width,height',
    '-of',
    'csv=p=0',
    video,
  ])
    .stdout.trim()
    .split(',')
    .map(Number);
  return h / w;
}

function makeSideBySide(before, after, out, options) {
  const length = (s) => s.window.end - s.window.start;
  const longest = Math.max(length(before.analysis), length(after.analysis));
  const lastChange = Math.max(
    lastChangeIn(before.analysis.times, before.analysis.window),
    lastChangeIn(after.analysis.times, after.analysis.window),
  );
  run('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    before.video,
    '-i',
    after.video,
    '-filter_complex',
    sideBySideFilter(
      { ...options, width: options.width * 2 },
      before.analysis.window,
      after.analysis.window,
      FONT,
      Math.max(aspect(before.video), aspect(after.video)),
    ),
    '-fps_mode',
    'vfr',
    '-final_delay',
    String(finalDelayCs(lastChange, longest)),
    '-loop',
    '0',
    out,
  ]);
}

/** The commit adding the files on top of the `screenshots` branch's tip. */
function commitOnTip(files, message, dir) {
  run('git', ['fetch', '-q', 'origin', 'screenshots']);
  const env = { ...process.env, GIT_INDEX_FILE: join(dir, 'index') };
  const git = (args) => {
    const r = spawnSync('git', args, { encoding: 'utf8', env });
    if (r.status !== 0) throw new Error(`git ${args[0]} failed: ${r.stderr}`);
    return r.stdout.trim();
  };
  git(['read-tree', 'origin/screenshots']);
  for (const [path, file] of files) {
    const blob = git(['hash-object', '-w', file]);
    git(['update-index', '--add', '--cacheinfo', `100644,${blob},${path}`]);
  }
  return git(['commit-tree', git(['write-tree']), '-p', 'origin/screenshots', '-m', message]);
}

/** Adds the files to the `screenshots` branch in one commit; returns its SHA. */
function publish(repo, files, message) {
  const origin = run('git', ['remote', 'get-url', 'origin']).stdout.trim();
  if (!origin.replace(/\.git$/, '').endsWith(repo)) {
    throw new Error(`This clone's origin (${origin}) isn't ${repo}, where the links will point`);
  }
  const dir = mkdtempSync(join(tmpdir(), 'pr-gifs-index-'));
  try {
    for (let attempt = 1; ; attempt += 1) {
      const commit = commitOnTip(files, message, dir);
      const push = spawnSync('git', ['push', '-q', 'origin', `${commit}:refs/heads/screenshots`], {
        encoding: 'utf8',
      });
      const remote = run('git', ['ls-remote', 'origin', 'refs/heads/screenshots']).stdout;
      if (remote.startsWith(commit)) return commit;
      // Only a branch that moved on is worth another go, on its new tip.
      const moved = !remote.startsWith(
        run('git', ['rev-parse', 'origin/screenshots']).stdout.trim(),
      );
      if (!moved || attempt >= 3) {
        throw new Error(
          `Pushing to the screenshots branch failed: ${(push.stderr || push.stdout || '').trim().slice(-800)}`,
        );
      }
      log('  the screenshots branch moved on; adding the GIFs to its new tip…');
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { repo, pr } = options;
  if (
    options.sideBySide &&
    !/\sdrawtext\s/.test(run('ffmpeg', ['-hide_banner', '-filters']).stdout)
  ) {
    throw new Error(
      '--side-by-side labels each side with drawtext, which this ffmpeg lacks (build it with freetype)',
    );
  }
  const head = ghJson([`repos/${repo}/pulls/${pr}`]).head.sha;
  const work = mkdtempSync(join(tmpdir(), `pr-gifs-${pr}-`));
  try {
    log(`PR #${pr} at ${head.slice(0, 7)}: waiting for its CI run (after)…`);
    const afterId = (await afterRun(repo, head)).id;
    const beforeId = options.noBefore ? null : (await beforeRun(repo, head)).id;
    if (beforeId) log(`Recording the same scenarios on main: run ${beforeId} (before)…`);
    const [afterDone, beforeDone] = await Promise.all([
      waitForRun(repo, afterId),
      beforeId ? waitForRun(repo, beforeId) : Promise.resolve(null),
    ]);
    const afterVideos = downloadVideos(repo, afterDone.id, mkdtempSync(join(work, 'after-')));
    const beforeVideos = beforeDone
      ? downloadVideos(repo, beforeDone.id, mkdtempSync(join(work, 'before-')))
      : {};
    const names = Object.keys(afterVideos).sort();
    if (names.length === 0) throw new Error('The PR run recorded no GIF scenarios (e2e/gifs)');

    // Cut each recording's waits for Maestro, found by its drawn touches.
    for (const videos of [afterVideos, beforeVideos]) {
      for (const [name, video] of Object.entries(videos)) {
        try {
          videos[name] = await cutWaits(video);
        } catch (err) {
          log(`  warning: ${name}: cutting its waits failed (${err.message}); keeping it whole`);
        }
      }
    }

    const files = [];
    const scenarios = [];
    // One video that can't be made into a GIF is a warning; the rest go on.
    const attempt = (what, make) => {
      try {
        return make();
      } catch (err) {
        log(`  warning: ${what}: ${err.message}`);
        return null;
      }
    };
    for (const name of names) {
      const dir = `pr-${pr}/${name}`;
      const gif = (side) => {
        const video = (side === 'after' ? afterVideos : beforeVideos)[name];
        const out = join(work, `${name}-${side}.gif`);
        const analysis = attempt(`${name} (${side})`, () => makeGif(video, out, options));
        if (!analysis) return null;
        files.push([`${dir}/${side}.gif`, out]);
        return { video, analysis };
      };
      const after = gif('after');
      if (!after) continue;
      let before = null;
      if (beforeVideos[name]) before = gif('before');
      else if (!options.noBefore)
        log(`  ${name}: main has no recording of it (a new scenario?); after only`);
      let sideBySide = null;
      if (options.sideBySide && before) {
        const out = join(work, `${name}-side-by-side.gif`);
        if (
          attempt(
            `${name} (side by side)`,
            () => makeSideBySide(before, after, out, options) ?? true,
          )
        ) {
          files.push([`${dir}/side-by-side.gif`, out]);
          sideBySide = `${dir}/side-by-side.gif`;
        }
      }
      scenarios.push({
        name,
        before: before ? `${dir}/before.gif` : null,
        after: `${dir}/after.gif`,
        sideBySide,
      });
    }
    if (scenarios.length === 0) throw new Error('No GIF could be made');

    for (const [path, file] of files) {
      const warning = sizeWarning(path, statSync(file).size);
      if (warning) log(`  warning: ${warning}`);
    }
    const sha = publish(
      repo,
      files,
      `Add PR #${pr}'s GIFs (CI runs ${afterDone.id}${beforeDone ? `, ${beforeDone.id}` : ''})`,
    );
    for (const [path] of files) {
      const status = run(
        'curl',
        ['-s', '-o', '/dev/null', '-w', '%{http_code}', rawUrl(repo, sha, path)],
        { allowFail: true },
      ).stdout;
      if (status !== '200') log(`  warning: ${path} answered ${status}`);
    }
    process.stdout.write(`${markdownTable(repo, sha, scenarios)}\n`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

main().catch((err) => {
  process.stderr.write(`${err.message}\n`);
  process.exitCode = 1;
});
