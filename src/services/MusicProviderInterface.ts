import { Playlist, SiftSource, Track } from '../types';

/**
 * Abstract interface for music provider services.
 *
 * Apple Music (via the native MusicKit module) and the mock implement this
 * interface, so the UI layer doesn't need to know which provider is active
 * and another service can be added behind it (Spotify was removed, #140).
 */
export interface MusicProviderService {
  /** Request authorization from the user. Returns true if granted. */
  requestAuthorization(): Promise<boolean>;

  /** Check whether the provider is currently authorized. */
  isAuthorized(): Promise<boolean>;

  /** Load the user's full music library. */
  loadLibrary(): Promise<Track[]>;

  /** Start playback of a track, optionally from a position in seconds. */
  play(trackID: string, position?: number): Promise<void>;

  /** Pause playback. */
  pause(): Promise<void>;

  /** Resume playback after a pause. */
  resume(): Promise<void>;

  /** Seek to a position in seconds within the current track. */
  seek(position: number): void;

  /** Get the current playback position and playing state. */
  getPlaybackState(): { position: number; isPlaying: boolean };

  /**
   * Create an empty playlist with the given name; resolves to its id, so
   * tracks can be added to it at once (a new playlist can take a moment to
   * show up in loadPlaylists).
   */
  createPlaylist(name: string): Promise<string>;

  /**
   * Ids of every playlist with this exact name, counting one created this
   * launch that the library may not list yet.
   */
  findPlaylists?(name: string): Promise<string[]>;

  /**
   * Resolves once every write queued so far has finished, including one
   * that timed out for its caller but was still running.
   */
  writesSettled?(): Promise<void>;

  /**
   * Remove tracks from the user's library. Apple Music can't delete library
   * songs, so it collects them in "Sift — Removed" instead, for library and
   * playlist sifts alike (utils/libraryRemovals).
   */
  removeFromLibrary?(trackIDs: string[]): Promise<void>;

  /**
   * Remove tracks from a playlist (does not delete from library); resolves
   * to how many entries came out. Apple Music edits only playlists Sift
   * created.
   */
  removeFromPlaylist?(playlistID: string, trackIDs: string[]): Promise<number>;

  /**
   * Take tracks back out of "Sift — Removed" (a Restore); resolves to how
   * many entries came out, 0 when the playlist isn't there.
   */
  restoreRemoved?(trackIDs: string[]): Promise<number>;

  /**
   * Whether a removal from this source already landed, for retrying a
   * failed one safely (#151): a removal can fail after taking effect, and
   * repeating a Remove would add the song to "Sift — Removed" twice. For a
   * provider that collects removals, it's whether the song is there,
   * whatever the source.
   */
  removalLanded?(source: SiftSource, trackID: string): Promise<boolean>;

  /** Add tracks back to the user's music library. */
  addToLibrary?(trackIDs: string[]): Promise<void>;

  /**
   * Add tracks to a playlist. When only some land, rejects with an
   * AddShortfallError (utils/musicKit) carrying the counts.
   */
  addToPlaylist?(playlistID: string, trackIDs: string[]): Promise<void>;

  /** List the user's playlists. Optional — not all providers support it yet. */
  loadPlaylists?(): Promise<Playlist[]>;

  /** Load all tracks from a specific playlist. */
  loadPlaylistTracks?(playlistID: string): Promise<Track[]>;

  /**
   * Warm the native cache for a list of track IDs (used on session resume).
   * `playlistID`: the playlist the session sifts, whose entries (music
   * videos included) only a playlist load can bring back. Resolves to how
   * many of the ids can now be played or added.
   */
  warmSongCache?(trackIDs: string[], playlistID?: string): Promise<number>;

  /**
   * Where the track's 30-second preview starts within the full track, in
   * seconds, or null when unknown (no preview, no match). Used as a chorus
   * hint by "Start at chorus"; Apple Music only.
   */
  previewOffset?(trackID: string): Promise<number | null>;
}
