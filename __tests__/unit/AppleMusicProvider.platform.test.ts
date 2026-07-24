import { Platform } from 'react-native';

const originalPlatform = Platform.OS;

// Set platform to android BEFORE loading the module under test
beforeAll(() => {
  Object.defineProperty(Platform, 'OS', { value: 'android', writable: true });
});

afterAll(() => {
  Object.defineProperty(Platform, 'OS', { value: originalPlatform, writable: true });
  jest.resetModules();
});

// Mock the native module (won't be reached because platform guard throws first)
jest.mock('../../modules/expo-musickit/src/index', () => ({}));

describe('AppleMusicProvider platform guard', () => {
  test('throws on non-iOS platform', () => {
    const { AppleMusicProvider } = require('../../src/services/AppleMusicProvider');
    expect(() => new AppleMusicProvider()).toThrow(
      'AppleMusicProvider is only available on iOS',
    );
  });

  test('names the current platform in the error', () => {
    // Pins the `Current platform: ${Platform.OS}` template so emptying that
    // static text can't slip past the first-sentence-only assertion above.
    const { AppleMusicProvider } = require('../../src/services/AppleMusicProvider');
    expect(() => new AppleMusicProvider()).toThrow('Current platform: android');
  });
});
