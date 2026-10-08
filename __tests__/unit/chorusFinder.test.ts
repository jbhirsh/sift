import * as Sentry from '@sentry/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  CHORUS_CACHE_KEY,
  ChorusFinder,
  ChorusFinderDeps,
  chorusFinder,
  MAX_CACHE_ENTRIES,
} from '../../src/services/ChorusFinder';
import { LyricsLookup } from '../../src/services/LrclibClient';
import { Track } from '../../src/types';

const track: Track = {
  id: 't1',
  name: 'My Song',
  artist: 'Artist',
  album: 'Album',
  duration: 200,
  playCount: 0,
  dateAdded: '',
};

// Title line repeats at 50 s and 90 s: the title rule finds 50 s.
const SYNCED = '[00:30.00]verse\n[00:50.00]sing my song\n[01:10.00]verse two\n[01:30.00]sing my song';

function makeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: jest.fn((key: string) => Promise.resolve(data.get(key) ?? null)),
    setItem: jest.fn((key: string, value: string) => {
      data.set(key, value);
      return Promise.resolve();
    }),
  };
}

function makeFinder(lookup: (t: Track) => Promise<LyricsLookup>, storage = makeStorage()) {
  const lookupLyrics = jest.fn(lookup);
  const prioritize = jest.fn();
  const deps = { lookupLyrics, prioritize, storage } as unknown as ChorusFinderDeps;
  const finder = new ChorusFinder(deps);
  return { finder, lookupLyrics, prioritize, storage, deps };
}

const flush = () => new Promise<void>((resolve) => setImmediate(() => resolve()));

beforeEach(() => jest.clearAllMocks());

