import {
  DEFAULT_FPS,
  DEFAULT_WIDTH,
  LEAD_S,
  MAX_GIF_BYTES,
  TAIL_S,
  activeWindow,
  finalDelayCs,
  gifFilter,
  keptTimes,
  lastChangeIn,
  markdownTable,
  parseArgs,
  rawUrl,
  sideBySideFilter,
  sizeWarning,
} from '../../scripts/prGifs';

const PALETTE =
  'split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle';

describe('keptTimes', () => {
  it('reads the kept frames\' times from showinfo\'s lines and nothing else', () => {
    const stderr = [
      'Input #0, mov,mp4, from \'clip.mov\':',
      '[Parsed_showinfo_1 @ 0x6000] n:   0 pts:      0 pts_time:0       duration:512',
      '[Parsed_mpdecimate_0 @ 0x6001] pts_time:9.9 drop',
      '[Parsed_showinfo_1 @ 0x6000] n:   1 pts:  30720 pts_time:2.0667  duration:512',
      '[Parsed_showinfo_1 @ 0x6000] n:   2 pts:  61440 pts_time: 4      duration:512',
      'frame=   3 fps=0.0 q=-0.0 Lsize=N/A time=00:00:06.00',
    ].join('\n');
    expect(keptTimes(stderr)).toEqual([0, 2.0667, 4]);
    expect(keptTimes('')).toEqual([]);
  });
});

describe('activeWindow', () => {
  it('keeps from just before the first change to just after the last', () => {
    expect(activeWindow([0, 2, 2.5, 4], 10)).toEqual({ start: 2 - LEAD_S, end: 4 + TAIL_S });
  });

  it('never reaches past either end of the video', () => {
    expect(activeWindow([0, 0.2, 5.6], 6)).toEqual({ start: 0, end: 6 });
  });

  it('ignores the opening still, so a video that never changes has no window', () => {
    expect(activeWindow([0], 6)).toBeNull();
    expect(activeWindow([], 6)).toBeNull();
    expect(activeWindow([0, 3], 6, 0, 0)).toBeNull();
  });

  it('takes the lead and tail it is given, rounded to the millisecond', () => {
    expect(activeWindow([0, 1.23456, 2], 10, 0.1, 0.2)).toEqual({ start: 1.135, end: 2.2 });
  });
});

describe('finalDelayCs and lastChangeIn', () => {
  it('holds the closing still for as long as it lasted, and no longer', () => {
    expect(finalDelayCs(2, 4)).toBe(200);
    expect(finalDelayCs(2, 3.5)).toBe(150);
    // A clock ticking to the end leaves a short last frame: never stretched.
    expect(finalDelayCs(3.4, 3.5)).toBe(10);
    expect(finalDelayCs(3.5, 3.5)).toBe(0);
    expect(finalDelayCs(4, 3.5)).toBe(0);
  });

  it('finds the last change inside the window, relative to its start', () => {
    const times = [0, 2, 3, 4, 9];
    expect(lastChangeIn(times, { start: 1.5, end: 5 })).toBe(2.5);
    // The opening still at 0 is never a change.
    expect(lastChangeIn([0], { start: 0, end: 5 })).toBe(0);
    expect(lastChangeIn([0, 9], { start: 1, end: 5 })).toBe(0);
  });

  it('counts a change right on either edge of the window as inside it', () => {
    expect(lastChangeIn([0, 2, 5], { start: 2, end: 5 })).toBe(3);
    expect(lastChangeIn([0, 2, 6], { start: 2, end: 5 })).toBe(0);
  });
});

describe('the ffmpeg filters', () => {
  it('one GIF: frame rate, still frames dropped, scaled sharp, one palette', () => {
    expect(gifFilter({ width: 360, fps: 15 })).toBe(`fps=15,mpdecimate,scale=360:-1:flags=lanczos,${PALETTE}`);
  });

  it('side by side: each side cut to its window, labelled, the shorter held to the longer\'s length', () => {
    const filter = sideBySideFilter({ width: 720, fps: 15 }, { start: 1, end: 4 }, { start: 2, end: 7 }, "/f/Bold's.ttf", 2.1667);
    const [left, right, joined] = filter.split(';[l][r]')[0].split(';').concat(filter.split(';[l][r]')[1]);
    expect(left).toBe(
      '[0:v]trim=start=1:end=4,setpts=PTS-STARTPTS,fps=15,' +
        // Fitted into one box (360 wide, the taller side's shape), so the
        // two heights always match.
        'scale=360:780:force_original_aspect_ratio=decrease:flags=lanczos,pad=360:780:(ow-iw)/2:(oh-ih)/2,' +
        "drawtext=fontfile='/f/Bold'\\''s.ttf':text='Before':fontsize=22:fontcolor=white:box=1:boxcolor=black@0.55:boxborderw=8:x=(w-text_w)/2:y=12," +
        'tpad=stop_mode=clone:stop_duration=2[l]',
    );
    expect(right).toContain("[1:v]trim=start=2:end=7,");
    expect(right).toContain("text='After'");
    expect(right).toContain('tpad=stop_mode=clone:stop_duration=0[r]');
    expect(joined).toBe(`hstack=inputs=2,mpdecimate,${PALETTE}`);
  });

  it('side by side with no font file leaves the font to ffmpeg', () => {
    const filter = sideBySideFilter({ width: 400, fps: 10 }, { start: 0, end: 1 }, { start: 0, end: 1 }, null, 1.5);
    expect(filter).toContain('scale=200:300:');
    expect(filter).toContain('pad=200:300:');
    expect(filter).toContain("drawtext=text='Before'");
    expect(filter).not.toContain('fontfile');
  });
});

