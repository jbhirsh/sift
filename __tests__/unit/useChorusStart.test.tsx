import { renderHook, act } from '@testing-library/react-native';
import { Track } from '../../src/types';
import { CHORUS_WAIT_MS, useChorusStart } from '../../src/hooks/useChorusStart';

const mockFind = jest.fn();
jest.mock('../../src/services/ChorusFinder', () => ({
  chorusFinder: { find: (...args: unknown[]) => mockFind(...args) },
}));

const track = (id: string, duration = 200): Track => ({
  id, name: id, artist: 'A', album: 'B', duration, playCount: 0, dateAdded: '',
});
const [t1, t2, t3] = [track('t1'), track('t2'), track('t3')];

const mockSift = {
  state: { startAtChorus: true, provider: 'apple-music' as 'apple-music' | 'spotify' },
  currentTrack: t1 as Track | undefined,
  nextTrack: t2 as Track | undefined,
  nextNextTrack: t3 as Track | undefined,
};
jest.mock('../../src/context/SiftContext', () => ({
  useSift: () => mockSift,
}));

const previewOffset = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockFind.mockResolvedValue({ position: 47, source: 'lyrics' });
  mockSift.state = { startAtChorus: true, provider: 'apple-music' };
  mockSift.currentTrack = t1;
  mockSift.nextTrack = t2;
  mockSift.nextNextTrack = t3;
});

describe('useChorusStart', () => {
  it('is enabled for Apple Music with the setting on, and prefetches the next cards', async () => {
    const { result } = await renderHook(() => useChorusStart(previewOffset));
    expect(result.current.enabled).toBe(true);
    expect(mockFind.mock.calls.map((c) => c[0].id)).toEqual(['t1', 't2', 't3']);
    expect(mockFind).toHaveBeenCalledWith(t1, previewOffset);
  });

  it('skips missing upcoming cards', async () => {
    mockSift.nextNextTrack = undefined;
    mockSift.nextTrack = undefined;
    await renderHook(() => useChorusStart(previewOffset));
    expect(mockFind.mock.calls.map((c) => c[0].id)).toEqual(['t1']);
  });

  it.each([
    ['the setting is off', { startAtChorus: false, provider: 'apple-music' as const }],
    ['the provider is Spotify', { startAtChorus: true, provider: 'spotify' as const }],
  ])('is disabled, prefetches nothing and starts at 0 when %s', async (_, state) => {
    mockSift.state = state;
    const { result } = await renderHook(() => useChorusStart(previewOffset));
    expect(result.current.enabled).toBe(false);
    expect(mockFind).not.toHaveBeenCalled();
    await expect(result.current.startPositionFor(t1)).resolves.toBe(0);
    expect(mockFind).not.toHaveBeenCalled();
  });

  it('resolves the chorus position', async () => {
    const { result } = await renderHook(() => useChorusStart(previewOffset));
    await expect(result.current.startPositionFor(t2)).resolves.toBe(47);
    expect(mockFind).toHaveBeenLastCalledWith(t2, previewOffset);
  });

  it('falls back to the estimate when the chorus takes too long', async () => {
    jest.useFakeTimers();
    try {
      const { result } = await renderHook(() => useChorusStart(previewOffset));
      mockFind.mockReturnValue(new Promise(() => {}));
      let position: number | undefined;
      void result.current.startPositionFor(track('slow', 300)).then((p) => { position = p; });
      await act(async () => {
        await jest.advanceTimersByTimeAsync(CHORUS_WAIT_MS - 1);
      });
      expect(position).toBeUndefined();
      await act(async () => {
        await jest.advanceTimersByTimeAsync(1);
      });
      expect(position).toBe(60);
    } finally {
      jest.useRealTimers();
    }
  });

  it('clears its fallback timer once the chorus resolves', async () => {
    const clear = jest.spyOn(globalThis, 'clearTimeout');
    try {
      const { result } = await renderHook(() => useChorusStart(previewOffset));
      const set = jest.spyOn(globalThis, 'setTimeout');
      await expect(result.current.startPositionFor(t1)).resolves.toBe(47);
      const timer = set.mock.results.find((r, i) => set.mock.calls[i][1] === CHORUS_WAIT_MS)?.value;
      expect(timer).toBeDefined();
      expect(clear).toHaveBeenCalledWith(timer);
      set.mockRestore();
    } finally {
      clear.mockRestore();
    }
  });
});
