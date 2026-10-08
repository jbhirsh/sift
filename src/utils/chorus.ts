// Chorus detection for the "Start at chorus" setting. Apple publishes no
// chorus timestamps and Apple Music's DRM rules out analysing the audio, so
// the chorus is inferred from synced (LRC) lyrics: a chorus is the block of
// lines a song repeats. Pure functions only; the network lookup and caching
// live in services/ChorusFinder.

export interface LyricLine {
  /** Seconds from the start of the track. */
  time: number;
  text: string;
  /**
   * The line opens a new section: the LRC had a blank line or an empty or
   * "♪" (instrumental) line before it.
   */
  sectionStart?: boolean;
}

export type ChorusMethod = 'title' | 'block' | 'line';

export interface ChorusMatch {
  /** Seconds from the start of the track where the chorus begins. */
  time: number;
  /** Which rule found it, strongest first: see findChorusStart. */
  method: ChorusMethod;
}

/** Earliest a chorus may start, as a fraction of the track. */
export const WINDOW_START = 0.1;
/** Latest a chorus may start: later repeats are usually the outro. */
export const WINDOW_END = 0.6;
/** Never start closer than this to the end of the track. */
export const END_MARGIN_SECONDS = 15;
/** Tracks shorter than this always start at 0:00. */
export const MIN_DURATION_SECONDS = 60;
/** Start this far before the chorus's first line so its first word isn't clipped. */
export const LEAD_IN_SECONDS = 0.5;
/** How far back from a title line a chorus block may extend. */
const MAX_WALKBACK_SECONDS = 30;
/** Title words are compared on this many leading letters ("blinding" ~ "blinded"). */
const STEM_LENGTH = 5;

// [mm:ss], [mm:ss.xx] and the rarer [mm:ss:xx].
const TIME_TAG = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
// Enhanced LRC's per-word timing: "<00:12.34>word".
const WORD_TAG = /<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>/g;
// Common words a title shares with lyrics by chance ("For You", "The One").
const STOP_WORDS = new Set(['the', 'and', 'you', 'for', 'but', 'with', 'your', 'are', 'not', 'all', 'that', 'this']);
const OFFSET_TAG = /^\s*\[offset:\s*([+-]?\d+)\s*\]/im;
const HAS_WORD = /[\p{L}\p{N}]/u;

/**
 * Parse LRC synced lyrics into time-sorted lines. Handles stacked timestamps
 * (`[00:52.10][01:05.20]line`, one line sung twice) and the `[offset:±ms]`
 * header; skips metadata tags. Blank, empty and "♪" lines aren't returned
 * but mark the next line as a section start.
 */
export function parseSyncedLyrics(lrc: string): LyricLine[] {
  const offsetMatch = OFFSET_TAG.exec(lrc);
  // A positive LRC offset means the lyrics should appear earlier.
  const offset = offsetMatch ? Number(offsetMatch[1]) / 1000 : 0;
  const lines: LyricLine[] = [];
  let pendingBreak = false;
  for (const raw of lrc.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '') {
      pendingBreak = true;
      continue;
    }
    const times: number[] = [];
    TIME_TAG.lastIndex = 0;
    let match: RegExpExecArray | null;
    let consumed = 0;
    while ((match = TIME_TAG.exec(line)) !== null && match.index === consumed) {
      const fraction = match[3] ? Number(`0.${match[3]}`) : 0;
      times.push(Number(match[1]) * 60 + Number(match[2]) + fraction);
      consumed = TIME_TAG.lastIndex;
    }
    if (times.length === 0) continue;
    const text = line.slice(consumed).replace(WORD_TAG, '').replace(/\s+/g, ' ').trim();
    if (!HAS_WORD.test(text)) {
      pendingBreak = true;
      continue;
    }
    for (const time of times) {
      const entry: LyricLine = { time: Math.max(0, time - offset), text };
      // Stacked timestamps reuse one line at several points; a break only
      // describes where it sits in the file, so it applies to single ones.
      if (pendingBreak && times.length === 1 && lines.length > 0) entry.sectionStart = true;
      lines.push(entry);
    }
    pendingBreak = false;
  }
  return lines.sort((a, b) => a.time - b.time);
}

