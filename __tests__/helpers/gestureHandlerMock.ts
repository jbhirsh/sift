import type { ReactNode } from 'react';

/**
 * A stand-in for react-native-gesture-handler in tests that render whole
 * screens: the detectors render their children, and every gesture builder
 * call (Gesture.Pan().minDistance(10).onBegin(...)...) chains, in any order,
 * so a component can configure its gestures without each test's mock
 * spelling out the same calls. Usage, in a test file:
 *
 *   jest.mock('react-native-gesture-handler', () =>
 *     jest.requireActual('../helpers/gestureHandlerMock').gestureHandlerMock(),
 *   );
 *
 * A test that drives a gesture's callbacks (InteractiveCard's) keeps a mock
 * of its own that captures them.
 */
export function gestureHandlerMock() {
  const passThrough = ({ children }: { children: ReactNode }) => children;
  const gesture = (): unknown => new Proxy({}, { get: () => gesture });
  return {
    GestureHandlerRootView: passThrough,
    GestureDetector: passThrough,
    Gesture: { Pan: gesture, Tap: gesture, Race: gesture },
  };
}
