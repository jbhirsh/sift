import type { MusicProviderService } from '../../src/services/MusicProviderInterface';
import type { Track } from '../../src/types';
import { loadPlaylistTracksOnce } from '../../src/services/playlistLoads';

const track = (id: string): Track => ({
  id,
  name: id,
  artist: 'Artist',
  album: 'Album',
  duration: 200,
  playCount: 0,
  dateAdded: '2020-01-01T00:00:00.000Z',
});

/** A service whose loads wait until the test settles them. */
function service() {
  const pending: {
    id: string;
    resolve: (tracks: Track[]) => void;
    reject: (err: Error) => void;
  }[] = [];
  const loadPlaylistTracks = jest.fn(
    (id: string) =>
      new Promise<Track[]>((resolve, reject) => {
        pending.push({ id, resolve, reject });
      }),
  );
  return {
    music: { loadPlaylistTracks } as unknown as MusicProviderService,
    loadPlaylistTracks,
    pending,
  };
}

describe('loadPlaylistTracksOnce (#179)', () => {
  test('two asks for a playlist while it loads share one load', async () => {
    const { music, loadPlaylistTracks, pending } = service();
    const first = loadPlaylistTracksOnce(music, 'p1');
    const second = loadPlaylistTracksOnce(music, 'p1');
    expect(loadPlaylistTracks).toHaveBeenCalledTimes(1);
    pending[0].resolve([track('a'), track('b')]);
    await expect(first).resolves.toEqual([track('a'), track('b')]);
    await expect(second).resolves.toEqual([track('a'), track('b')]);
  });

  test("each caller gets its own list: one sorting it can't reorder the other's", async () => {
    const { music, pending } = service();
    const first = loadPlaylistTracksOnce(music, 'p1');
    const second = loadPlaylistTracksOnce(music, 'p1');
    pending[0].resolve([track('a'), track('b')]);
    const [mine, theirs] = await Promise.all([first, second]);
    mine?.reverse();
    expect(theirs?.map((t) => t.id)).toEqual(['a', 'b']);
  });

  test("a load that finished isn't reused: the next ask loads afresh", async () => {
    const { music, loadPlaylistTracks, pending } = service();
    const first = loadPlaylistTracksOnce(music, 'p1');
    pending[0].resolve([track('a')]);
    await first;
    const again = loadPlaylistTracksOnce(music, 'p1');
    expect(loadPlaylistTracks).toHaveBeenCalledTimes(2);
    pending[1].resolve([track('a'), track('c')]);
    await expect(again).resolves.toEqual([track('a'), track('c')]);
  });

  test('a failed load fails every ask that shared it, and the next ask tries again', async () => {
    const { music, loadPlaylistTracks, pending } = service();
    const first = loadPlaylistTracksOnce(music, 'p1');
    const second = loadPlaylistTracksOnce(music, 'p1');
    pending[0].reject(new Error('offline'));
    await expect(first).rejects.toThrow('offline');
    await expect(second).rejects.toThrow('offline');
    void loadPlaylistTracksOnce(music, 'p1');
    expect(loadPlaylistTracks).toHaveBeenCalledTimes(2);
  });

  test('other playlists, and other providers, load on their own', async () => {
    const one = service();
    const other = service();
    void loadPlaylistTracksOnce(one.music, 'p1');
    void loadPlaylistTracksOnce(one.music, 'p2');
    void loadPlaylistTracksOnce(other.music, 'p1');
    expect(one.loadPlaylistTracks.mock.calls).toEqual([['p1'], ['p2']]);
    expect(other.loadPlaylistTracks.mock.calls).toEqual([['p1']]);
  });

  test("a provider that can't load playlists gets nothing", () => {
    expect(loadPlaylistTracksOnce({} as MusicProviderService, 'p1')).toBeUndefined();
  });
});
