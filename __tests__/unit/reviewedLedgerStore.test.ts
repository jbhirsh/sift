import * as Sentry from '@sentry/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadReviewedIds, markReviewed } from '../../src/services/ReviewedLedgerStore';

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
});
