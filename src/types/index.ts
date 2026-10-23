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
  /** Its place on its album (#176), when the service says. */
  trackNumber?: number;
  discNumber?: number;
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

export type SortOrder =
  'least-played' | 'most-played' | 'oldest' | 'newest' | 'artist' | 'album' | 'random';

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

export type SiftSource = { type: 'library' } | { type: 'playlist'; playlist: Playlist };

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
  /**
   * Failed-removal messages, persisted so Done's warning and the retries
   * survive an app kill/relaunch. Optional because sessions saved by older
   * builds don't carry it. (Builds before keeps were remembered for
   * playlists also saved pendingKeeps and siftedPlaylistId: SessionStore
   * reads the first once and drops both.)
   */
  removalErrors?: string[];
  /** Ids of the removed tracks whose removal failed; optional for the same reason. */
  failedRemovalIds?: string[];
  /**
   * A decision not yet sent when the session was saved (#152); sent on
   * resume. Optional because sessions saved by older builds don't carry it.
   */
  pending?: PendingDecision | null;
}

export interface RemovalRecord {
  track: Track;
  source: SiftSource;
  provider: MusicProvider;
  removedAt: string; // ISO 8601
  /**
   * A playlist removal that put the song in "Sift — Removed" (a library one
   * always does). Missing on playlist removals from before, which never
   * took effect (utils/libraryRemovals).
   */
  collected?: boolean;
}

/**
 * Which songs a sift takes, chosen on Setup: by plays and by when they were
 * added. Null is no limit.
 */
export interface TrackFilter {
  /** At most this many plays (0: never played). */
  maxPlays: number | null;
  /** Added at least this many years ago. */
  addedYearsAgo: number | null;
}

export const NO_FILTER: TrackFilter = { maxPlays: null, addedYearsAgo: null };

export const SORT_ORDER_DISPLAY: Record<SortOrder, string> = {
  'least-played': 'Least Played',
  'most-played': 'Most Played',
  oldest: 'Oldest Added',
  newest: 'Newest Added',
  artist: 'Artist',
  album: 'Album',
  random: 'Random',
};

export const PROVIDER_DISPLAY: Record<MusicProvider, string> = {
  'apple-music': 'Apple Music',
};

/** User settings that outlive any one sift session. */
export interface Preferences {
  /** Start each Apple Music track at its chorus instead of 0:00. */
  startAtChorus: boolean;
  /** Setup's last sort order (#175). */
  sortOrder: SortOrder;
  /** Setup's last Plays and Added choices (#175). */
  filter: TrackFilter;
}

/** Some preferences to save; the filter's two choices save separately. */
export type PreferenceChanges = Partial<Omit<Preferences, 'filter'>> & {
  filter?: Partial<TrackFilter>;
};

/** Each preference the user can change on its own. */
export type PreferenceField = 'startAtChorus' | 'sortOrder' | keyof TrackFilter;

export const DEFAULT_PREFERENCES: Preferences = {
  startAtChorus: false,
  sortOrder: 'least-played',
  filter: NO_FILTER,
};