describe('ChorusFinder', () => {
  it('uses the lyrics chorus, led in by half a second', async () => {
    const { finder } = makeFinder(() => Promise.resolve({ status: 'synced', lyrics: SYNCED }));
    await expect(finder.find(track)).resolves.toEqual({ position: 49.5, source: 'lyrics' });
  });

  it('falls back to the preview offset when the lyrics have no chorus', async () => {
    const { finder } = makeFinder(() => Promise.resolve({ status: 'synced', lyrics: '[00:30.00]once' }));
    const previewOffset = jest.fn().mockResolvedValue(61.25);
    await expect(finder.find(track, previewOffset)).resolves.toEqual({ position: 61.25, source: 'preview' });
    expect(previewOffset).toHaveBeenCalledWith('t1');
  });

  it('only asks for the preview offset when the lyrics fail', async () => {
    const { finder } = makeFinder(() => Promise.resolve({ status: 'synced', lyrics: SYNCED }));
    const previewOffset = jest.fn().mockResolvedValue(61.25);
    await finder.find(track, previewOffset);
    expect(previewOffset).not.toHaveBeenCalled();
  });

  it.each<[string, LyricsLookup]>([
    ['instrumental', { status: 'instrumental' }],
    ['not found', { status: 'not-found' }],
  ])('uses the preview offset for %s tracks', async (_, lookup) => {
    const { finder } = makeFinder(() => Promise.resolve(lookup));
    await expect(finder.find(track, () => Promise.resolve(42))).resolves.toEqual({ position: 42, source: 'preview' });
  });

  it('falls back to the estimate when the preview offset is unusable or missing', async () => {
    const { finder } = makeFinder(() => Promise.resolve({ status: 'not-found' }));
    await expect(finder.find(track, () => Promise.resolve(0))).resolves.toEqual({ position: 40, source: 'estimate' });
    await expect(finder.find({ ...track, id: 't2' }, () => Promise.resolve(null))).resolves.toEqual({
      position: 40,
      source: 'estimate',
    });
    await expect(finder.find({ ...track, id: 't3' })).resolves.toEqual({ position: 40, source: 'estimate' });
  });

  it('keeps an estimate reached because the preview match failed for this session only', async () => {
    const { finder, storage, lookupLyrics, deps } = makeFinder(() => Promise.resolve({ status: 'not-found' }));
    const failing = jest.fn().mockRejectedValue(new Error('shazam down'));
    await expect(finder.find(track, failing)).resolves.toEqual({ position: 40, source: 'estimate' });
    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(expect.objectContaining({ category: 'chorus' }));
    await finder.find(track, failing);
    expect(failing).toHaveBeenCalledTimes(1);
    await flush();
    expect(storage.setItem).not.toHaveBeenCalled();
    // The next launch tries again.
    await new ChorusFinder(deps).find(track, failing);
    expect(lookupLyrics).toHaveBeenCalledTimes(2);
  });

  it('still uses the preview when LRCLIB is unreachable', async () => {
    const { finder, storage } = makeFinder(() => Promise.reject(new Error('offline')));
    await expect(finder.find(track, () => Promise.resolve(42))).resolves.toEqual({ position: 42, source: 'preview' });
    await flush();
    expect(JSON.parse(storage.data.get(CHORUS_CACHE_KEY) ?? 'null')).toEqual([['t1', 42, 'p', 200]]);
  });

  it('caches results, so a track is looked up once', async () => {
    const { finder, lookupLyrics, storage } = makeFinder(() => Promise.resolve({ status: 'synced', lyrics: SYNCED }));
    await finder.find(track);
    await finder.find(track);
    expect(lookupLyrics).toHaveBeenCalledTimes(1);
    await flush();
    expect(JSON.parse(storage.data.get(CHORUS_CACHE_KEY) ?? 'null')).toEqual([['t1', 49.5, 'l', 200]]);
  });

  it('caches estimates reached with LRCLIB answering', async () => {
    const { finder, storage } = makeFinder(() => Promise.resolve({ status: 'not-found' }));
    await finder.find(track);
    await flush();
    expect(JSON.parse(storage.data.get(CHORUS_CACHE_KEY) ?? 'null')).toEqual([['t1', 40, 'e', 200]]);
  });

  it('keeps an estimate reached because LRCLIB was unreachable for this session only', async () => {
    const { finder, lookupLyrics, storage, deps } = makeFinder(() => Promise.reject(new Error('offline')));
    await expect(finder.find(track)).resolves.toEqual({ position: 40, source: 'estimate' });
    await finder.find(track);
    expect(lookupLyrics).toHaveBeenCalledTimes(1);
    await flush();
    expect(storage.setItem).not.toHaveBeenCalled();
    await new ChorusFinder(deps).find(track);
    expect(lookupLyrics).toHaveBeenCalledTimes(2);
  });

  it('re-resolves a session-only result whose track duration changed', async () => {
    const { finder, lookupLyrics } = makeFinder(() => Promise.reject(new Error('offline')));
    await finder.find(track);
    await finder.find({ ...track, duration: 300 });
    expect(lookupLyrics).toHaveBeenCalledTimes(2);
  });

  it('moves an urgent lookup to the front of the queue', async () => {
    const { finder, prioritize } = makeFinder(() => Promise.resolve({ status: 'synced', lyrics: SYNCED }));
    await finder.find(track);
    expect(prioritize).not.toHaveBeenCalled();
    await finder.find({ ...track, id: 't9' }, undefined, { urgent: true });
    expect(prioritize).toHaveBeenCalledWith('t9');
  });

  it('shares one lookup between concurrent requests for a track', async () => {
    let resolve: (l: LyricsLookup) => void = () => {};
    const { finder, lookupLyrics } = makeFinder(() => new Promise((r) => { resolve = r; }));
    const a = finder.find(track);
    const b = finder.find(track);
    await flush();
    resolve({ status: 'synced', lyrics: SYNCED });
    await expect(Promise.all([a, b])).resolves.toEqual([
      { position: 49.5, source: 'lyrics' },
      { position: 49.5, source: 'lyrics' },
    ]);
    expect(lookupLyrics).toHaveBeenCalledTimes(1);
  });

  it('reads results stored by an earlier launch', async () => {
    const storage = makeStorage({ [CHORUS_CACHE_KEY]: JSON.stringify([['t1', 33, 'p', 200]]) });
    const { finder, lookupLyrics } = makeFinder(() => Promise.resolve({ status: 'not-found' }), storage);
    await expect(finder.find(track)).resolves.toEqual({ position: 33, source: 'preview' });
    expect(lookupLyrics).not.toHaveBeenCalled();
    expect(storage.getItem).toHaveBeenCalledTimes(1);
  });

  it('looks a track up again when its duration changed', async () => {
    const storage = makeStorage({ [CHORUS_CACHE_KEY]: JSON.stringify([['t1', 33, 'p', 150]]) });
    const { finder, lookupLyrics } = makeFinder(() => Promise.resolve({ status: 'synced', lyrics: SYNCED }), storage);
    await expect(finder.find(track)).resolves.toEqual({ position: 49.5, source: 'lyrics' });
    expect(lookupLyrics).toHaveBeenCalledTimes(1);
  });

  it('keeps a cached result whose duration differs by under a second', async () => {
    const storage = makeStorage({ [CHORUS_CACHE_KEY]: JSON.stringify([['t1', 33, 'l', 200.6]]) });
    const { finder } = makeFinder(() => Promise.resolve({ status: 'not-found' }), storage);
    await expect(finder.find(track)).resolves.toEqual({ position: 33, source: 'lyrics' });
  });

  it('skips malformed cache rows and survives unreadable caches', async () => {
    const rows = [['ok', 10, 'e', 200], ['bad-source', 10, 'x', 200], ['nan', null, 'l', 200], 'junk', ['short', 1]];
    const storage = makeStorage({ [CHORUS_CACHE_KEY]: JSON.stringify(rows) });
    const { finder, lookupLyrics } = makeFinder(() => Promise.resolve({ status: 'not-found' }), storage);
    await expect(finder.find({ ...track, id: 'ok' })).resolves.toEqual({ position: 10, source: 'estimate' });
    await finder.find({ ...track, id: 'bad-source' });
    expect(lookupLyrics).toHaveBeenCalledTimes(1);

    const corrupt = makeFinder(() => Promise.resolve({ status: 'not-found' }), makeStorage({ [CHORUS_CACHE_KEY]: '{oops' }));
    await expect(corrupt.finder.find(track)).resolves.toEqual({ position: 40, source: 'estimate' });

    const notArray = makeFinder(() => Promise.resolve({ status: 'not-found' }), makeStorage({ [CHORUS_CACHE_KEY]: '{}' }));
    await expect(notArray.finder.find(track)).resolves.toEqual({ position: 40, source: 'estimate' });
  });

  it('trims the oldest entries beyond the cap', async () => {
    const rows = Array.from({ length: MAX_CACHE_ENTRIES }, (_, i) => [`old${i}`, 1, 'e', 200]);
    const storage = makeStorage({ [CHORUS_CACHE_KEY]: JSON.stringify(rows) });
    const { finder } = makeFinder(() => Promise.resolve({ status: 'not-found' }), storage);
    await finder.find(track);
    await flush();
    const saved = JSON.parse(storage.data.get(CHORUS_CACHE_KEY) ?? 'null');
    expect(saved).toHaveLength(MAX_CACHE_ENTRIES);
    expect(saved[0][0]).toBe('old1');
    expect(saved[saved.length - 1]).toEqual(['t1', 40, 'e', 200]);
  });

  it('survives a failed cache write', async () => {
    const storage = makeStorage();
    storage.setItem.mockRejectedValueOnce(new Error('disk full'));
    const { finder } = makeFinder(() => Promise.resolve({ status: 'not-found' }), storage);
    await expect(finder.find(track)).resolves.toEqual({ position: 40, source: 'estimate' });
    await flush();
    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('Chorus cache write failed') }),
    );
  });

  it('defaults to LRCLIB and AsyncStorage', async () => {
    const mockFetch = jest.fn().mockResolvedValue({ status: 404, ok: false, json: () => Promise.resolve(null) });
    const original = globalThis.fetch;
    globalThis.fetch = mockFetch;
    try {
      await expect(chorusFinder.find({ ...track, id: 'default' }, undefined, { urgent: true })).resolves.toEqual({ position: 40, source: 'estimate' });
      expect(mockFetch.mock.calls[0][0]).toContain('https://lrclib.net/api/get?');
      await flush();
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(CHORUS_CACHE_KEY, expect.any(String));
    } finally {
      globalThis.fetch = original;
    }
  });
});
