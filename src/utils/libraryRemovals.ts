import type { MusicProvider, RemovalRecord } from '../types';

/**
 * Where an Apple Music library Remove puts a song. MusicKit can't delete
 * from the library, so the native module collects removed songs in this
 * playlist for the user to delete in Music (ExpoMusicKitModule.swift).
 */
export const APPLE_REMOVED_PLAYLIST = 'Sift — Removed';

/**
 * Ids of the songs removed in earlier library sifts with this provider.
 * Matched by id alone: loadLibrary returns library ids, which stay stable,
 * and the name/artist/duration identity the playlist filters fall back on
 * would also catch a second copy of a duplicated song, or a song deleted in
 * Music and re-added from the catalog, neither of which the user removed.
 */
export function libraryRemovedIds(history: readonly RemovalRecord[], provider: MusicProvider): Set<string> {
  return new Set(
    history
      .filter((r) => r.source.type === 'library' && r.provider === provider)
      .map((r) => r.track.id),
  );
}
