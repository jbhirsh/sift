import { Platform } from 'react-native';

const mockNativeModule = {
  requestAuthorization: jest.fn().mockResolvedValue(true),
  getAuthorizationStatus: jest.fn().mockReturnValue('authorized'),
  loadFullLibrary: jest.fn().mockResolvedValue([
    {
      id: '1', name: 'Song', artist: 'Artist', album: 'Album',
      duration: 200, playCount: 10, dateAdded: '2020-01-01',
      artworkURL: 'https://example.com/art.jpg',
    },
    {
      id: '2', name: 'Song2', artist: 'Artist2', album: 'Album2',
      duration: 180, playCount: 5, dateAdded: '2021-01-01',
      artworkURL: null,
    },
  ]),
  play: jest.fn().mockResolvedValue(undefined),
  pause: jest.fn().mockResolvedValue(undefined),
  resume: jest.fn().mockResolvedValue(undefined),
  seek: jest.fn(),
  getPlaybackState: jest.fn().mockReturnValue({ position: 42, isPlaying: true }),
  createPlaylist: jest.fn().mockResolvedValue(undefined),
};

jest.mock('../../modules/expo-musickit/src/index', () => mockNativeModule, { virtual: true });

// Override Platform.OS to ios at object level
const originalOS = Platform.OS;
beforeAll(() => {
  Object.defineProperty(Platform, 'OS', { value: 'ios', writable: true });
});
afterAll(() => {
  Object.defineProperty(Platform, 'OS', { value: originalOS, writable: true });
});

import { AppleMusicProvider } from '../../src/services/AppleMusicProvider';

describe('AppleMusicProvider', () => {
  let provider: AppleMusicProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new AppleMusicProvider();
  });

  test('requestAuthorization delegates to native module', async () => {
    const result = await provider.requestAuthorization();
    expect(result).toBe(true);
    expect(mockNativeModule.requestAuthorization).toHaveBeenCalled();
  });

  test('isAuthorized returns true when status is authorized', async () => {
    mockNativeModule.getAuthorizationStatus.mockReturnValue('authorized');
    expect(await provider.isAuthorized()).toBe(true);
  });

  test('isAuthorized returns false when status is not authorized', async () => {
    mockNativeModule.getAuthorizationStatus.mockReturnValue('denied');
    expect(await provider.isAuthorized()).toBe(false);
  });

  test('loadLibrary maps native tracks to app Track type', async () => {
    const tracks = await provider.loadLibrary();
    expect(tracks).toHaveLength(2);
    expect(tracks[0]).toEqual({
      id: '1', name: 'Song', artist: 'Artist', album: 'Album',
      duration: 200, playCount: 10, dateAdded: '2020-01-01',
      artworkURL: 'https://example.com/art.jpg',
    });
    expect(tracks[1].artworkURL).toBeUndefined();
  });

  test('play delegates to native module', async () => {
    await provider.play('trackId', 30);
    expect(mockNativeModule.play).toHaveBeenCalledWith('trackId', 30);
  });

  test('pause delegates to native module', async () => {
    await provider.pause();
    expect(mockNativeModule.pause).toHaveBeenCalled();
  });

  test('resume delegates to native module', async () => {
    await provider.resume();
    expect(mockNativeModule.resume).toHaveBeenCalled();
  });

  test('seek delegates to native module', () => {
    provider.seek(42);
    expect(mockNativeModule.seek).toHaveBeenCalledWith(42);
  });

  test('getPlaybackState returns native module state', () => {
    const state = provider.getPlaybackState();
    expect(state).toEqual({ position: 42, isPlaying: true });
  });

  test('createPlaylist delegates to native module', async () => {
    await provider.createPlaylist('My Playlist', ['1', '2']);
    expect(mockNativeModule.createPlaylist).toHaveBeenCalledWith('My Playlist', ['1', '2']);
  });

  test('play with no position passes undefined', async () => {
    await provider.play('trackId');
    expect(mockNativeModule.play).toHaveBeenCalledWith('trackId', undefined);
  });
});
