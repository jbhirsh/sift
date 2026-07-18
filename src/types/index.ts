export interface Track {
  id: string;
  name: string;
  artist: string;
  album: string;
  duration: number; // seconds
  playCount: number;
  dateAdded: string; // ISO 8601
  artworkURL?: string;
  previewURL?: string;
}

export type Decision = 'keep' | 'remove' | 'skip';

export type AppPhase = 'setup' | 'loading' | 'sifting' | 'done';

export type SortOrder = 'least-played' | 'most-played' | 'oldest' | 'newest' | 'random';

export type MusicProvider = 'apple-music' | 'spotify';

export type ConnectionStatus = 'unknown' | 'checking' | 'connected' | 'disconnected';

export interface Playlist {
  id: string;
  name: string;
  trackCount: number;
  artworkURL?: string;
}

export type SiftSource =
  | { type: 'library' }
  | { type: 'playlist'; playlist: Playlist };

export interface SiftSession {
  tracks: Track[];
  cursor: number;
  kept: Track[];
  removed: Track[];
  skipped: Track[];
  sortOrder: SortOrder;
  savedAt: string; // ISO 8601
  provider?: MusicProvider;
  source?: SiftSource;
  /** Keeps that never landed in the "- Sifted" playlist, persisted so the
   *  Done-screen repair pass survives an app kill/relaunch. Optional because
   *  sessions saved by older builds don't carry it. */
  pendingKeeps?: Track[];
  /** Failed-removal messages, persisted for the same reason. */
  removalErrors?: string[];
  /** Id of the "<name> - Sifted" companion playlist, persisted so a resumed
   *  session resolves it by id (rename-proof). Optional because sessions
   *  saved by older builds don't carry it — those fall back to name match. */
  siftedPlaylistId?: string | null;
}

export interface RemovalRecord {
  track: Track;
  source: SiftSource;
  provider: MusicProvider;
  removedAt: string; // ISO 8601
}

export const SORT_ORDER_DISPLAY: Record<SortOrder, string> = {
  'least-played': 'Least Played',
  'most-played': 'Most Played',
  oldest: 'Oldest Added',
  newest: 'Newest Added',
  random: 'Random',
};

export const PROVIDER_DISPLAY: Record<MusicProvider, string> = {
  'apple-music': 'Apple Music',
  spotify: 'Spotify',
};
