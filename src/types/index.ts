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

/**
 * The latest decision, held back from the music service for the undo window
 * (#152): Undo can take it back until it is sent. Sent on the next decision,
 * after the window, or when the Sift screen goes away (Finish, Back, the app
 * leaving the foreground).
 */
export interface PendingDecision {
  trackId: string;
  decision: Decision;
  /** When it was made (ms since epoch). */
  at: number;
}

export type AppPhase = 'setup' | 'loading' | 'sifting' | 'done';

export type SortOrder = 'least-played' | 'most-played' | 'oldest' | 'newest' | 'random';

/**
 * Apple Music only. Spotify was removed (#140): its token lacked the scope
 * library Remove and Restore need, it no longer returns previews to new
 * apps, and it couldn't be disconnected. The provider abstraction stays, so
 * another service can come back behind MusicProviderService.
 */
export type MusicProvider = 'apple-music';

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
  /** Ids of the removed tracks whose removal failed; optional for the same
   *  reason. */
  failedRemovalIds?: string[];
  /** Id of the "<name> - Sifted" companion playlist, persisted so a resumed
   *  session resolves it by id (rename-proof). Optional because sessions
   *  saved by older builds don't carry it — those fall back to name match. */
  siftedPlaylistId?: string | null;
  /** A decision not yet sent when the session was saved (#152); sent on
   *  resume. Optional because sessions saved by older builds don't carry it. */
  pending?: PendingDecision | null;
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
};

/** User settings that outlive any one sift session. */
export interface Preferences {
  /** Start each Apple Music track at its chorus instead of 0:00. */
  startAtChorus: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = {
  startAtChorus: false,
};
