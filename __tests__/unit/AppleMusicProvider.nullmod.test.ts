import { Platform } from 'react-native';

// Keep platform as iOS so the platform guard passes
beforeAll(() => {
  Object.defineProperty(Platform, 'OS', { value: 'ios', writable: true });
});

describe('AppleMusicProvider null module guard', () => {
  test('throws when native module is null', () => {
    jest.isolateModules(() => {
      jest.doMock('../../modules/expo-musickit/src/index', () => undefined, { virtual: true });
      const { AppleMusicProvider } = require('../../src/services/AppleMusicProvider');
      expect(() => new AppleMusicProvider()).toThrow(
        'Native MusicKit module is not available',
      );
    });
  });
});
