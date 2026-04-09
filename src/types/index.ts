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

export type AppPhase = 'setup' | 'loading' | 'sifting' | 'paused' | 'done';

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
