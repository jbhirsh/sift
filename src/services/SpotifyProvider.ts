import { createAudioPlayer, type AudioPlayer } from 'expo-audio';

import type { Track } from '../types';
import type { MusicProviderService } from './MusicProviderInterface';
import {
  authorize,
  getAccessToken,
  isAuthenticated,
  refreshTokenIfNeeded,
  logout as _logout,
} from './spotify/SpotifyAuth';
import {
  loadLibrary as fetchLibrary,
  createPlaylist as apiCreatePlaylist,
} from './spotify/SpotifyAPI';

/**
 * Spotify implementation of MusicProviderService.
 *
 * Uses the Spotify Web API (via SpotifyAuth + SpotifyAPI) for library and
 * playlist operations, and expo-audio for audio playback of 30-second preview
 * URLs. Full playback via Spotify App Remote will be added in a later phase.
 */
export class SpotifyProvider implements MusicProviderService {
  private player: AudioPlayer | null = null;
  private playing = false;
  private position = 0; // seconds
  private previewURLs: Map<string, string> = new Map();

  // -- Authorization --

  async requestAuthorization(): Promise<boolean> {
    try {
      await authorize();
      return true;
    } catch {
      return false;
    }
  }

  async isAuthorized(): Promise<boolean> {
    return isAuthenticated();
  }

  // -- Library --

  async loadLibrary(): Promise<Track[]> {
    await refreshTokenIfNeeded();
    const token = await getAccessToken();
    if (!token) {
      throw new Error('Spotify: not authenticated');
    }

    const tracks = await fetchLibrary(token);

    // Cache preview URLs for playback lookup
    this.previewURLs.clear();
    for (const track of tracks) {
      if (track.previewURL) {
        this.previewURLs.set(track.id, track.previewURL);
      }
    }

    return tracks;
  }

  // -- Playback (preview mode via expo-audio) --

  async play(trackID: string, position?: number): Promise<void> {
    // Remove any existing player
    this.removePlayer();

    const previewURL = this.previewURLs.get(trackID);
    if (!previewURL) {
      // No preview available for this track — stay silent
      this.playing = false;
      this.position = 0;
      return;
    }

    this.player = createAudioPlayer({ uri: previewURL }, { updateInterval: 0.5 });
    this.player.addListener('playbackStatusUpdate', this.handlePlaybackStatus);

    if (position) {
      await this.player.seekTo(position);
    }

    this.player.play();
    this.playing = true;
    this.position = position ?? 0;
  }

  async pause(): Promise<void> {
    if (!this.player) return;

    this.position = this.player.currentTime;
    this.player.pause();
    this.playing = false;
  }

  async resume(): Promise<void> {
    if (!this.player) return;

    this.player.play();
    this.playing = true;
  }

  seek(position: number): void {
    this.position = position;
    if (this.player) {
      this.player.seekTo(position);
    }
  }

  getPlaybackState(): { position: number; isPlaying: boolean } {
    return {
      position: this.position,
      isPlaying: this.playing,
    };
  }

  // -- Playlists --

  async createPlaylist(name: string, trackIDs: string[]): Promise<void> {
    await refreshTokenIfNeeded();
    const token = await getAccessToken();
    if (!token) {
      throw new Error('Spotify: not authenticated');
    }

    await apiCreatePlaylist(token, name, trackIDs);
  }

  // -- Internal helpers --

  private handlePlaybackStatus = (status: { currentTime: number; playing: boolean }): void => {
    this.position = status.currentTime;
    this.playing = status.playing;
  };

  private removePlayer(): void {
    if (this.player) {
      this.player.remove();
      this.player = null;
    }
  }
}
