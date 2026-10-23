// Before/after GIFs for a PR (scripts/pr-gifs.mjs): the pure parts, typed and
// unit-tested (__tests__/unit/prGifs.test.ts). CI records each scenario in
// e2e/gifs on the iOS Simulator, with the touches drawn
// (components/TouchOverlay), as a video (scripts/take-gifs.sh, Maestro's
// startRecording): "after" on
// the PR's own run, "before" on a run by hand on main with the PR's
// scenarios. The CLI turns the two videos into GIFs with ffmpeg, using the
// filters built here. Imports nothing from Node, so it typechecks under the
// app's tsconfig.
//
// - Real speed: the video is real time. Repeated still frames are dropped
//   (mpdecimate) but each kept frame keeps its own timestamp, and the GIF is
//   written with variable frame timing, so a pause lasts as long as it did.
// - Idle ends trimmed: the GIF keeps from LEAD_S before the first change on
//   screen to TAIL_S after the last. No frame is held longer than it was on
//   screen: a forced hold freezes whatever moves (the playback clock) and
//   reads as a stutter at the loop. A scenario that wants a still ending
//   ends on a pause.
// - Sharp: the Simulator records at its native 3x; scaling down with lanczos
//   keeps text crisp.
// - Small: one palette for the whole clip, and per frame only the area that
//   changed is rewritten.

export const LEAD_S = 0.5;
export const TAIL_S = 1;
export const DEFAULT_WIDTH = 360;
export const DEFAULT_FPS = 15;
/** Over this a PR description may not show a GIF. */
export const MAX_GIF_BYTES = 5 * 1024 * 1024;

export interface GifOptions {
  width: number;
  fps: number;
}

export interface Window {
  start: number;
  end: number;
}

/**
 * The timestamps (s) of the frames mpdecimate kept, from ffmpeg's stderr
 * with `showinfo` after it: the first frame, then each one that changed.
 */
export function keptTimes(stderr: string): number[] {
  return [...stderr.matchAll(/Parsed_showinfo\S*\s.*?pts_time:\s*([\d.]+)/g)].map((m) => Number(m[1]));
}

/**
 * The part of the video worth keeping: from just before the first change
 * on screen to just after the last. Null when nothing ever changed.
 */
