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
      // Assert each sentence of the guidance so emptying any one of the three
      // concatenated string fragments is caught, not just the first.
      expect(() => new AppleMusicProvider()).toThrow(
        'Native MusicKit module is not available',
      );
      expect(() => new AppleMusicProvider()).toThrow('running in Expo Go');
      expect(() => new AppleMusicProvider()).toThrow(
        'Use a development build (EAS Build) to access native modules.',
      );
    });
  });
});
