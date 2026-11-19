// The mock covers' fetch script (scripts/fetch-mock-covers.ts), with a fake
// fetch and JPEG-shaped buffers: no network.
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fetchMockCovers, main, parseCoverList, pictureOf } from '../../scripts/fetch-mock-covers';

const segment = (marker: number, payload: number[]) => [
  0xff,
  marker,
  (payload.length + 2) >> 8,
  (payload.length + 2) & 0xff,
  ...payload,
];

/**
 * A tiny JPEG-shaped buffer: SOI, an APP1 holding `metadata`, tables, a
 * frame header of `width` x `height`, a scan (with a stuffed 0xFF00 and a
 * restart in its data) and EOI.
 */
function jpeg(options: { metadata?: number[]; scan?: number[]; width?: number; height?: number }) {
  const {
    metadata = [1, 2, 3],
    scan = [0x11, 0xff, 0x00, 0x22, 0xff, 0xd0, 0x33],
    width = 8,
  } = options;
  const { height = 6 } = options;
  return Uint8Array.from([
    0xff,
    0xd8,
    ...segment(0xe1, metadata),
    ...segment(0xfe, [...metadata].reverse()),
    ...segment(0xdb, [0, 16, 11, 12]),
    ...segment(0xc0, [8, height >> 8, height & 0xff, width >> 8, width & 0xff, 1, 1, 0x11, 0]),
    ...segment(0xc4, [0, 1, 2]),
    ...segment(0xda, [1, 1, 0, 0, 63, 0]),
    ...scan,
    0xff,
    0xd9,
  ]);
}

const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

function entryFor(slug: string, bytes: Uint8Array, coverPath = `Music/${slug}.jpg`) {
  return { slug, path: coverPath, ...pictureOf(bytes) };
}

