import { Platform } from 'react-native';

// Set platform to android BEFORE loading the module under test
beforeAll(() => {
  Object.defineProperty(Platform, 'OS', { value: 'android', writable: true });
});

afterAll(() => {
  Object.defineProperty(Platform, 'OS', { value: 'ios', writable: true });
});

// Mock the native module (won't be reached because platform guard throws first)
jest.mock('../../modules/expo-musickit/src/index', () => ({}), { virtual: true });

describe('AppleMusicProvider platform guard', () => {
  test('throws on non-iOS platform', () => {
    const { AppleMusicProvider } = require('../../src/services/AppleMusicProvider');
    expect(() => new AppleMusicProvider()).toThrow(
      'AppleMusicProvider is only available on iOS',
    );
  });
});
