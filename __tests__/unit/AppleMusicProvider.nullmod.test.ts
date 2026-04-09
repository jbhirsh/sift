import { Platform } from 'react-native';

const originalPlatform = Platform.OS;

// Keep platform as iOS so the platform guard passes
beforeAll(() => {
  Object.defineProperty(Platform, 'OS', { value: 'ios', writable: true });
});

afterAll(() => {
  Object.defineProperty(Platform, 'OS', { value: originalPlatform, writable: true });
  jest.resetModules();
});

describe('AppleMusicProvider null module guard', () => {
  test('throws when native module is null', () => {
    jest.isolateModules(() => {
      jest.doMock('../../modules/expo-musickit/src/index', () => null);
      const { AppleMusicProvider } = require('../../src/services/AppleMusicProvider');
      expect(() => new AppleMusicProvider()).toThrow(
        'Native MusicKit module is not available',
      );
    });
  });
});
