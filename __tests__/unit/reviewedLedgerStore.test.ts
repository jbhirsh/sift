import * as Sentry from '@sentry/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  loadReviewedIds,
  markReviewed,
  storedReviewedIds,
  takenBack,
  unmarkReviewed,
} from '../../src/services/ReviewedLedgerStore';

jest.mock('@sentry/react-native', () => ({
  captureException: jest.fn(),
}));

const getItem = AsyncStorage.getItem as jest.Mock;
const setItem = AsyncStorage.setItem as jest.Mock;
const KEY = 'sift_reviewed_ledger';

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

describe('ReviewedLedgerStore', () => {
  test('an empty ledger has nothing reviewed', async () => {
    await expect(loadReviewedIds('apple-music:library')).resolves.toEqual(new Set());
  });

  test('a kept song is remembered for its source only', async () => {
    await markReviewed('apple-music:library', 'a');
    await expect(loadReviewedIds('apple-music:library')).resolves.toEqual(new Set(['a']));
    await expect(loadReviewedIds('apple-music:playlist:p1')).resolves.toEqual(new Set());
  });

  test('keeps made while a write is running share one follow-up write, and none are lost', async () => {
    const first = markReviewed('apple-music:library', 'a');
    const second = markReviewed('apple-music:library', 'b');
    const third = markReviewed('other', 'c');
    await Promise.all([first, second, third]);
    // The first keep is written at once; the two behind it go together.
    expect(setItem).toHaveBeenCalledTimes(2);
    expect(JSON.parse(setItem.mock.calls[0][1])).toEqual({ 'apple-music:library': ['a'] });
    expect(JSON.parse(setItem.mock.calls[1][1])).toEqual({ 'apple-music:library': ['a', 'b'], other: ['c'] });
    // A later keep starts a new write on top of the stored ledger.
    await markReviewed('apple-music:library', 'd');
    await expect(loadReviewedIds('apple-music:library')).resolves.toEqual(new Set(['a', 'b', 'd']));
  });

  test('a keep that arrives mid-write is written by a follow-up write', async () => {
    let release: (() => void) | undefined;
    setItem.mockImplementationOnce(async (key: string, value: string) => {
      await new Promise<void>((resolve) => { release = resolve; });
      return AsyncStorage.setItem(key, value);
    });
    const first = markReviewed('k', 'a');
    // Let the first flush reach its write.
    await new Promise<void>((resolve) => { setImmediate(() => resolve()); });
    const second = markReviewed('k', 'b');
    release?.();
    await Promise.all([first, second]);
    await expect(loadReviewedIds('k')).resolves.toEqual(new Set(['a', 'b']));
  });

  test('a keep not yet written still counts for a load', async () => {
    let release: (() => void) | undefined;
    setItem.mockImplementationOnce(async (key: string, value: string) => {
      await new Promise<void>((resolve) => { release = resolve; });
      return AsyncStorage.setItem(key, value);
    });
    const first = markReviewed('k', 'a');
    await new Promise<void>((resolve) => { setImmediate(() => resolve()); });
    const second = markReviewed('k', 'b');
    // 'a' is being written, 'b' is waiting: both are already reviewed.
    await expect(loadReviewedIds('k')).resolves.toEqual(new Set(['a', 'b']));
    release?.();
    await Promise.all([first, second]);
  });

  test('an unparseable ledger is reported and started over, not written around forever', async () => {
    await AsyncStorage.setItem(KEY, '{"cut short');
    await markReviewed('k', 'a');
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(SyntaxError), { tags: { flow: 'reviewed-ledger-reset' } });
    await expect(loadReviewedIds('k')).resolves.toEqual(new Set(['a']));
  });

  test('a failed read never overwrites the ledger', async () => {
    await AsyncStorage.setItem(KEY, '{"k":["a"]}');
    setItem.mockClear();
    getItem.mockRejectedValueOnce(new Error('disk'));
    await expect(markReviewed('k', 'b')).resolves.toBeUndefined();
    expect(setItem).not.toHaveBeenCalled();
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error), { tags: { flow: 'reviewed-ledger-save' } });
  });

  test('a failed load reads as empty and is reported', async () => {
    getItem.mockRejectedValueOnce(new Error('disk'));
    await expect(loadReviewedIds('k')).resolves.toEqual(new Set());
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error), { tags: { flow: 'reviewed-ledger-load' } });
  });

  describe('taking a keep back (a changed decision)', () => {
    test('a song taken back is offered again; others stay', async () => {
      await markReviewed('k', 'a');
      await markReviewed('k', 'b');
      await unmarkReviewed('k', 'a');
      await expect(loadReviewedIds('k')).resolves.toEqual(new Set(['b']));
      expect(JSON.parse(setItem.mock.calls.at(-1)?.[1] ?? '{}')).toEqual({ k: ['b'] });
    });

    test('a keep taken back before it was written is never written', async () => {
      let release: (() => void) | undefined;
      setItem.mockImplementationOnce(async (key: string, value: string) => {
        await new Promise<void>((resolve) => { release = resolve; });
        return AsyncStorage.setItem(key, value);
      });
      const first = markReviewed('k', 'a');
      await new Promise<void>((resolve) => { setImmediate(() => resolve()); });
      const second = markReviewed('k', 'b');
      const third = unmarkReviewed('k', 'b');
      await expect(loadReviewedIds('k')).resolves.toEqual(new Set(['a']));
      release?.();
      await Promise.all([first, second, third]);
      await expect(loadReviewedIds('k')).resolves.toEqual(new Set(['a']));
      // No write ever held it.
      expect(setItem.mock.calls.map((call) => JSON.parse(call[1]))).not.toContainEqual({ k: ['a', 'b'] });
      expect(JSON.parse(setItem.mock.calls.at(-1)?.[1] ?? '{}')).toEqual({ k: ['a'] });
    });

    test('taken back while it is being written: it comes out right after', async () => {
      let release: (() => void) | undefined;
      setItem.mockImplementationOnce(async (key: string, value: string) => {
        await new Promise<void>((resolve) => { release = resolve; });
        return AsyncStorage.setItem(key, value);
      });
      const first = markReviewed('k', 'a');
      await new Promise<void>((resolve) => { setImmediate(() => resolve()); });
      const second = unmarkReviewed('k', 'a');
      await expect(loadReviewedIds('k')).resolves.toEqual(new Set());
      release?.();
      await Promise.all([first, second]);
      await expect(loadReviewedIds('k')).resolves.toEqual(new Set());
    });

    test('kept again after being taken back: kept', async () => {
      await markReviewed('k', 'a');
      const out = unmarkReviewed('k', 'a');
      const back = markReviewed('k', 'a');
      await Promise.all([out, back]);
      await expect(loadReviewedIds('k')).resolves.toEqual(new Set(['a']));
    });

    test('taking back the last kept song of a source drops its entry', async () => {
      await markReviewed('k', 'a');
      await markReviewed('other', 'x');
      await unmarkReviewed('k', 'a');
      expect(JSON.parse(setItem.mock.calls.at(-1)?.[1] ?? '{}')).toEqual({ other: ['x'] });
    });
  });

  test('remembers this launch\'s taken-back keeps per source until kept again', async () => {
    await markReviewed('tb', 'a');
    await unmarkReviewed('tb', 'a');
    expect([...takenBack('tb')]).toEqual(['a']);
    expect([...takenBack('tb-other')]).toEqual([]);
    await markReviewed('tb', 'a');
    expect([...takenBack('tb')]).toEqual([]);
  });

  test('the stored ids are what the ledger holds on disk, not keeps waiting to be written', async () => {
    await markReviewed('st', 'a');
    let release: (() => void) | undefined;
    setItem.mockImplementationOnce(async (key: string, value: string) => {
      await new Promise<void>((resolve) => { release = resolve; });
      return AsyncStorage.setItem(key, value);
    });
    const waiting = markReviewed('st', 'b');
    await expect(storedReviewedIds('st')).resolves.toEqual(new Set(['a']));
    await expect(loadReviewedIds('st')).resolves.toEqual(new Set(['a', 'b']));
    await new Promise<void>((resolve) => { setImmediate(() => resolve()); });
    release?.();
    await waiting;
    await expect(storedReviewedIds('st')).resolves.toEqual(new Set(['a', 'b']));
  });
});
