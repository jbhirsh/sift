import type { Track } from '../types';
import type { MusicProviderService } from './MusicProviderInterface';

// Loads of a playlist's songs under way, per provider, by playlist id. Only
// while running: a later load asks the service again, for fresh songs.
const running = new WeakMap<MusicProviderService, Map<string, Promise<Track[]>>>();

/**
 * A playlist's songs, from a load already under way when there is one
 * (#179): Setup's one-time "- Sifted" import (services/SiftedImport) and
 * Start Sifting's load can both want the same playlist at once, and it
 * needn't be fetched twice. Each caller gets its own copy of the list.
 * Undefined when the provider can't load playlists.
 */
export function loadPlaylistTracksOnce(
  service: MusicProviderService,
  playlistId: string,
): Promise<Track[]> | undefined {
  if (!service.loadPlaylistTracks) return undefined;
  let loads = running.get(service);
  if (!loads) {
    loads = new Map();
    running.set(service, loads);
  }
  let load = loads.get(playlistId);
  if (!load) {
    const started = service.loadPlaylistTracks(playlistId);
    const forget = () => {
      if (loads.get(playlistId) === started) loads.delete(playlistId);
    };
    started.then(forget, forget);
    loads.set(playlistId, started);
    load = started;
  }
  return load.then((tracks) => [...tracks]);
}
