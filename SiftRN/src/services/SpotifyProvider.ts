import { Audio, AVPlaybackStatus } from 'expo-av';

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
 * playlist operations, and expo-av for audio playback of 30-second preview
 * URLs. Full playback via Spotify App Remote will be added in a later phase.
 */
export class SpotifyProvider implements MusicProviderService {
  private sound: Audio.Sound | null = null;
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

  // -- Playback (preview mode via expo-av) --

  async play(trackID: string, position?: number): Promise<void> {
    // Unload any existing sound
    await this.unloadSound();

    const previewURL = this.previewURLs.get(trackID);
    if (!previewURL) {
      // No preview available for this track — stay silent
      this.playing = false;
      this.position = 0;
      return;
    }

    const { sound } = await Audio.Sound.createAsync(
      { uri: previewURL },
      { shouldPlay: true, positionMillis: position ? position * 1000 : 0 },
    );

    this.sound = sound;
    this.playing = true;
    this.position = position ?? 0;

    sound.setOnPlaybackStatusUpdate(this.handlePlaybackStatus);
  }

  async pause(): Promise<void> {
    if (!this.sound) return;

    const status = await this.sound.getStatusAsync();
    if (status.isLoaded) {
      this.position = (status.positionMillis ?? 0) / 1000;
    }

    await this.sound.pauseAsync();
    this.playing = false;
  }

  async resume(): Promise<void> {
    if (!this.sound) return;

    await this.sound.playAsync();
    this.playing = true;
  }

  seek(position: number): void {
    this.position = position;
    if (this.sound) {
      this.sound.setPositionAsync(position * 1000);
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

  private handlePlaybackStatus = (status: AVPlaybackStatus): void => {
    if (status.isLoaded) {
      this.position = (status.positionMillis ?? 0) / 1000;
      this.playing = status.isPlaying ?? false;
    }
  };

  private async unloadSound(): Promise<void> {
    if (this.sound) {
      this.sound.setOnPlaybackStatusUpdate(null);
      await this.sound.unloadAsync();
      this.sound = null;
    }
  }
}
