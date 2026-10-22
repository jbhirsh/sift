import * as Sentry from '@sentry/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  loadPreferences,
  loadSeenRemoveNote,
  loadSeenSwipeHint,
  markRemoveNoteSeen,
  markSwipeHintSeen,
  updatePreferences,
} from '../../src/services/PreferencesStore';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

jest.mock('@sentry/react-native', () => ({
  captureException: jest.fn(),
}));

const mockGetItem = AsyncStorage.getItem as jest.Mock;
const mockSetItem = AsyncStorage.setItem as jest.Mock;

beforeEach(() => jest.clearAllMocks());

const DEFAULTS = { startAtChorus: false, sortOrder: 'least-played', filter: { maxPlays: null, addedYearsAgo: null } };

describe('PreferencesStore', () => {
  it('defaults when nothing is saved', async () => {
    mockGetItem.mockResolvedValue(null);
    await expect(loadPreferences()).resolves.toEqual(DEFAULTS);
    expect(mockGetItem).toHaveBeenCalledWith('sift_preferences');
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('loads saved settings: Start at chorus, the sort and the Plays and Added choices (#175)', async () => {
    mockGetItem.mockResolvedValue('{"startAtChorus":true,"sortOrder":"oldest","filter":{"maxPlays":5,"addedYearsAgo":3}}');
    await expect(loadPreferences()).resolves.toEqual({
      startAtChorus: true,
      sortOrder: 'oldest',
      filter: { maxPlays: 5, addedYearsAgo: 3 },
    });
  });

  it('remembers the Artist and Album sorts too (#176)', async () => {
    for (const sortOrder of ['artist', 'album']) {
      mockGetItem.mockResolvedValue(JSON.stringify({ sortOrder }));
      await expect(loadPreferences()).resolves.toEqual({ ...DEFAULTS, sortOrder });
    }
  });

  it('an older build\'s preferences (Start at chorus only) load with the other defaults', async () => {
    mockGetItem.mockResolvedValue('{"startAtChorus":true}');
    await expect(loadPreferences()).resolves.toEqual({ ...DEFAULTS, startAtChorus: true });
  });

  it('keeps defaults for wrongly typed fields and ignores unknown ones', async () => {
    mockGetItem.mockResolvedValue('{"startAtChorus":"yes","sortOrder":7,"filter":"x","other":1}');
    await expect(loadPreferences()).resolves.toEqual(DEFAULTS);
    mockGetItem.mockResolvedValue('null');
    await expect(loadPreferences()).resolves.toEqual(DEFAULTS);
    mockGetItem.mockResolvedValue('42');
    await expect(loadPreferences()).resolves.toEqual(DEFAULTS);
    // Odd but parseable values are handled, not errors.
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('a sort or a Plays or Added choice Setup no longer offers falls back to its default', async () => {
    mockGetItem.mockResolvedValue('{"sortOrder":"by-mood","filter":{"maxPlays":7,"addedYearsAgo":2}}');
    await expect(loadPreferences()).resolves.toEqual(DEFAULTS);
    // Each choice on its own: one that is still offered stays.
    mockGetItem.mockResolvedValue('{"sortOrder":"toString","filter":{"maxPlays":0,"addedYearsAgo":"5"}}');
    await expect(loadPreferences()).resolves.toEqual({ ...DEFAULTS, filter: { maxPlays: 0, addedYearsAgo: null } });
  });

  it('defaults and reports when the read or parse fails', async () => {
    mockGetItem.mockResolvedValue('{oops');
    await expect(loadPreferences()).resolves.toEqual(DEFAULTS);
    mockGetItem.mockRejectedValue(new Error('io'));
    await expect(loadPreferences()).resolves.toEqual(DEFAULTS);
    expect(Sentry.captureException).toHaveBeenCalledTimes(2);
    expect(Sentry.captureException).toHaveBeenLastCalledWith(expect.any(Error), { tags: { flow: 'preferences-load' } });
  });

  it('an update keeps the other saved preferences', async () => {
    mockGetItem.mockResolvedValue('{"startAtChorus":true,"sortOrder":"oldest","filter":{"maxPlays":5,"addedYearsAgo":null}}');
    mockSetItem.mockResolvedValue(undefined);
    await updatePreferences({ sortOrder: 'random' });
    expect(JSON.parse(mockSetItem.mock.calls[0][1] as string)).toEqual({
      startAtChorus: true,
      sortOrder: 'random',
      filter: { maxPlays: 5, addedYearsAgo: null },
    });
    expect(mockSetItem.mock.calls[0][0]).toBe('sift_preferences');
  });

  it('updates close together each build on the last one\'s write', async () => {
    let stored: string | null = null;
    mockGetItem.mockImplementation(async () => stored);
    mockSetItem.mockImplementation(async (_key: string, value: string) => {
      stored = value;
    });
    // Not awaited one by one: started together, as two quick taps would.
    await Promise.all([
      updatePreferences({ startAtChorus: true }),
      updatePreferences({ sortOrder: 'newest' }),
      updatePreferences({ filter: { maxPlays: 20, addedYearsAgo: 1 } }),
    ]);
    expect(JSON.parse(stored as unknown as string)).toEqual({
      startAtChorus: true,
      sortOrder: 'newest',
      filter: { maxPlays: 20, addedYearsAgo: 1 },
    });
  });

  it('Plays and Added save on their own, each keeping the other', async () => {
    mockGetItem.mockResolvedValue('{"filter":{"maxPlays":5,"addedYearsAgo":3}}');
    mockSetItem.mockResolvedValue(undefined);
    await updatePreferences({ filter: { maxPlays: 0 } });
    expect(JSON.parse(mockSetItem.mock.calls[0][1] as string).filter).toEqual({ maxPlays: 0, addedYearsAgo: 3 });
  });

  it('a stored value that won\'t parse is written over, so saving works again', async () => {
    mockGetItem.mockResolvedValue('{oops');
    mockSetItem.mockResolvedValue(undefined);
    await updatePreferences({ sortOrder: 'random' });
    expect(JSON.parse(mockSetItem.mock.calls[0][1] as string)).toEqual({ ...DEFAULTS, sortOrder: 'random' });
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error), { tags: { flow: 'preferences-save' } });
  });

  it('a stored filter of null keeps the other preferences', async () => {
    mockGetItem.mockResolvedValue('{"startAtChorus":true,"filter":null}');
    await expect(loadPreferences()).resolves.toEqual({ ...DEFAULTS, startAtChorus: true });
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('a failed read writes nothing, so the other choices aren\'t lost', async () => {
    mockGetItem.mockRejectedValue(new Error('io'));
    await expect(updatePreferences({ sortOrder: 'random' })).resolves.toBeUndefined();
    expect(mockSetItem).not.toHaveBeenCalled();
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error), { tags: { flow: 'preferences-save' } });
  });

  it('reports a failed save without throwing, and later updates still run', async () => {
    mockGetItem.mockResolvedValue(null);
    mockSetItem.mockRejectedValueOnce(new Error('disk full')).mockResolvedValue(undefined);
    await expect(updatePreferences({ startAtChorus: true })).resolves.toBeUndefined();
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error), { tags: { flow: 'preferences-save' } });
    await updatePreferences({ sortOrder: 'oldest' });
    expect(mockSetItem).toHaveBeenCalledTimes(2);
  });
});

