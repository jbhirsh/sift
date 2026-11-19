// `node scripts/fetch-mock-covers.ts [--update] [folder]`: the mock library's
// album covers (src/services/mockCovers.json, which MockMusicProvider reads
// too), downloaded from Apple's artwork server into `folder`
// (build/mock-covers) as <slug>.jpg, for CI to put into the E2E app
// (scripts/apply-js-bundle.sh), so no E2E, screenshot, GIF or audit flow
// fetches a cover while it runs. .github/actions/simulator-app runs it,
// with the folder in the Actions cache. Nothing is committed: the covers
// are Apple's, and the repo is public.
//
// Every run checks every cover against the list, the ones already in the
// folder too: a corrupt cache entry fails here rather than being trusted
// from its key. A file is only downloaded when it's missing, and only
// written (to a temp name, then renamed) once its picture matches.
//
// What's compared is the picture, not the file: Apple serves the same URL
// with different metadata bytes (two of the nine covers, 26 bytes inside an
// APP segment, though every pixel is the same), so the hash skips the JPEG's
// APPn and COM segments and covers the rest (tables, frame header, scan
// data), and the size comes from the frame header. No JPEG decoder: this
// runs on the macOS simulator jobs, which install no packages, on Node
// alone. A changed cover fails naming its slug; `--update` rewrites the
// list's sizes and hashes from a fresh download (no folder written), for
// when Apple really changed one.
//
// The list is untrusted (a PR can edit it) and so is Apple's response: the
// host is fixed, the slug and path are checked before they build a file
// name or URL, redirects are refused, and a response is capped in size.
// Node runs this file as it is (it strips the types); its command line is
// main(), run only when Node runs the file (import.meta.main), so the tests
// call fetchMockCovers() directly.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HOST = 'is1-ssl.mzstatic.com';
// The same URL as src/services/mockCovers.ts builds for dev.
const coverURL = (coverPath: string) => `https://${HOST}/image/thumb/${coverPath}/1000x1000bb.jpg`;
/** A cover is ~200 KB to ~1 MB: far more than that is not a cover. */
const MAX_BYTES = 8 * 1024 * 1024;
/** Only ends a hang; a download never succeeds by waiting out this. */
const REQUEST_TIMEOUT_MS = 60_000;

const SLUG = /^[a-z0-9-]+$/;
// Apple's path under /image/thumb/: segments of letters, digits, `_`, `-` and `.`.
const COVER_PATH = /^[A-Za-z0-9_-][A-Za-z0-9_.-]*(\/[A-Za-z0-9_-][A-Za-z0-9_.-]*)*$/;
const HASH = /^[0-9a-f]{64}$/;

export interface CoverEntry {
  slug: string;
  path: string;
  width: number;
  height: number;
  pictureHash: string;
}

/** What a JPEG's picture is: its size and the hash of everything but metadata. */
export interface Picture {
  width: number;
  height: number;
  pictureHash: string;
}

const LIST_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../src/services/mockCovers.json',
);

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isSize = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 && value < 65536;

/** The list as text, checked; throws saying what's wrong with it. */
export function parseCoverList(text: string): CoverEntry[] {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('mockCovers.json is not JSON');
  }
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('mockCovers.json must be a list of covers');
  }
  const seen = new Set<string>();
  return raw.map((item: unknown, index: number): CoverEntry => {
    if (!isObject(item)) throw new Error(`mockCovers.json entry ${index} is not an object`);
    const { slug, path: coverPath, width, height, pictureHash } = item;
    if (typeof slug !== 'string' || !SLUG.test(slug)) {
      throw new Error(`mockCovers.json entry ${index}: the slug must match ${SLUG}`);
    }
    if (seen.has(slug)) throw new Error(`mockCovers.json lists ${slug} twice`);
    seen.add(slug);
    if (
      typeof coverPath !== 'string' ||
      !COVER_PATH.test(coverPath) ||
      coverPath.split('/').some((part) => part === '..' || part === '.')
    ) {
      throw new Error(`mockCovers.json: the path for ${slug} isn't one of Apple's artwork paths`);
    }
    if (!isSize(width) || !isSize(height)) {
      throw new Error(`mockCovers.json: the size for ${slug} must be whole pixels`);
    }
    if (typeof pictureHash !== 'string' || !HASH.test(pictureHash)) {
      throw new Error(`mockCovers.json: the pictureHash for ${slug} must be 64 hex digits`);
    }
    return { slug, path: coverPath, width, height, pictureHash };
  });
}