/** A fake fetch answering each URL from `answers` (a status, or the bytes of a 200). */
function fakeFetch(answers: Record<string, (number | Uint8Array)[]>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const queue = answers[url] ?? [404];
    const next = (queue.length > 1 ? queue.shift() : queue[0]) ?? 404;
    if (typeof next === 'number') {
      return { ok: false, status: next, headers: { get: () => null }, body: null };
    }
    return {
      ok: true,
      status: 200,
      headers: { get: () => String(next.length) },
      body: (async function* () {
        yield next;
      })(),
    };
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const URL_OF = (slug: string) =>
  `https://is1-ssl.mzstatic.com/image/thumb/Music/${slug}.jpg/1000x1000bb.jpg`;

let folder: string;
beforeEach(() => {
  folder = mkdtempSync(path.join(tmpdir(), 'mock-covers-'));
});
afterEach(() => {
  rmSync(folder, { recursive: true, force: true });
});

describe('pictureOf', () => {
  test('reads the size from the frame header', () => {
    expect(pictureOf(jpeg({ width: 300, height: 200 }))).toMatchObject({ width: 300, height: 200 });
  });

  test('ignores metadata segments but not the picture', () => {
    const base = pictureOf(jpeg({}));
    expect(pictureOf(jpeg({ metadata: [9, 9, 9, 9, 9, 9, 9] })).pictureHash).toBe(base.pictureHash);
    expect(pictureOf(jpeg({ scan: [0x11, 0x22] })).pictureHash).not.toBe(base.pictureHash);
    expect(pictureOf(jpeg({ width: 9 })).pictureHash).not.toBe(base.pictureHash);
  });

  test.each([
    ['empty', []],
    ['not a JPEG', [1, 2, 3, 4, 5]],
    ['cut off inside a segment', [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x40, 1, 2]],
    ['no EOI', [0xff, 0xd8, ...segment(0xc0, [8, 0, 6, 0, 8, 1, 1, 0x11, 0])]],
    ['no frame', [0xff, 0xd8, ...segment(0xe0, [1]), 0xff, 0xd9]],
    ['junk between segments', [0xff, 0xd8, 0x00, 0x01, 0xff, 0xd9]],
  ])('refuses %s', (_name, bytes) => {
    expect(() => pictureOf(Uint8Array.from(bytes))).toThrow(/not a whole JPEG/);
  });
});

describe('parseCoverList', () => {
  const good = {
    slug: 'a-b',
    path: 'Music/x.jpg',
    width: 10,
    height: 10,
    pictureHash: 'a'.repeat(64),
  };

  test('accepts a well-formed list', () => {
    expect(parseCoverList(JSON.stringify([good]))).toEqual([good]);
  });

  test.each([
    ['not JSON', 'nope'],
    ['not a list', '{}'],
    ['empty', '[]'],
    ['an entry that is not an object', '[1]'],
    ['an upper-case slug', JSON.stringify([{ ...good, slug: 'A' }])],
    ['a slug with a dot', JSON.stringify([{ ...good, slug: '../x' }])],
    ['a repeated slug', JSON.stringify([good, good])],
    ['a path that climbs', JSON.stringify([{ ...good, path: 'a/../b.jpg' }])],
    ['a path with a query', JSON.stringify([{ ...good, path: 'a.jpg?x=1' }])],
    ['an absolute path', JSON.stringify([{ ...good, path: '/etc/passwd' }])],
    ['a size of zero', JSON.stringify([{ ...good, width: 0 }])],
    ['a short hash', JSON.stringify([{ ...good, pictureHash: 'abc' }])],
  ])('refuses %s', (_name, text) => {
    expect(() => parseCoverList(text)).toThrow();
  });
});

describe('fetchMockCovers', () => {
  const bytes = jpeg({});
  const say = jest.fn();
  const run = (list: object[], fn: typeof fetch, update = false) =>
    fetchMockCovers({ listText: JSON.stringify(list), folder, update, fetchFn: fn, say });

  beforeEach(() => say.mockClear());

  test('downloads each cover once, checked against the list, with no redirects', async () => {
    const { fn, calls } = fakeFetch({ [URL_OF('one')]: [bytes] });
    await run([entryFor('one', bytes)], fn);
    expect(readFileSync(path.join(folder, 'one.jpg'))).toEqual(Buffer.from(bytes));
    expect(calls).toHaveLength(1);
    expect(calls[0].init.redirect).toBe('error');
    expect(calls[0].init.signal).toBeDefined();
    expect(readdirSync(folder)).toEqual(['one.jpg']);
  });

  test('a second run downloads nothing but still checks what is on disk', async () => {
    const list = [entryFor('one', bytes)];
    await run(list, fakeFetch({ [URL_OF('one')]: [bytes] }).fn);
    const { fn, calls } = fakeFetch({});
    await run(list, fn);
    expect(calls).toHaveLength(0);
    expect(say).toHaveBeenLastCalledWith('one: on disk, checked');
  });

  test('a corrupt file on disk fails the run instead of being trusted', async () => {
    writeFileSync(path.join(folder, 'one.jpg'), 'garbage');
    const { fn, calls } = fakeFetch({ [URL_OF('one')]: [bytes] });
    await expect(run([entryFor('one', bytes)], fn)).rejects.toThrow(/one\.jpg is corrupt/);
    expect(calls).toHaveLength(0);
  });

  test('a JPEG that is not the listed cover fails when it is on disk', async () => {
    writeFileSync(path.join(folder, 'one.jpg'), jpeg({ width: 9 }));
    await expect(run([entryFor('one', bytes)], fakeFetch({}).fn)).rejects.toThrow(
      /isn't the cover the list names for one/,
    );
  });

  test('a changed picture fails naming the slug and writes nothing', async () => {
    const { fn } = fakeFetch({ [URL_OF('one')]: [jpeg({ scan: [0x55, 0x66] })] });
    await expect(run([entryFor('one', bytes)], fn)).rejects.toThrow(
      "Apple's cover for one changed: run `node scripts/fetch-mock-covers.ts --update` and commit the new list",
    );
    expect(readdirSync(folder)).toEqual([]);
  });

  test('a metadata-only change still passes', async () => {
    const { fn } = fakeFetch({ [URL_OF('one')]: [jpeg({ metadata: [7, 7, 7, 7, 7, 7, 7, 7] })] });
    await run([entryFor('one', bytes)], fn);
    expect(readdirSync(folder)).toEqual(['one.jpg']);
  });

  test('retries once at once on a 5xx, and then gives up', async () => {
    const retried = fakeFetch({ [URL_OF('one')]: [503, bytes] });
    await run([entryFor('one', bytes)], retried.fn);
    expect(retried.calls).toHaveLength(2);

    const failing = fakeFetch({ [URL_OF('two')]: [500] });
    await expect(run([entryFor('two', bytes)], failing.fn)).rejects.toThrow(
      /Couldn't fetch the cover for two: HTTP 500/,
    );
    expect(failing.calls).toHaveLength(2);
  });

  test('retries once on a 429 and on a network error', async () => {
    const limited = fakeFetch({ [URL_OF('one')]: [429, bytes] });
    await run([entryFor('one', bytes)], limited.fn);
    expect(limited.calls).toHaveLength(2);

    let attempts = 0;
    const dropped = (async () => {
      attempts++;
      throw new Error('socket hang up');
    }) as unknown as typeof fetch;
    await expect(run([entryFor('two', bytes)], dropped)).rejects.toThrow(/socket hang up/);
    expect(attempts).toBe(2);
  });

  test('does not retry a 404', async () => {
    const { fn, calls } = fakeFetch({});
    await expect(run([entryFor('one', bytes)], fn)).rejects.toThrow(/HTTP 404/);
    expect(calls).toHaveLength(1);
  });

  test('refuses a body that is not a JPEG, and one over the size cap', async () => {
    const junk = fakeFetch({ [URL_OF('one')]: [Uint8Array.of(1, 2, 3, 4, 5)] });
    await expect(run([entryFor('one', bytes)], junk.fn)).rejects.toThrow(/not a whole JPEG/);

    let attempts = 0;
    const huge = (async () => {
      attempts++;
      return {
        ok: true,
        status: 200,
        headers: { get: () => String(100 * 1024 * 1024) },
        body: null,
      };
    }) as unknown as typeof fetch;
    await expect(run([entryFor('one', bytes)], huge)).rejects.toThrow(/over \d+ bytes/);
    // Not a hiccup: asked once, never retried.
    expect(attempts).toBe(1);

    const streamed = (async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      body: (async function* () {
        yield new Uint8Array(5 * 1024 * 1024);
        yield new Uint8Array(5 * 1024 * 1024);
      })(),
    })) as unknown as typeof fetch;
    await expect(run([entryFor('one', bytes)], streamed)).rejects.toThrow(/over \d+ bytes/);
  });

  test('a hostile slug or path is refused before anything is fetched', async () => {
    const { fn, calls } = fakeFetch({});
    for (const hostile of [
      { slug: '../escape', path: 'Music/x.jpg' },
      { slug: 'one', path: '../../etc/passwd' },
      { slug: 'one', path: 'evil.example.com/../x' },
      { slug: 'one', path: '@evil.example.com/x' },
    ]) {
      await expect(run([{ ...entryFor('one', bytes), ...hostile }], fn)).rejects.toThrow();
    }
    expect(calls).toHaveLength(0);
    expect(readdirSync(folder)).toEqual([]);
  });

  test('--update re-measures the list from a fresh download and writes no file', async () => {
    const changed = jpeg({ scan: [0x55, 0x66], width: 12, height: 7 });
    const { fn } = fakeFetch({ [URL_OF('one')]: [changed] });
    const text = await run([entryFor('one', bytes)], fn, true);
    expect(JSON.parse(text as string)).toEqual([
      {
        slug: 'one',
        path: 'Music/one.jpg',
        width: 12,
        height: 7,
        pictureHash: pictureOf(changed).pictureHash,
      },
    ]);
    expect(hex(changed)).not.toBe(hex(bytes));
    expect(readdirSync(folder)).toEqual([]);
  });
});

describe('main', () => {
  test('exits 1 saying why when the cover can not be fetched, 0 for none to do', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const realFetch = global.fetch;
    global.fetch = (async () => ({
      ok: false,
      status: 404,
      headers: { get: () => null },
      body: null,
    })) as unknown as typeof fetch;
    try {
      await expect(main([folder])).resolves.toBe(1);
      expect(error).toHaveBeenCalledWith(expect.stringContaining("Couldn't fetch the cover for"));
    } finally {
      global.fetch = realFetch;
      error.mockRestore();
      log.mockRestore();
    }
  });
});
