import { Platform } from 'react-native';
import { renderHook, waitFor } from '@testing-library/react-native';

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
  // eslint-disable-next-line @typescript-eslint/no-require-imports
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
});