export function activeWindow(times: number[], duration: number, lead = LEAD_S, tail = TAIL_S): Window | null {
  // The first kept frame is the opening still, not a change.
  const changes = times.slice(1);
  if (changes.length === 0) return null;
  const start = Math.max(0, changes[0] - lead);
  const end = Math.min(duration, changes[changes.length - 1] + tail);
  return end > start ? { start: round3(start), end: round3(end) } : null;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * How long (centiseconds) the GIF's last frame should stay up: as long as
 * it was on screen. A GIF gets a frame's length from the next frame's
 * start, so the closing still (from the last change to the end) would
 * otherwise flash by: ffmpeg's -final_delay holds it. Times are relative to
 * the GIF's start.
 */
export function finalDelayCs(lastChange: number, end: number): number {
  return Math.max(0, Math.round((end - lastChange) * 100));
}

/** The last change on screen inside a window, relative to its start. */
export function lastChangeIn(times: number[], window: Window): number {
  const inside = times.slice(1).filter((t) => t >= window.start && t <= window.end);
  return round3((inside.length > 0 ? inside[inside.length - 1] : window.start) - window.start);
}

/** The palette steps shared by every GIF: one palette, rewrite what changed. */
const PALETTE =
  'split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle';

/** One video to one GIF: real timing, still frames dropped, scaled sharp. */
export function gifFilter({ width, fps }: GifOptions): string {
  return `fps=${fps},mpdecimate,scale=${width}:-1:flags=lanczos,${PALETTE}`;
}

/** A label drawn across the top of a side of the side-by-side GIF. */
function label(text: string, fontfile: string | null): string {
  const font = fontfile ? `fontfile='${fontfile.replace(/'/g, "'\\''")}':` : '';
  return `drawtext=${font}text='${text}':fontsize=22:fontcolor=white:box=1:boxcolor=black@0.55:boxborderw=8:x=(w-text_w)/2:y=12`;
}

/**
 * Before and after next to each other, labelled, playing in step: each
 * side is cut to its own active window and the shorter one holds its last
 * frame until the longer one ends. `aspect` is the taller recording's
 * height over its width: both sides are fitted into that box, as hstack
 * needs equal heights (recordings from different simulators differ).
 */
export function sideBySideFilter(
  { width, fps }: GifOptions,
  before: Window,
  after: Window,
  fontfile: string | null,
  aspect: number,
): string {
  const half = Math.round(width / 2);
  const height = 2 * Math.round((half * aspect) / 2);
  const length = (w: Window) => w.end - w.start;
  const longest = Math.max(length(before), length(after));
  const side = (input: number, w: Window, text: string, out: string) =>
    `[${input}:v]trim=start=${w.start}:end=${w.end},setpts=PTS-STARTPTS,fps=${fps},` +
    `scale=${half}:${height}:force_original_aspect_ratio=decrease:flags=lanczos,` +
    `pad=${half}:${height}:(ow-iw)/2:(oh-ih)/2,${label(text, fontfile)},` +
    `tpad=stop_mode=clone:stop_duration=${round3(longest - length(w))}[${out}]`;
  return [
    side(0, before, 'Before', 'l'),
    side(1, after, 'After', 'r'),
    `[l][r]hstack=inputs=2,mpdecimate,${PALETTE}`,
  ].join(';');
}

/** A warning for a GIF too big for a PR to show, or null. */
export function sizeWarning(path: string, bytes: number): string | null {
  if (bytes <= MAX_GIF_BYTES) return null;
  const mb = (n: number) => (n / 1024 / 1024).toFixed(1);
  return `${path} is ${mb(bytes)} MB, over the ${mb(MAX_GIF_BYTES)} MB a PR may show: ` +
    'try a lower --fps, a narrower --width or a shorter scenario';
}

export interface Scenario {
  name: string;
  /** Published paths, relative to the commit, or null for a side not made. */
  before: string | null;
  after: string | null;
  sideBySide: string | null;
}

/** Where a published file is, pinned to the commit that added it. */
export function rawUrl(repo: string, sha: string, path: string): string {
  return `https://raw.githubusercontent.com/${repo}/${sha}/${path}`;
}

/**
 * The PR description's Visual changes table: a row per scenario, linked by
 * the commit's SHA so a later push can't change what an old PR shows.
 */
export function markdownTable(repo: string, sha: string, scenarios: Scenario[]): string {
  const img = (path: string | null, width: number) =>
    path ? `<img src="${rawUrl(repo, sha, path)}" width="${width}">` : '(none)';
  const rows: string[] = [];
  const sideBySide = scenarios.filter((s) => s.sideBySide);
  if (sideBySide.length > 0) {
    rows.push('| Scenario | Before / After |', '|---|---|');
    for (const s of sideBySide) rows.push(`| ${s.name} | ${img(s.sideBySide, 520)} |`);
  }
  const pairs = scenarios.filter((s) => !s.sideBySide);
  if (pairs.length > 0) {
    if (rows.length > 0) rows.push('');
    rows.push('| Scenario | Before (`main`) | After |', '|---|---|---|');
    for (const s of pairs) rows.push(`| ${s.name} | ${img(s.before, 260)} | ${img(s.after, 260)} |`);
  }
  return rows.join('\n');
}

export interface CliOptions {
  pr: number;
  repo: string;
  sideBySide: boolean;
  width: number;
  fps: number;
  /** Skip the "before" run: a new screen has nothing on main to compare. */
  noBefore: boolean;
}

export function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    pr: NaN,
    repo: 'jbhirsh/sift',
    sideBySide: false,
    width: DEFAULT_WIDTH,
    fps: DEFAULT_FPS,
    noBefore: false,
  };
  const number = (flag: string, value: string | undefined) => {
    const n = Number(value);
    if (!value || !Number.isInteger(n) || n <= 0) throw new Error(`${flag} needs a whole number above 0`);
    return n;
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--side-by-side') options.sideBySide = true;
    else if (arg === '--no-before') options.noBefore = true;
    else if (arg === '--width') options.width = number(arg, argv[++i]);
    else if (arg === '--fps') options.fps = number(arg, argv[++i]);
    else if (arg === '--repo') {
      const repo = argv[++i];
      if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('--repo needs owner/name');
      options.repo = repo;
    } else if (/^\d+$/.test(arg) && Number.isNaN(options.pr)) options.pr = Number(arg);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (Number.isNaN(options.pr)) throw new Error('Give the PR number');
  if (options.sideBySide && options.noBefore) throw new Error('--side-by-side needs a before');
  return options;
}
