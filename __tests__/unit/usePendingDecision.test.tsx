import { AppState } from 'react-native';
import { renderHook, act } from '@testing-library/react-native';
import type { PendingDecision, SiftSource, Track } from '../../src/types';

// The send and hold logic on its own (#152), with SiftContext and the music
// provider stubbed.
const track = (id: string): Track => ({
  id, name: id, artist: 'A', album: 'B', duration: 200, playCount: 1, dateAdded: '2020-01-01T00:00:00.000Z',
});

const mockSift = {
  state: { tracks: [track('a'), track('b')], source: { type: 'library' } as SiftSource, pending: null as PendingDecision | null },
  dispatch: jest.fn(),
  flushPendingSave: jest.fn(),
};
const mockProvider = { keepTrack: jest.fn(() => Promise.resolve()), removeTrack: jest.fn(() => Promise.resolve()) };

jest.mock('../../src/context/SiftContext', () => ({ useSift: () => mockSift }));
jest.mock('../../src/hooks/useMusicProvider', () => ({ useMusicProvider: () => mockProvider }));

import { useHoldPendingDecision, useSendPending, wasSent, UNDO_WINDOW_MS } from '../../src/hooks/usePendingDecision';

// Each test uses its own times: the sent set lives for the module.
let clock = 1_000;
const held = (trackId: string, decision: PendingDecision['decision']): PendingDecision => ({ trackId, decision, at: (clock += 1) });

beforeEach(() => {
  jest.clearAllMocks();
  mockSift.state = { tracks: [track('a'), track('b')], source: { type: 'library' }, pending: null };
});

describe('useSendPending', () => {
  test('sends a Remove of that track, after saving, and clears it', async () => {
    const { result } = await renderHook(() => useSendPending());
    const pending = held('b', 'remove');
    await act(async () => result.current(pending));
    expect(mockSift.flushPendingSave).toHaveBeenCalledTimes(1);
    expect(mockSift.dispatch).toHaveBeenCalledWith({ type: 'PENDING_SENT', trackId: 'b', at: pending.at });
    expect(mockProvider.removeTrack).toHaveBeenCalledWith(track('b'));
    expect(mockProvider.keepTrack).not.toHaveBeenCalled();
    expect(wasSent(pending)).toBe(true);
  });

  test('a second send of the same decision only clears it again', async () => {
    const { result } = await renderHook(() => useSendPending());
    const pending = held('a', 'remove');
    await act(async () => result.current(pending));
    jest.clearAllMocks();
    await act(async () => result.current(pending));
    expect(mockProvider.removeTrack).not.toHaveBeenCalled();
    expect(mockSift.flushPendingSave).not.toHaveBeenCalled();
    expect(mockSift.dispatch).toHaveBeenCalledWith({ type: 'PENDING_SENT', trackId: 'a', at: pending.at });
  });

  test('sends a Keep; a Skip and an unknown track send nothing but still clear', async () => {
    const { result } = await renderHook(() => useSendPending());
    await act(async () => result.current(held('a', 'keep')));
    expect(mockProvider.keepTrack).toHaveBeenCalledWith(track('a'));
    expect(mockProvider.removeTrack).not.toHaveBeenCalled();
    jest.clearAllMocks();
    const skip = held('a', 'skip');
    const gone = held('zz', 'remove');
    await act(async () => {
      result.current(skip);
      result.current(gone);
      result.current(null);
    });
    expect(mockProvider.keepTrack).not.toHaveBeenCalled();
    expect(mockProvider.removeTrack).not.toHaveBeenCalled();
    expect(mockSift.dispatch).toHaveBeenCalledTimes(2);
  });

  test('Done hands a playlist keep to its fallback save; a library keep is still sent', async () => {
    mockSift.state.source = { type: 'playlist', playlist: { id: 'p', name: 'Mix', trackCount: 2 } };
    const { result } = await renderHook(() => useSendPending({ bufferPlaylistKeeps: true }));
    await act(async () => result.current(held('b', 'keep')));
    expect(mockSift.dispatch).toHaveBeenCalledWith({ type: 'ADD_PENDING_KEEP', track: track('b') });
    expect(mockProvider.keepTrack).not.toHaveBeenCalled();

    mockSift.state = { ...mockSift.state, source: { type: 'library' } };
    const { result: library } = await renderHook(() => useSendPending({ bufferPlaylistKeeps: true }));
    await act(async () => library.current(held('a', 'keep')));
    expect(mockProvider.keepTrack).toHaveBeenCalledWith(track('a'));
  });

  test('elsewhere a playlist keep is sent', async () => {
    mockSift.state.source = { type: 'playlist', playlist: { id: 'p', name: 'Mix', trackCount: 2 } };
    const { result } = await renderHook(() => useSendPending());
    await act(async () => result.current(held('a', 'keep')));
    expect(mockProvider.keepTrack).toHaveBeenCalledWith(track('a'));
    expect(mockSift.dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'ADD_PENDING_KEEP' }));
  });

  test('finds tracks from the latest render', async () => {
    const { result, rerender } = await renderHook(() => useSendPending());
    mockSift.state = { ...mockSift.state, tracks: [track('c')] };
    await rerender({});
    await act(async () => result.current(held('c', 'remove')));
    expect(mockProvider.removeTrack).toHaveBeenCalledWith(track('c'));
  });
});

describe('useHoldPendingDecision', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('sends when the undo window ends, not before', async () => {
    const send = jest.fn();
    const pending = { ...held('a', 'remove'), at: Date.now() - 1000 };
    mockSift.state.pending = pending;
    await renderHook(() => useHoldPendingDecision(send));
    await act(async () => {
      jest.advanceTimersByTime(UNDO_WINDOW_MS - 1000 - 10);
    });
    expect(send).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(20);
    });
    expect(send).toHaveBeenCalledWith(pending);
  });

  test('an already-sent decision is cleared at once', async () => {
    const { result } = await renderHook(() => useSendPending());
    const pending = { ...held('a', 'remove'), at: Date.now() };
    await act(async () => result.current(pending));
    const send = jest.fn();
    mockSift.state.pending = pending;
    await renderHook(() => useHoldPendingDecision(send));
    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(send).toHaveBeenCalledWith(pending);
  });

  test('sends when the app leaves the foreground or the screen unmounts, not when it comes back', async () => {
    const listeners: ((state: string) => void)[] = [];
    const add = jest.spyOn(AppState, 'addEventListener').mockImplementation((type, listener) => {
      expect(type).toBe('change');
      listeners.push(listener as (state: string) => void);
      return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
    });
    const send = jest.fn();
    const pending = { ...held('a', 'remove'), at: Date.now() };
    mockSift.state.pending = pending;
    const { unmount } = await renderHook(() => useHoldPendingDecision(send));
    await act(async () => listeners.forEach((l) => l('active')));
    expect(send).not.toHaveBeenCalled();
    await act(async () => listeners.forEach((l) => l('background')));
    expect(send).toHaveBeenCalledWith(pending);
    send.mockClear();
    await unmount();
    expect(send).toHaveBeenCalledWith(pending);
    add.mockRestore();
  });
});
