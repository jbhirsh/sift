import type { MusicProvider, RemovalRecord } from '../types';

/**
 * Where an Apple Music Remove puts a song. MusicKit can't delete library
 * songs, and edits only playlists the app created, so AppleMusicProvider
 * collects removed songs in this playlist, from library and playlist sifts
 * alike, for the user to delete from their library in Music.
 */
export const APPLE_REMOVED_PLAYLIST = 'Sift — Removed';

/**
 * Opens the Music app, for finishing a Remove there (#173). It can't open
 * "Sift — Removed" itself: Apple's playlist links are for catalog
 * playlists, not ones in the user's library.
 */
export const MUSIC_APP_URL = 'music://';

/**
 * Whether this provider's Remove collects songs in "Sift — Removed" rather
 * than deleting them or editing the playlist being sifted. Such a removal
 * is one per song, whatever sift made it.
 */
export function collectsRemovals(provider: MusicProvider): boolean {
  return provider === 'apple-music';
}

/**
 * Ids of the songs this provider's earlier sifts put in "Sift — Removed":
 * every library removal, and every playlist removal marked `collected`.
 * Older playlist removals tried to edit the playlist, which MusicKit
 * refuses for one the user made, so they never took effect: their songs
 * are offered again.
 *
 * Matched by id alone: loadLibrary returns library ids, which stay stable,
 * and the name/artist/duration identity the playlist filters fall back on
 * would also catch a second copy of a duplicated song, or a song deleted in
 * Music and re-added from the catalog, neither of which the user removed.
 */
export function collectedRemovalIds(history: readonly RemovalRecord[], provider: MusicProvider): Set<string> {
  return new Set(
    history
      .filter((r) => r.provider === provider && (r.source.type === 'library' || r.collected === true))
      .map((r) => r.track.id),
  );
}
