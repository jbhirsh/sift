import { renderHook } from '@testing-library/react-native';
import { useKeyboardShortcuts } from '../../src/hooks/useKeyboardShortcuts';

describe('useKeyboardShortcuts', () => {
  test('can be called without error (no-op stub)', () => {
    const callbacks = {
      onKeep: jest.fn(),
      onRemove: jest.fn(),
      onSkip: jest.fn(),
      onTogglePlayPause: jest.fn(),
    };
    const { result } = renderHook(() => useKeyboardShortcuts(callbacks));
    expect(result.current).toBeUndefined();
  });
});
