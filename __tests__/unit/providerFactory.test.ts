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

describe('createMusicProvider: which provider it picks', () => {
  const saved = process.env.EXPO_PUBLIC_USE_MOCK_PROVIDER;

  afterEach(() => {
    if (saved === undefined) delete process.env.EXPO_PUBLIC_USE_MOCK_PROVIDER;
    else process.env.EXPO_PUBLIC_USE_MOCK_PROVIDER = saved;
    jest.resetModules();
  });

  /** The factory and the Sentry mock it reports to, loaded afresh. */
  function load(): {
    create: typeof createMusicProvider;
    breadcrumbs: jest.Mock;
    Mock: typeof import('../../src/services/MockMusicProvider').MockMusicProvider;
  } {
    const services: typeof import('../../src/services') = require('../../src/services');
    const sentry: { addBreadcrumb: jest.Mock } = require('@sentry/react-native');
    const mock: typeof import('../../src/services/MockMusicProvider') = require('../../src/services/MockMusicProvider');
    sentry.addBreadcrumb.mockClear();
    return {
      create: services.createMusicProvider,
      breadcrumbs: sentry.addBreadcrumb,
      Mock: mock.MockMusicProvider,
    };
  }

  test('EXPO_PUBLIC_USE_MOCK_PROVIDER=1 gives the mock without loading the native provider', () => {
    process.env.EXPO_PUBLIC_USE_MOCK_PROVIDER = '1';
    const native = jest.fn();
    jest.doMock('../../src/services/AppleMusicProvider', () => {
      native();
      return { AppleMusicProvider: jest.fn() };
    });
    const { create, breadcrumbs, Mock } = load();

    expect(create('apple-music')).toBeInstanceOf(Mock);
    expect(native).not.toHaveBeenCalled();
    expect(breadcrumbs).toHaveBeenCalledWith({
      category: 'music-provider',
      message: 'Using MockMusicProvider (EXPO_PUBLIC_USE_MOCK_PROVIDER)',
      level: 'info',
    });
  });

  test('gives the native AppleMusicProvider when it loads', () => {
    delete process.env.EXPO_PUBLIC_USE_MOCK_PROVIDER;
    class FakeAppleMusicProvider {
      readonly fake = true;
    }
    jest.doMock('../../src/services/AppleMusicProvider', () => ({
      AppleMusicProvider: FakeAppleMusicProvider,
    }));
    const { create, breadcrumbs } = load();

    expect(create('apple-music')).toBeInstanceOf(FakeAppleMusicProvider);
    expect(breadcrumbs).toHaveBeenCalledWith({
      category: 'music-provider',
      message: 'Loaded native AppleMusicProvider',
      level: 'info',
    });
  });

  test('falls back to the mock, and says why, when the native provider throws', () => {
    delete process.env.EXPO_PUBLIC_USE_MOCK_PROVIDER;
    jest.doMock('../../src/services/AppleMusicProvider', () => ({
      AppleMusicProvider: jest.fn(() => {
        throw new Error('no MusicKit here');
      }),
    }));
    const { create, breadcrumbs, Mock } = load();

    expect(create('apple-music')).toBeInstanceOf(Mock);
    expect(breadcrumbs).toHaveBeenCalledWith({
      category: 'music-provider',
      message: 'Native AppleMusicProvider unavailable, using mock: Error: no MusicKit here',
      level: 'warning',
    });
  });
});
