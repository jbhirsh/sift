import { Playlist, Track } from '../types';

/**
 * Abstract interface for music provider services.
 *
 * Both Apple Music (via native MusicKit module) and Spotify (via Web API)
 * implement this interface so the UI layer doesn't need to know which
 * provider is active.
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

  /** Add tracks back to the user's music library. */
  addToLibrary?(trackIDs: string[]): Promise<void>;

  /** Add tracks to a playlist. */
  addToPlaylist?(playlistID: string, trackIDs: string[]): Promise<void>;

  /** List the user's playlists. Optional — not all providers support it yet. */
  loadPlaylists?(): Promise<Playlist[]>;

  /** Load all tracks from a specific playlist. */
  loadPlaylistTracks?(playlistID: string): Promise<Track[]>;

  /** Warm the native song cache for a list of track IDs (used on session resume). */
  warmSongCache?(trackIDs: string[]): Promise<number>;
}
