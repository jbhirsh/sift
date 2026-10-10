import { compactCount } from '../../src/utils/compactCount';

describe('compactCount', () => {
  test('counts under 1,000 are shown as they are', () => {
    expect(compactCount(0)).toBe('0');
    expect(compactCount(9)).toBe('9');
    expect(compactCount(999)).toBe('999');
  });

  test('thousands get one decimal below 10k, rounded down', () => {
    expect(compactCount(1000)).toBe('1k');
    expect(compactCount(2655)).toBe('2.6k');
    expect(compactCount(9999)).toBe('9.9k');
  });

  test('tens of thousands drop the decimal', () => {
    expect(compactCount(10_000)).toBe('10k');
    expect(compactCount(26_550)).toBe('26k');
    expect(compactCount(999_999)).toBe('999k');
  });

  test('millions', () => {
    expect(compactCount(1_000_000)).toBe('1M');
    expect(compactCount(1_250_000)).toBe('1.2M');
  });
});
