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

  /** Create a playlist with the given name containing the specified tracks. */
  createPlaylist(name: string, trackIDs: string[]): Promise<void>;

  /** Delete tracks from the user's music library entirely. */
  removeFromLibrary?(trackIDs: string[]): Promise<void>;

  /** Remove tracks from a playlist (does not delete from library). */
  removeFromPlaylist?(playlistID: string, trackIDs: string[]): Promise<void>;

  /**
   * Whether a removal from this source already landed, for retrying a
   * failed one safely (#151): a removal can fail after taking effect, and
   * repeating a library Remove would add the song to "Sift — Removed"
   * twice.
   */
  removalLanded?(source: SiftSource, trackID: string): Promise<boolean>;

  /** Add tracks back to the user's music library. */
  addToLibrary?(trackIDs: string[]): Promise<void>;

  /** Add tracks to a playlist. */
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