describe('first-remove note flag', () => {
  it('is unseen until marked, under its own key', async () => {
    mockGetItem.mockResolvedValue(null);
    await expect(loadSeenRemoveNote()).resolves.toBe(false);
    expect(mockGetItem).toHaveBeenCalledWith('sift_seen_remove_note');

    mockSetItem.mockResolvedValue(undefined);
    await markRemoveNoteSeen();
    expect(mockSetItem).toHaveBeenCalledWith('sift_seen_remove_note', '1');

    mockGetItem.mockResolvedValue('1');
    await expect(loadSeenRemoveNote()).resolves.toBe(true);
  });

  it('a failed read counts as seen, so the note never nags', async () => {
    mockGetItem.mockRejectedValue(new Error('disk'));
    await expect(loadSeenRemoveNote()).resolves.toBe(true);
    expect(Sentry.captureException).toHaveBeenCalled();
  });

  it('a failed write is reported, not thrown', async () => {
    mockSetItem.mockRejectedValue(new Error('disk'));
    await expect(markRemoveNoteSeen()).resolves.toBeUndefined();
    expect(Sentry.captureException).toHaveBeenCalled();
  });
});

describe('first-card swipe hint flag', () => {
  it('is unseen until marked, under its own key', async () => {
    mockGetItem.mockResolvedValue(null);
    await expect(loadSeenSwipeHint()).resolves.toBe(false);
    expect(mockGetItem).toHaveBeenCalledWith('sift_seen_swipe_hint');

    mockSetItem.mockResolvedValue(undefined);
    await markSwipeHintSeen();
    expect(mockSetItem).toHaveBeenCalledWith('sift_seen_swipe_hint', '1');

    mockGetItem.mockResolvedValue('1');
    await expect(loadSeenSwipeHint()).resolves.toBe(true);
  });

  it('a failed read counts as seen; a failed write is reported', async () => {
    mockGetItem.mockRejectedValue(new Error('disk'));
    await expect(loadSeenSwipeHint()).resolves.toBe(true);
    mockSetItem.mockRejectedValue(new Error('disk'));
    await expect(markSwipeHintSeen()).resolves.toBeUndefined();
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error), { tags: { flow: 'preferences-save' } });
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error), { tags: { flow: 'preferences-load' } });
  });
});
