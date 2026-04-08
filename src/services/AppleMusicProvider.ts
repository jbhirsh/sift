import { Platform } from 'react-native';
import type { MusicProviderService } from './MusicProviderInterface';
import type { Playlist, Track } from '../types';

/**
 * Raw track shape returned by the native MusicKit module.
 * Maps to the app's Track type with minor differences (null vs undefined).
 */
interface MusicKitTrack {
  id: string;
  name: string;
  artist: string;
  album: string;
  duration: number;
  playCount: number;
  dateAdded: string;
  artworkURL: string | null;
}

interface MusicKitPlaylist {
  id: string;
  name: string;
  trackCount: number;
  artworkURL: string | null;
}

/** Map a native MusicKitTrack to the app's Track type. */
function mapTrack(raw: MusicKitTrack): Track {
  return {
    id: raw.id,
    name: raw.name,
    artist: raw.artist,
    album: raw.album,
    duration: raw.duration,
    playCount: raw.playCount,
    dateAdded: raw.dateAdded,
    artworkURL: raw.artworkURL ?? undefined,
  };
}

/**
 * Lazily load the native MusicKit module.
 * Throws a clear error when the module isn't available (Android, web, or
 * Expo Go where native modules aren't linked).
 */
function getNativeModule() {
  if (Platform.OS !== 'ios') {
    throw new Error(
      'AppleMusicProvider is only available on iOS. ' +
        `Current platform: ${Platform.OS}`
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('../../modules/expo-musickit/src/index');
  if (!mod) {
    throw new Error(
      'Native MusicKit module is not available. ' +
        'This usually means you are running in Expo Go. ' +
        'Use a development build (EAS Build) to access native modules.'
    );
  }
  return mod as {
    requestAuthorization(): Promise<boolean>;
    getAuthorizationStatus(): string;
    loadFullLibrary(): Promise<MusicKitTrack[]>;
    play(trackID: string, position?: number): Promise<void>;
    pause(): Promise<void>;
    resume(): Promise<void>;
    seek(position: number): void;
    getPlaybackState(): { position: number; isPlaying: boolean };
    createPlaylist(name: string, trackIDs: string[]): Promise<void>;
    loadPlaylists(): Promise<MusicKitPlaylist[]>;
    loadPlaylistTracks(playlistID: string): Promise<MusicKitTrack[]>;
  };
}

export class AppleMusicProvider implements MusicProviderService {
  private native = getNativeModule();

  async requestAuthorization(): Promise<boolean> {
    return this.native.requestAuthorization();
  }

  async isAuthorized(): Promise<boolean> {
    const status = this.native.getAuthorizationStatus();
    return status === 'authorized';
  }

  async loadLibrary(): Promise<Track[]> {
    const raw = await this.native.loadFullLibrary();
    return raw.map(mapTrack);
  }

  async play(trackID: string, position?: number): Promise<void> {
    return this.native.play(trackID, position);
  }

  async pause(): Promise<void> {
    return this.native.pause();
  }

  async resume(): Promise<void> {
    return this.native.resume();
  }

  seek(position: number): void {
    this.native.seek(position);
  }

  getPlaybackState(): { position: number; isPlaying: boolean } {
    return this.native.getPlaybackState();
  }

  async createPlaylist(name: string, trackIDs: string[]): Promise<void> {
    return this.native.createPlaylist(name, trackIDs);
  }

  async loadPlaylists(): Promise<Playlist[]> {
    const raw = await this.native.loadPlaylists();
    return raw.map((p) => ({
      id: p.id,
      name: p.name,
      trackCount: p.trackCount,
      artworkURL: p.artworkURL ?? undefined,
    }));
  }

  async loadPlaylistTracks(playlistID: string): Promise<Track[]> {
    const raw = await this.native.loadPlaylistTracks(playlistID);
    return raw.map(mapTrack);
  }
}