describe('sizeWarning', () => {
  it('warns only over the size a PR may show, saying how to shrink it', () => {
    expect(sizeWarning('a.gif', MAX_GIF_BYTES)).toBeNull();
    expect(sizeWarning('a.gif', 1000)).toBeNull();
    expect(sizeWarning('pr-1/a.gif', 6 * 1024 * 1024)).toBe(
      'pr-1/a.gif is 6.0 MB, over the 5.0 MB a PR may show: try a lower --fps, a narrower --width or a shorter scenario',
    );
  });
});

describe('markdownTable', () => {
  const repo = 'o/r';
  const sha = 'abc123';

  it('a Before | After row per scenario, linked by the commit SHA', () => {
    const table = markdownTable(repo, sha, [
      { name: 'swipe', before: 'pr-1/swipe/before.gif', after: 'pr-1/swipe/after.gif', sideBySide: null },
      { name: 'new-sheet', before: null, after: 'pr-1/new-sheet/after.gif', sideBySide: null },
    ]);
    expect(table.split('\n')).toEqual([
      '| Scenario | Before (`main`) | After |',
      '|---|---|---|',
      `| swipe | <img src="${rawUrl(repo, sha, 'pr-1/swipe/before.gif')}" width="260"> | <img src="https://raw.githubusercontent.com/o/r/abc123/pr-1/swipe/after.gif" width="260"> |`,
      `| new-sheet | (none) | <img src="${rawUrl(repo, sha, 'pr-1/new-sheet/after.gif')}" width="260"> |`,
    ]);
  });

  it('side-by-side GIFs get their own table', () => {
    const table = markdownTable(repo, sha, [
      { name: 'swipe', before: 'b.gif', after: 'a.gif', sideBySide: 's.gif' },
      { name: 'only-after', before: null, after: 'x.gif', sideBySide: null },
    ]);
    expect(table.split('\n')).toEqual([
      '| Scenario | Before / After |',
      '|---|---|',
      `| swipe | <img src="${rawUrl(repo, sha, 's.gif')}" width="520"> |`,
      '',
      '| Scenario | Before (`main`) | After |',
      '|---|---|---|',
      `| only-after | (none) | <img src="${rawUrl(repo, sha, 'x.gif')}" width="260"> |`,
    ]);
  });
});

describe('parseArgs', () => {
  it('takes the PR number and the defaults', () => {
    expect(parseArgs(['189'])).toEqual({
      pr: 189, repo: 'jbhirsh/sift', sideBySide: false, width: DEFAULT_WIDTH, fps: DEFAULT_FPS, noBefore: false,
    });
  });

  it('takes each option, in any order', () => {
    expect(parseArgs(['--side-by-side', '--width', '300', '42', '--fps', '12', '--repo', 'a-b/c.d'])).toEqual({
      pr: 42, repo: 'a-b/c.d', sideBySide: true, width: 300, fps: 12, noBefore: false,
    });
    expect(parseArgs(['7', '--no-before']).noBefore).toBe(true);
  });

  it('turns away what it can\'t use', () => {
    expect(() => parseArgs([])).toThrow('Give the PR number');
    expect(() => parseArgs(['1', '2'])).toThrow('Unknown argument: 2');
    expect(() => parseArgs(['1', '--wat'])).toThrow('Unknown argument: --wat');
    expect(() => parseArgs(['1', '--width'])).toThrow('--width needs a whole number above 0');
    expect(() => parseArgs(['1', '--fps', '0'])).toThrow('--fps needs a whole number above 0');
    expect(() => parseArgs(['1', '--width', '2.5'])).toThrow('--width');
    expect(() => parseArgs(['1', '--repo', 'no slash'])).toThrow('--repo needs owner/name');
    expect(() => parseArgs(['1', '--repo', 'a/b; rm -rf /'])).toThrow('--repo needs owner/name');
    expect(() => parseArgs(['1', '--side-by-side', '--no-before'])).toThrow('--side-by-side needs a before');
  });
});