const isStartOfFrame = (marker: number) =>
  marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

/**
 * A JPEG's size, and the sha256 of it without its metadata: every segment
 * but the APPn (0xE0-0xEF) and COM (0xFE) ones, and the scan data. Throws
 * if the bytes aren't a whole JPEG (no SOI, no frame, no EOI, a segment
 * running past the end).
 */
export function pictureOf(bytes: Uint8Array): Picture {
  const bad = (why: string) => new Error(`not a whole JPEG: ${why}`);
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw bad('no SOI');
  const hash = createHash('sha256');
  hash.update(bytes.subarray(0, 2));
  let width = 0;
  let height = 0;
  let sawEnd = false;
  let at = 2;
  while (at < bytes.length) {
    if (bytes[at] !== 0xff) throw bad(`no marker at byte ${at}`);
    // Fill bytes: any number of 0xFF may precede a marker.
    let markerAt = at + 1;
    while (markerAt < bytes.length && bytes[markerAt] === 0xff) markerAt++;
    if (markerAt >= bytes.length) throw bad('ends inside a marker');
    const marker = bytes[markerAt];
    if (marker === 0xd9) {
      hash.update(Uint8Array.of(0xff, 0xd9));
      sawEnd = true;
      break;
    }
    // Markers with no length: TEM, RSTn, SOI.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      hash.update(Uint8Array.of(0xff, marker));
      at = markerAt + 1;
      continue;
    }
    if (markerAt + 2 >= bytes.length) throw bad('ends inside a segment header');
    const length = (bytes[markerAt + 1] << 8) | bytes[markerAt + 2];
    const end = markerAt + 1 + length;
    if (length < 2 || end > bytes.length) throw bad('a segment runs past the end');
    const metadata = (marker >= 0xe0 && marker <= 0xef) || marker === 0xfe;
    if (isStartOfFrame(marker)) {
      if (length < 7) throw bad('a short frame header');
      height = (bytes[markerAt + 4] << 8) | bytes[markerAt + 5];
      width = (bytes[markerAt + 6] << 8) | bytes[markerAt + 7];
    }
    let next = end;
    if (marker === 0xda) {
      // The scan's data runs to the next marker that isn't a stuffed 0xFF00
      // or a restart.
      while (next < bytes.length) {
        if (bytes[next] === 0xff && bytes[next + 1] !== 0x00) {
          const following = bytes[next + 1];
          if (following === undefined) break;
          if (following < 0xd0 || following > 0xd7) break;
        }
        next++;
      }
    }
    if (!metadata) hash.update(bytes.subarray(markerAt - 1, next));
    at = next;
  }
  if (!sawEnd) throw bad('no EOI');
  if (width === 0 || height === 0) throw bad('no frame header');
  return { width, height, pictureHash: hash.digest('hex') };
}

/** A response bigger than the cap: not a hiccup, so never retried. */
class TooBig extends Error {}

/** Reads a response's body, refusing more than `max` bytes as they arrive. */
async function readCapped(response: Response, max: number): Promise<Uint8Array> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > max) throw new TooBig(`over ${max} bytes`);
  if (!response.body) return new Uint8Array(0);
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of response.body) {
    total += chunk.length;
    if (total > max) throw new TooBig(`over ${max} bytes`);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * One cover's bytes, or throws saying why not. Retried once at once (no
 * pause) on a network error (a refused redirect included), a 429 or a 5xx;
 * a 404 and an oversized body fail first time.
 */
