import * as Sentry from '@sentry/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadPreferences, savePreferences } from '../../src/services/PreferencesStore';

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
  });

  it('defaults and reports when the read or parse fails', async () => {
    mockGetItem.mockResolvedValue('{oops');
    await expect(loadPreferences()).resolves.toEqual({ startAtChorus: false });
    mockGetItem.mockRejectedValue(new Error('io'));
    await expect(loadPreferences()).resolves.toEqual({ startAtChorus: false });
    expect(Sentry.captureException).toHaveBeenCalledTimes(2);
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
