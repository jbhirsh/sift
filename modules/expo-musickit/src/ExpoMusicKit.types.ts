// Raw shapes the native module returns. It hands back MusicKit's values as
// they are (missing ones null, artwork URLs of any scheme); src/utils/musicKit
// decides what the app makes of them.

export interface MusicKitTrack {
  id: string;
  name: string;
  artist: string;
  album: string | null;
  duration: number | null;
  playCount: number | null;
  dateAdded: string | null;
  artworkURL: string | null;
  kind: 'song' | 'track';
}

export interface MusicKitPlaylist {
  id: string;
  name: string;
  trackCount: number;
  artworkURL: string | null;
}

export interface LibrarySongLookup {
  /** The requested id. */
  id: string;
  song: MusicKitTrack | null;
  /** The lookup itself failed (as opposed to finding nothing). */
  failed: boolean;
}

export type CachedKind = 'song' | 'track' | null;

export type AddResult = 'added' | 'failed' | 'unresolved';

export interface PreviewInfo {
  previewURL: string | null;
  isrc: string | null;
  title: string;
  artist: string;
  duration: number | null;
}

export interface CatalogSearchHit {
  id: string;
  title: string;
  artist: string;
  duration: number | null;
  previewURL: string | null;
}

export interface PlaybackState {
  position: number;
  isPlaying: boolean;
}