async function download(fetchFn: typeof fetch, entry: CoverEntry): Promise<Uint8Array> {
  const url = coverURL(entry.path);
  if (new URL(url).host !== HOST) throw new Error("not Apple's artwork host");
  let failure = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetchFn(url, {
        redirect: 'error',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (response.ok) return await readCapped(response, MAX_BYTES);
      failure = `HTTP ${response.status}`;
      if (response.status !== 429 && response.status < 500) break;
    } catch (error) {
      if (error instanceof TooBig) throw error;
      failure = error instanceof Error ? error.message : String(error);
    }
  }
  throw new Error(failure);
}

export interface FetchOptions {
  /** The list, as text. */
  listText: string;
  /** Where the covers go (not used with `update`). */
  folder: string;
  /** Rewrite the list's sizes and hashes from a fresh download instead of checking. */
  update?: boolean;
  fetchFn?: typeof fetch;
  say: (line: string) => void;
}

/**
 * Checks (or with `update`, re-measures) every cover; returns the list's
 * new text under `update`, else undefined. Throws naming the slug on the
 * first cover that's wrong.
 */
export async function fetchMockCovers(options: FetchOptions): Promise<string | undefined> {
  const { listText, folder, update = false, fetchFn = fetch, say } = options;
  const entries = parseCoverList(listText);
  if (!update) mkdirSync(folder, { recursive: true });
  const measured: CoverEntry[] = [];
  for (const entry of entries) {
    const file = path.join(folder, `${entry.slug}.jpg`);
    const changed = `Apple's cover for ${entry.slug} changed: run \`node scripts/fetch-mock-covers.ts --update\` and commit the new list`;
    const same = (picture: Picture) =>
      picture.pictureHash === entry.pictureHash &&
      picture.width === entry.width &&
      picture.height === entry.height;

    if (!update && existsSync(file)) {
      let onDisk: Picture;
      try {
        onDisk = pictureOf(readFileSync(file));
      } catch (error) {
        throw new Error(
          `${file} is corrupt (${(error as Error).message}): delete it and the cache entry`,
          { cause: error },
        );
      }
      if (!same(onDisk)) {
        throw new Error(
          `${file} isn't the cover the list names for ${entry.slug}: delete it and the cache entry`,
        );
      }
      say(`${entry.slug}: on disk, checked`);
      continue;
    }

    let bytes: Uint8Array;
    let picture: Picture;
    try {
      bytes = await download(fetchFn, entry);
      picture = pictureOf(bytes);
    } catch (error) {
      throw new Error(`Couldn't fetch the cover for ${entry.slug}: ${(error as Error).message}`, {
        cause: error,
      });
    }
    if (update) {
      measured.push({ ...entry, ...picture });
      say(`${entry.slug}: ${picture.width}x${picture.height}`);
      continue;
    }
    if (!same(picture)) throw new Error(changed);
    const temp = `${file}.part`;
    writeFileSync(temp, bytes);
    renameSync(temp, file);
    say(`${entry.slug}: downloaded`);
  }
  return update ? `${JSON.stringify(measured, null, 2)}\n` : undefined;
}

/** The command line: `[--update] [folder]`. Returns the exit code. */
export async function main(argv: string[]): Promise<number> {
  const update = argv.includes('--update');
  const folder = argv.find((arg) => !arg.startsWith('--')) ?? 'build/mock-covers';
  try {
    const rewritten = await fetchMockCovers({
      listText: readFileSync(LIST_PATH, 'utf8'),
      folder,
      update,
      say: (line) => console.log(line),
    });
    if (rewritten !== undefined) {
      writeFileSync(LIST_PATH, rewritten);
      console.log(`Rewrote ${LIST_PATH}`);
    }
    return 0;
  } catch (error) {
    console.error(`::error::${(error as Error).message}`);
    return 1;
  }
}

if (import.meta.main) {
  void main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
