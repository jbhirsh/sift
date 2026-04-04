import { formatTime } from '../../src/utils/formatTime';

describe('formatTime', () => {
  test('0 seconds formats as 0:00', () => {
    expect(formatTime(0)).toBe('0:00');
  });

  test('45 seconds formats as 0:45', () => {
    expect(formatTime(45)).toBe('0:45');
  });

  test('60 seconds formats as 1:00', () => {
    expect(formatTime(60)).toBe('1:00');
  });

  test('243 seconds formats as 4:03', () => {
    expect(formatTime(243)).toBe('4:03');
  });
});
