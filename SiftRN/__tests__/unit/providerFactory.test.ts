jest.mock('expo-av', () => ({
  Audio: {
    Sound: { createAsync: jest.fn() },
    setAudioModeAsync: jest.fn(),
  },
}));

jest.mock('expo-auth-session', () => ({
  makeRedirectUri: jest.fn(() => 'sift-music://spotify-callback'),
  startAsync: jest.fn(),
}));

jest.mock('expo-crypto', () => ({
  digestStringAsync: jest.fn(),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  getRandomBytes: jest.fn(() => new Uint8Array(64)),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  multiRemove: jest.fn(),
}));

import { createMusicProvider } from '../../src/services';

describe('createMusicProvider', () => {
  test('returns a provider for apple-music', () => {
    const provider = createMusicProvider('apple-music');
    expect(provider).toBeDefined();
  });

  test('returns a provider for spotify', () => {
    const provider = createMusicProvider('spotify');
    expect(provider).toBeDefined();
  });

  test('returned provider implements MusicProviderService interface', () => {
    const provider = createMusicProvider('apple-music');
    expect(typeof provider.requestAuthorization).toBe('function');
    expect(typeof provider.isAuthorized).toBe('function');
    expect(typeof provider.loadLibrary).toBe('function');
    expect(typeof provider.play).toBe('function');
    expect(typeof provider.pause).toBe('function');
    expect(typeof provider.resume).toBe('function');
    expect(typeof provider.seek).toBe('function');
    expect(typeof provider.getPlaybackState).toBe('function');
    expect(typeof provider.createPlaylist).toBe('function');
  });

  test('different calls return independent instances', async () => {
    const providerA = createMusicProvider('apple-music');
    const providerB = createMusicProvider('apple-music');

    // Play on providerA, providerB should remain at initial state
    const tracksA = await providerA.loadLibrary();
    await providerA.play(tracksA[0].id);

    const stateA = providerA.getPlaybackState();
    const stateB = providerB.getPlaybackState();

    expect(stateA.isPlaying).toBe(true);
    expect(stateB.isPlaying).toBe(false);
    expect(stateB.position).toBe(0);
  });
});
