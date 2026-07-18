import { Platform } from 'react-native';
import * as Sentry from '@sentry/react-native';
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
    createPlaylist(name: string, trackIDs: string[]): Promise<number>;
    removeFromLibrary(trackIDs: string[]): Promise<void>;
    removeFromPlaylist(playlistID: string, trackIDs: string[]): Promise<void>;
    addToLibrary(trackIDs: string[]): Promise<void>;
    addToPlaylist(playlistID: string, trackIDs: string[]): Promise<number>;
    loadPlaylists(): Promise<MusicKitPlaylist[]>;
    loadPlaylistTracks(playlistID: string): Promise<MusicKitTrack[]>;
    // Optional: development builds made before the cache-warming native
    // function shipped don't expose it.
    warmSongCache?(trackIDs: string[]): Promise<number>;
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
    const included = await this.native.createPlaylist(name, trackIDs);
    // The native module skips IDs it cannot resolve via library or catalog
    // and reports how many tracks actually made it in. Surface any shortfall
    // as an error so callers buffer/report instead of assuming success.
    if (included < trackIDs.length) {
      throw new Error(
        `${trackIDs.length - included} of ${trackIDs.length} tracks could not be resolved and were left out of "${name}"`,
      );
    }
  }

  async removeFromLibrary(trackIDs: string[]): Promise<void> {
    return this.native.removeFromLibrary(trackIDs);
  }

  async removeFromPlaylist(playlistID: string, trackIDs: string[]): Promise<void> {
    return this.native.removeFromPlaylist(playlistID, trackIDs);
  }

  async addToLibrary(trackIDs: string[]): Promise<void> {
    return this.native.addToLibrary(trackIDs);
  }

  async addToPlaylist(playlistID: string, trackIDs: string[]): Promise<void> {
    const added = await this.native.addToPlaylist(playlistID, trackIDs);
    // See createPlaylist: a shortfall means some tracks were unresolvable
    // and silently skipped natively — turn that into a visible failure so
    // keepTrack buffers the track via ADD_PENDING_KEEP.
    if (added < trackIDs.length) {
      throw new Error(
        `${trackIDs.length - added} of ${trackIDs.length} tracks could not be added to the playlist`,
      );
    }
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
    // Observability: tracks the native module could not resolve to a library
    // Song fall back to bare Track metadata, which carries playCount 0 and
    // dateAdded "" — silently mis-sorting least-played/oldest sifts. That
    // signature (both fields defaulted together) is how a fallback presents
    // in the payload; breadcrumb only, the tracks themselves are still fine.
    const fellBack = raw.filter((t) => t.playCount === 0 && t.dateAdded === '').length;
    if (fellBack > 0) {
      Sentry.addBreadcrumb({
        category: 'music-provider',
        message: `loadPlaylistTracks: ${fellBack} of ${raw.length} tracks fell back to Track metadata (playCount 0 / dateAdded "") — least-played/oldest sorts may misplace them`,
        level: 'warning',
      });
    }
    return raw.map(mapTrack);
  }

  async warmSongCache(trackIDs: string[]): Promise<number> {
    // Tolerate a native module that predates warmSongCache (stale dev
    // build): resume then simply skips cache warming instead of throwing.
    return (await this.native.warmSongCache?.(trackIDs)) ?? 0;
  }
}
