import * as Sentry from '@sentry/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  loadPreferences,
  loadSeenRemoveNote,
  markRemoveNoteSeen,
  savePreferences,
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

describe('PreferencesStore', () => {
  it('defaults when nothing is saved', async () => {
    mockGetItem.mockResolvedValue(null);
    await expect(loadPreferences()).resolves.toEqual({ startAtChorus: false });
    expect(mockGetItem).toHaveBeenCalledWith('sift_preferences');
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('loads a saved setting', async () => {
    mockGetItem.mockResolvedValue('{"startAtChorus":true}');
    await expect(loadPreferences()).resolves.toEqual({ startAtChorus: true });
  });

  it('keeps defaults for wrongly typed fields and ignores unknown ones', async () => {
    mockGetItem.mockResolvedValue('{"startAtChorus":"yes","other":1}');
    await expect(loadPreferences()).resolves.toEqual({ startAtChorus: false });
    mockGetItem.mockResolvedValue('null');
    await expect(loadPreferences()).resolves.toEqual({ startAtChorus: false });
    mockGetItem.mockResolvedValue('42');
    await expect(loadPreferences()).resolves.toEqual({ startAtChorus: false });
    // Odd but parseable values are handled, not errors.
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('defaults and reports when the read or parse fails', async () => {
    mockGetItem.mockResolvedValue('{oops');
    await expect(loadPreferences()).resolves.toEqual({ startAtChorus: false });
    mockGetItem.mockRejectedValue(new Error('io'));
    await expect(loadPreferences()).resolves.toEqual({ startAtChorus: false });
    expect(Sentry.captureException).toHaveBeenCalledTimes(2);
    expect(Sentry.captureException).toHaveBeenLastCalledWith(expect.any(Error), { tags: { flow: 'preferences-load' } });
  });

  it('saves preferences as JSON', async () => {
    mockSetItem.mockResolvedValue(undefined);
    await savePreferences({ startAtChorus: true });
    expect(mockSetItem).toHaveBeenCalledWith('sift_preferences', '{"startAtChorus":true}');
  });

  it('reports a failed save without throwing', async () => {
    mockSetItem.mockRejectedValue(new Error('disk full'));
    await expect(savePreferences({ startAtChorus: true })).resolves.toBeUndefined();
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error), { tags: { flow: 'preferences-save' } });
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
