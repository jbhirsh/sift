import * as Haptics from 'expo-haptics';
import { decisionHaptic, thresholdHaptic, undoHaptic } from '../../src/services/haptics';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
}));

const mockImpact = Haptics.impactAsync as jest.Mock;
const mockSelection = Haptics.selectionAsync as jest.Mock;

const flush = () => new Promise<void>((resolve) => setImmediate(() => resolve()));

beforeEach(() => jest.clearAllMocks());

describe('haptics', () => {
  test('Keep and Remove tap firmly; Skip ticks', () => {
    decisionHaptic('keep');
    decisionHaptic('remove');
    expect(mockImpact.mock.calls).toEqual([['medium'], ['medium']]);
    expect(mockSelection).not.toHaveBeenCalled();
    decisionHaptic('skip');
    expect(mockSelection).toHaveBeenCalledTimes(1);
    expect(mockImpact).toHaveBeenCalledTimes(2);
  });

  test('crossing the drag threshold ticks', () => {
    thresholdHaptic();
    expect(mockSelection).toHaveBeenCalledTimes(1);
    expect(mockImpact).not.toHaveBeenCalled();
  });

  test('Undo taps lightly', () => {
    undoHaptic();
    expect(mockImpact).toHaveBeenCalledWith('light');
  });

  test('a device that can\'t do it fails quietly', async () => {
    mockImpact.mockImplementationOnce(() => Promise.reject(new Error('no taptic engine')));
    mockSelection.mockImplementationOnce(() => Promise.reject(new Error('no taptic engine')));
    expect(() => {
      decisionHaptic('keep');
      thresholdHaptic();
    }).not.toThrow();
    await flush(); // an unhandled rejection would fail the test here
  });
});