/** Lowercase, drop bracketed asides and punctuation, collapse whitespace. */
export function normalizeLyric(text: string): string {
  return text
    .toLowerCase()
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/['’]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The part of a track title a chorus would sing: drops "(feat. …)", "[Live]"
 * and " - Remastered 2011" style suffixes.
 */
export function normalizeTitle(title: string): string {
  return normalizeLyric(title.replace(/\s+-\s+.*$/, ''));
}

/**
 * Whether a normalized lyric line sings the normalized title: the title as a
 * whole-word phrase, or, for titles with two or more distinctive words (over
 * two letters, not a common word like "the" or "you"), each of those words in
 * order, long words by their stem ("blinding lights" in "im blinded by the
 * lights").
 */
export function singsTitle(line: string, title: string): boolean {
  if (` ${line} `.includes(` ${title} `)) return true;
  const titleWords = title.split(' ').filter((w) => w.length > 2 && !STOP_WORDS.has(w));
  if (titleWords.length < 2) return false;
  const lineWords = line.split(' ');
  let from = 0;
  for (const word of titleWords) {
    // Words shorter than a stem must match exactly ("you" is not "youth").
    const matches =
      word.length < STEM_LENGTH
        ? (w: string) => w === word
        : (w: string) => w.startsWith(word.slice(0, STEM_LENGTH));
    const at = lineWords.findIndex((w, i) => i >= from && matches(w));
    if (at === -1) return false;
    from = at + 1;
  }
  return true;
}

/**
 * Where the first chorus starts, from synced lyrics, or null when no rule is
 * confident. Rules, strongest first:
 *
 * - **title**: the earliest repeated line that sings the title, extended back
 *   to the start of its block (see walkBack). Catches songs that repeat a
 *   whole verse, where "most repeated" alone picks the verse.
 * - **block**: the earliest start of the most-repeated run of 2–4 lines.
 * - **line**: the earliest line sung at least three times.
 *
 * Every rule only accepts a start inside 10–60% of the track, which rejects
 * intros and the repeated outro that often out-repeats the chorus. Lines
 * that are only bracketed ad-libs ("(oh)") are ignored throughout.
 */
export function findChorusStart(
  allLines: LyricLine[],
  { title, duration }: { title: string; duration: number },
): ChorusMatch | null {
  if (!(duration >= MIN_DURATION_SECONDS)) return null;
  const lines = withoutAdLibs(allLines);
  if (lines.length === 0) return null;
  const minTime = duration * WINDOW_START;
  const maxTime = duration * WINDOW_END;
  const inWindow = (t: number) => t >= minTime && t <= maxTime;

  const norm = lines.map((l) => normalizeLyric(l.text));
  // positions[i]: every index where line i's text is sung (shared arrays).
  const byText = new Map<string, number[]>();
  const positions = norm.map((n) => {
    const list = byText.get(n) ?? [];
    byText.set(n, list);
    return list;
  });
  positions.forEach((list, i) => list.push(i));
  const count = (i: number) => positions[i].length;

  // Rule 1: title.
  const titleNorm = normalizeTitle(title);
  if (titleNorm.length >= 3) {
    const anchor = norm.findIndex(
      (n, i) => count(i) >= 2 && inWindow(lines[i].time) && singsTitle(n, titleNorm),
    );
    if (anchor !== -1) {
      const start = walkBack(anchor, lines, norm, positions, minTime);
      return { time: lines[start].time, method: 'title' };
    }
  }

  // Rule 2: the most-repeated block of 2–4 lines.
  let best: { index: number; score: number } | null = null;
  for (let i = 0; i < norm.length; i++) {
    if (!inWindow(lines[i].time) || count(i) < 2) continue;
    for (let len = 2; len <= 4 && i + len <= norm.length; len++) {
      const repeats = blockRepeats(norm, i, len);
      if (repeats < 2) break;
      const score = len * repeats;
      if (!best || score > best.score) best = { index: i, score };
    }
  }
  if (best) return { time: lines[best.index].time, method: 'block' };

  // Rule 3: a single line sung three or more times.
  const line = norm.findIndex((_, i) => count(i) >= 3 && inWindow(lines[i].time));
  if (line !== -1) return { time: lines[line].time, method: 'line' };

  return null;
}

/**
 * Drop lines that are only bracketed ad-libs, carrying a section start they
 * opened over to the next sung line.
 */
function withoutAdLibs(lines: LyricLine[]): LyricLine[] {
  const kept: LyricLine[] = [];
  let carryBreak = false;
  for (const line of lines) {
    if (normalizeLyric(line.text) === '') {
      carryBreak = carryBreak || line.sectionStart === true;
      continue;
    }
    kept.push(carryBreak ? { ...line, sectionStart: true } : line);
    carryBreak = false;
  }
  return kept;
}

/** How many non-overlapping times norm[i..i+len) occurs, counting itself. */
function blockRepeats(norm: string[], i: number, len: number): number {
  const block = norm.slice(i, i + len);
  let repeats = 1;
  for (let j = i + len; j + len <= norm.length; j++) {
    if (block.every((n, k) => norm[j + k] === n)) {
      repeats++;
      j += len - 1;
    }
  }
  return repeats;
}

/**
 * Extend a chorus anchor back to the start of its block. Each earlier line
 * joins while all of these hold:
 *
 * - the block hasn't reached a section start (a blank or "♪" line in the LRC);
 * - it is within 30 s of the anchor and inside the chorus window;
 * - it also precedes another occurrence of the anchor at the same distance;
 * - it is sung at least half as often as the anchor. A pre-chorus precedes
 *   the chorus just as consistently but is repeated far less than a title
 *   line the chorus sings twice; half, not equal, because the chorus's own
 *   first line is sung less often than a title line it repeats.
 */
function walkBack(
  anchor: number,
  lines: LyricLine[],
  norm: string[],
  positions: number[][],
  minTime: number,
): number {
  const limit = lines[anchor].time - MAX_WALKBACK_SECONDS;
  const anchorOccurrences = positions[anchor];
  const others = anchorOccurrences.filter((o) => o !== anchor);
  let start = anchor;
  for (let back = 1; anchor - back >= 0; back++) {
    if (lines[start].sectionStart) break;
    const i = anchor - back;
    if (lines[i].time < limit || lines[i].time < minTime) break;
    if (positions[i].length * 2 < anchorOccurrences.length) break;
    if (!others.some((o) => o - back >= 0 && norm[o - back] === norm[i])) break;
    start = i;
  }
  return start;
}

/**
 * Fallback when nothing better is known: about a fifth of the way in, kept
 * between 0:30 and 1:00. #1 hits reach their first chorus at 0:33–0:45 on
 * average (Hit Songs Deconstructed, 2021–2024).
 */
export function estimateChorusStart(duration: number): number {
  if (!(duration >= MIN_DURATION_SECONDS)) return 0;
  return clampStart(Math.min(60, Math.max(30, duration * 0.2)), duration);
}

/**
 * Turn a time into a playback start: never negative, and never within
 * END_MARGIN_SECONDS of the end. Short tracks always start at 0:00.
 */
export function clampStart(time: number, duration: number): number {
  if (!Number.isFinite(time) || !(duration >= MIN_DURATION_SECONDS)) return 0;
  return Math.max(0, Math.min(time, duration - END_MARGIN_SECONDS));
}

/** Playback start for a lyrics match, with a short lead-in. */
export function startFromLyrics(match: ChorusMatch, duration: number): number {
  return clampStart(match.time - LEAD_IN_SECONDS, duration);
}

/**
 * Whether a ShazamKit preview offset is usable as a start: the preview must
 * begin after the very top of the track and leave room before the end.
 */
export function isUsablePreviewOffset(
  offset: number | null | undefined,
  duration: number,
): offset is number {
  return (
    typeof offset === 'number' &&
    Number.isFinite(offset) &&
    duration >= MIN_DURATION_SECONDS &&
    offset >= 1 &&
    offset <= duration - END_MARGIN_SECONDS
  );
}
