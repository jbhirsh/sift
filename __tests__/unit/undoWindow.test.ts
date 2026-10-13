import { DEFAULT_UNDO_WINDOW_MS, undoWindowMs } from '../../src/utils/undoWindow';

describe('undoWindowMs', () => {
  test('the app ships with 5 seconds', () => {
    expect(DEFAULT_UNDO_WINDOW_MS).toBe(5000);
    expect(undoWindowMs(undefined)).toBe(5000);
  });

  test('a positive whole number of milliseconds overrides it', () => {
    expect(undoWindowMs('30000')).toBe(30000);
    expect(undoWindowMs(' 30000 ')).toBe(30000);
    expect(undoWindowMs('1')).toBe(1);
  });

  test('anything else is ignored', () => {
    for (const bad of ['', '   ', '0', '00', '-5', '1.5', '30s', 'abc', '1e4', '30000x']) {
      expect(undoWindowMs(bad)).toBe(5000);
    }
  });
});
