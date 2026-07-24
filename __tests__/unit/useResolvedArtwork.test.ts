import { Platform } from 'react-native';
import { renderHook, waitFor, act } from '@testing-library/react-native';

// Must set Platform.OS before the hook module loads
const originalOS = Platform.OS;
beforeAll(() => {
  (Platform as { OS: string }).OS = 'ios';
});
afterAll(() => {
  (Platform as { OS: string }).OS = originalOS;
});

// Mock the native module — path relative to project root
const mockResolveArtworkURL = jest.fn();
jest.mock('../../modules/expo-musickit/src/index', () => ({
  resolveArtworkURL: mockResolveArtworkURL,
}));

// Import AFTER mocks are set up (jest hoists jest.mock but Platform.OS needs beforeAll)
let useResolvedArtwork: typeof import('../../src/hooks/useResolvedArtwork').useResolvedArtwork;
let clearArtworkCache: typeof import('../../src/hooks/useResolvedArtwork').clearArtworkCache;

beforeAll(() => {
  const mod = require('../../src/hooks/useResolvedArtwork');
  useResolvedArtwork = mod.useResolvedArtwork;
  clearArtworkCache = mod.clearArtworkCache;
});

beforeEach(() => {
  mockResolveArtworkURL.mockReset();
  clearArtworkCache();
});

describe('useResolvedArtwork', () => {
  it('returns artworkURL directly when already defined', () => {
    const httpURL = 'https://example.com/artwork.jpg';
    const { result } = renderHook(() => useResolvedArtwork('track-1', httpURL));

    expect(result.current).toBe(httpURL);
    expect(mockResolveArtworkURL).not.toHaveBeenCalled();
  });

  it('calls native resolver when artworkURL is undefined', async () => {
    const fileURL = 'file:///caches/artwork-track-2.jpg';
    mockResolveArtworkURL.mockResolvedValue(fileURL);

    const { result } = renderHook(() => useResolvedArtwork('track-2', undefined));

    await waitFor(() => {
      expect(result.current).toBe(fileURL);
    });

    expect(mockResolveArtworkURL).toHaveBeenCalledWith('track-2', 600, 600);
  });

  it('returns undefined when native resolver returns null', async () => {
    mockResolveArtworkURL.mockResolvedValue(null);

    const { result } = renderHook(() => useResolvedArtwork('track-3', undefined));

    await waitFor(() => {
      expect(mockResolveArtworkURL).toHaveBeenCalled();
    });

    expect(result.current).toBeUndefined();
  });

  it('caches resolved URLs and does not call native again', async () => {
    const fileURL = 'file:///caches/artwork-track-4.jpg';
    mockResolveArtworkURL.mockResolvedValue(fileURL);

    const { result, unmount } = renderHook(() => useResolvedArtwork('track-4', undefined));

    await waitFor(() => {
      expect(result.current).toBe(fileURL);
    });

    expect(mockResolveArtworkURL).toHaveBeenCalledTimes(1);
    unmount();

    // Re-render with the same trackID — should use JS cache
    mockResolveArtworkURL.mockReset();
    const { result: result2 } = renderHook(() => useResolvedArtwork('track-4', undefined));

    expect(result2.current).toBe(fileURL);
    expect(mockResolveArtworkURL).not.toHaveBeenCalled();
  });

  it('updates when artworkURL changes from undefined to a value', async () => {
    mockResolveArtworkURL.mockResolvedValue(null);

    const { result, rerender } = renderHook(
      ({ url }: { url: string | undefined }) => useResolvedArtwork('track-5', url),
      { initialProps: { url: undefined as string | undefined } },
    );

    // Wait for the initial native resolve attempt to settle
    await waitFor(() => {
      expect(mockResolveArtworkURL).toHaveBeenCalled();
    });

    rerender({ url: 'https://example.com/new-artwork.jpg' });
    expect(result.current).toBe('https://example.com/new-artwork.jpg');
  });

  it('ignores a stale native resolve after the trackID changed', async () => {
    // First track's resolve is deferred so it settles *after* the trackID
    // switches — the effect cleanup must cancel it so its late value is
    // never adopted. Pins the `cancelled` guard + cleanup assignment.
    let resolveFirst: (url: string | null) => void = () => {};
    const firstPromise = new Promise<string | null>((res) => {
      resolveFirst = res;
    });
    const secondPromise = new Promise<string | null>(() => {
      /* never resolves — the second track stays pending */
    });
    mockResolveArtworkURL
      .mockReturnValueOnce(firstPromise)
      .mockReturnValueOnce(secondPromise);

    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useResolvedArtwork(id, undefined),
      { initialProps: { id: 'track-stale-a' } },
    );

    // Switch to a different track: cleanup cancels track-a's in-flight resolve
    // and a fresh (pending) resolve starts for track-b.
    rerender({ id: 'track-stale-b' });
    expect(mockResolveArtworkURL).toHaveBeenCalledTimes(2);
    expect(mockResolveArtworkURL).toHaveBeenLastCalledWith('track-stale-b', 600, 600);

    // Now let track-a's resolve settle late. Because it was cancelled, the
    // hook must NOT surface track-a's artwork while showing track-b.
    await act(async () => {
      resolveFirst('file:///caches/stale-track-a.jpg');
      await firstPromise;
      await Promise.resolve();
    });

    expect(result.current).toBeUndefined();
  });

  it('preserves an empty-string resolution instead of dropping it', async () => {
    // Distinguishes `url ?? undefined` from `url || undefined`: an empty
    // string is a valid (non-nullish) resolved value and must pass through.
    mockResolveArtworkURL.mockResolvedValue('');

    const { result } = renderHook(() => useResolvedArtwork('track-empty', undefined));

    await waitFor(() => {
      expect(result.current).toBe('');
    });

    expect(mockResolveArtworkURL).toHaveBeenCalledWith('track-empty', 600, 600);
  });
});
