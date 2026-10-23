import { Platform } from 'react-native';
import * as Sentry from '@sentry/react-native';
import type { MusicProviderService } from './MusicProviderInterface';
import type { Playlist, SiftSource, Track } from '../types';
import { APPLE_REMOVED_PLAYLIST } from '../utils/libraryRemovals';
import { createSerialQueue } from '../utils/serialQueue';
import { TrackIndex } from '../utils/trackIdentity';
import {
  AddShortfallError,
  batches,
  bestPreviewCandidate,
  canonicalPairing,
  collectPages,
  countAdded,
  countCached,
  LIBRARY_PAGE_SIZE,
  LOOKUP_BATCH_SIZE,
  NO_TRACKS_FOUND,
  PLAYLISTS_PAGE_SIZE,
  PREVIEW_SEARCH_LIMIT,
  preferSongs,
  toCandidate,
  toPlaylist,
  toTrack,
  uniqueInOrder,
  type CandidateSong,
  type RawTrack,
} from '../utils/musicKit';

/** The native module's API, typed from its wrapper so the two can't drift. */
type NativeMusicKit = typeof import('../../modules/expo-musickit/src/index');

// How long a write that never settles holds up the next one.
export const WRITE_STALL_MS = 30000;
// How long a playlist created here counts when the library doesn't list it
// yet. Long enough for the library to catch up, short enough that one the
// user has since deleted in Music isn't used again.
export const RECENT_PLAYLIST_SECONDS = 60;

/**
 * Lazily load the native MusicKit module.
 * Throws a clear error when the module isn't available (Android, web, or
 * Expo Go where native modules aren't linked).
 */
function getNativeModule(): NativeMusicKit {
  if (Platform.OS !== 'ios') {
    throw new Error(
      'AppleMusicProvider is only available on iOS. ' + `Current platform: ${Platform.OS}`,
    );
  }

  const mod: NativeMusicKit | undefined = require('../../modules/expo-musickit/src/index');
  if (!mod) {
    throw new Error(
      'Native MusicKit module is not available. ' +
        'This usually means you are running in Expo Go. ' +
        'Use a development build (EAS Build) to access native modules.',
    );
  }
  return mod as NativeMusicKit;
}

/**
 * Apple Music through the thin native module: the native side asks MusicKit
 * one thing per call, and the steps and decisions are here and in
 * utils/musicKit, so they ship with an EAS Update.
 */
export class AppleMusicProvider implements MusicProviderService {
  private native = getNativeModule();
  // Every write to the library goes through here, one at a time. A playlist
  // removal reads the playlist and writes it back without the removed
  // entries, so two at once would each write back the other's entry; and
  // two first library Removes would each create a "Sift — Removed".
  private writes = createSerialQueue(WRITE_STALL_MS);
  // Whether this launch made a "Sift — Removed". When every one found
  // refuses a song, another is made only if not: a failure that isn't the
  // playlist's (no network) mustn't leave a trail of empty copies.
  private madeRemovedPlaylist = false;

  async requestAuthorization(): Promise<boolean> {
    return this.native.requestAuthorization();
  }

  async isAuthorized(): Promise<boolean> {
    const status = this.native.getAuthorizationStatus();
    return status === 'authorized';
  }

  async loadLibrary(): Promise<Track[]> {
    const raw = await collectPages(
      (offset, limit) => this.native.loadLibraryPage(offset, limit),
      LIBRARY_PAGE_SIZE,
    );
    return raw.map(toTrack);
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

  /**
   * An empty playlist, made at once so its id is known before anything is
   * added (an add that fails can't then lose it, or lead to a second).
   */
  createPlaylist(name: string): Promise<string> {
    return this.writes.run(() => this.native.createEmptyPlaylist(name));
  }

  /**
   * Every playlist with this name, plus one created here in the last
   * RECENT_PLAYLIST_SECONDS that the library doesn't list yet.
   */
  findPlaylists(name: string): Promise<string[]> {
    return this.native.findPlaylistsByName(name, RECENT_PLAYLIST_SECONDS, PLAYLISTS_PAGE_SIZE);
  }

  /** Once every write queued so far has finished, one that timed out too. */
  writesSettled(): Promise<void> {
    return this.writes.settled();
  }

  /**
   * A Remove, from a library or a playlist sift: Apple doesn't let apps
   * delete library songs, or edit a playlist they didn't create, so collect
   * them in the "Sift — Removed" playlist for the user to delete in Music.
   */
  removeFromLibrary(trackIDs: string[]): Promise<void> {
    return this.writes.run(() => this.removeFromLibraryNow(trackIDs));
  }

  private async removeFromLibraryNow(trackIDs: string[]): Promise<void> {
    await this.lookUpLibrarySongs(trackIDs);
    const kinds = this.native.cachedKinds(trackIDs);
    // A library song, or a playlist entry that isn't one (a music video, or
    // a song added with Music's playlist-songs-to-library setting off): it
    // goes on the list too, for the user to take out of the playlist.
    const songIDs = trackIDs.filter((_, i) => kinds[i] != null);
    if (songIDs.length === 0) throw new Error(NO_TRACKS_FOUND);

    // MusicKit edits only playlists Sift made, and one the user made by this
    // name takes nothing: try each in turn, and make one when none takes a
    // song.
    let moved = 0;
    const found = await this.native.findPlaylistsByName(
      APPLE_REMOVED_PLAYLIST,
      RECENT_PLAYLIST_SECONDS,
      PLAYLISTS_PAGE_SIZE,
    );
    for (const id of found) {
      moved = countAdded(await this.native.addEachToPlaylist(id, songIDs));
      if (moved > 0) break;
    }
    if (moved === 0 && (found.length === 0 || !this.madeRemovedPlaylist)) {
      this.madeRemovedPlaylist = true;
      const playlistID = await this.native.createEmptyPlaylist(APPLE_REMOVED_PLAYLIST);
      moved = countAdded(await this.native.addEachToPlaylist(playlistID, songIDs));
    }
    if (moved < songIDs.length) {
      throw new Error(
        `${songIDs.length - moved} of ${songIDs.length} songs could not be moved to "${APPLE_REMOVED_PLAYLIST}"`,
      );
    }
  }

  removeFromPlaylist(playlistID: string, trackIDs: string[]): Promise<number> {
    return this.writes.run(() => this.native.removeFromPlaylist(playlistID, trackIDs));
  }

  /**
   * Out of every "Sift — Removed": a lookup that missed a just-created one
   * can make a second. One the user made by that name can't be edited
   * (MusicKit edits only playlists Sift created): it's skipped, and only
   * fails the Restore when nothing came out anywhere.
   */
  restoreRemoved(trackIDs: string[]): Promise<number> {
    return this.writes.run(async () => {
      let out = 0;
      let failure: unknown = null;
      for (const id of await this.native.findPlaylistsByName(
        APPLE_REMOVED_PLAYLIST,
        RECENT_PLAYLIST_SECONDS,
        PLAYLISTS_PAGE_SIZE,
      )) {
        try {
          out += await this.native.removeFromPlaylist(id, trackIDs);
        } catch (err) {
          failure ??= err;
        }
      }
      if (out === 0 && failure != null) throw failure;
      return out;
    });
  }

  /**
   * Whether removing the track already took effect: whatever the sift, a
   * removed song is in a "Sift — Removed".
   */
  async removalLanded(_source: SiftSource, trackID: string): Promise<boolean> {
    for (const id of await this.native.findPlaylistsByName(
      APPLE_REMOVED_PLAYLIST,
      RECENT_PLAYLIST_SECONDS,
      PLAYLISTS_PAGE_SIZE,
    )) {
      if ((await this.native.loadPlaylistItems(id)).some((item) => item.id === trackID))
        return true;
    }
    return false;
  }

  async deletedFromLibrary(tracks: Track[]): Promise<string[]> {
    if (tracks.length === 0) return [];
    // Still in a "Sift — Removed" (by id or by song, as playlists can file
    // a song under another id): not deleted.
    const listed = new TrackIndex();
    for (const id of await this.native.findPlaylistsByName(
      APPLE_REMOVED_PLAYLIST,
      RECENT_PLAYLIST_SECONDS,
      PLAYLISTS_PAGE_SIZE,
    )) {
      for (const item of await this.native.loadPlaylistItems(id)) listed.add(toTrack(item));
    }
    const unlisted = tracks.filter((track) => !listed.has(track));
    // Gone from the library too: the lookup found no song, and didn't fail.
    const gone = new Set<string>();
    for (const batch of batches(
      unlisted.map((track) => track.id),
      LOOKUP_BATCH_SIZE,
    )) {
      for (const result of await this.native.lookupLibrarySongs(batch)) {
        if (!result.failed && result.song == null) gone.add(result.id);
      }
    }
    return unlisted.filter((track) => gone.has(track.id)).map((track) => track.id);
  }

  addToLibrary(trackIDs: string[]): Promise<void> {
    return this.writes.run(() => this.addToLibraryNow(trackIDs));
  }

  private async addToLibraryNow(trackIDs: string[]): Promise<void> {
    await this.lookUpLibrarySongs(trackIDs);
    // Ids with no library song are skipped; a song MusicKit refuses fails
    // the call.
    const results = await this.native.addEachToLibrary(trackIDs);
    const failed = results.filter((result) => result === 'failed').length;
    if (failed > 0) {
      throw new Error(`${failed} of ${trackIDs.length} tracks could not be added to the library`);
    }
  }

  addToPlaylist(playlistID: string, trackIDs: string[]): Promise<void> {
    return this.writes.run(() => this.addToPlaylistNow(playlistID, trackIDs));
  }

  private async addToPlaylistNow(playlistID: string, trackIDs: string[]): Promise<void> {
    await this.resolveIntoCaches(trackIDs);
    // A shortfall means some tracks couldn't be resolved or added; turn it
    // into a visible failure, with the counts of each, so the caller can
    // tell what's worth trying again.
    const shortfall = AddShortfallError.of(
      await this.native.addEachToPlaylist(playlistID, trackIDs),
    );
    if (shortfall) throw shortfall;
  }

  async loadPlaylists(): Promise<Playlist[]> {
    const raw = await collectPages(
      (offset, limit) => this.native.loadPlaylistsPage(offset, limit),
      PLAYLISTS_PAGE_SIZE,
    );
    return raw.map(toPlaylist);
  }

  async loadPlaylistTracks(playlistID: string): Promise<Track[]> {
    const items = await this.native.loadPlaylistItems(playlistID);
    // Library songs carry play counts and dates added; playlist entries
    // don't. Use the library song where there is one. A failed lookup just
    // keeps the entry.
    const songs = new Map<string, RawTrack>();
    for (const batch of batches(
      items.map((item) => item.id),
      LOOKUP_BATCH_SIZE,
    )) {
      for (const result of await this.native.lookupLibrarySongs(batch)) {
        if (result.song) songs.set(result.id, result.song);
      }
    }
    const merged = preferSongs(items, songs);
    // Observability: entries with no library song have no play count or
    // date added, which can misplace them in least-played/oldest sorts.
    // Breadcrumb only; the tracks themselves are fine.
    const entriesOnly = merged.filter((track) => track.kind === 'track').length;
    if (entriesOnly > 0) {
      Sentry.addBreadcrumb({
        category: 'music-provider',
        message: `loadPlaylistTracks: ${entriesOnly} of ${merged.length} tracks have no library song (no play count or date added) — least-played/oldest sorts may misplace them`,
        level: 'warning',
      });
    }
    return merged.map(toTrack);
  }

  async warmSongCache(trackIDs: string[], playlistID?: string): Promise<number> {
    // A playlist's entries come back only by loading the playlist: a music
    // video in one is neither a library nor a catalog song, so the lookups
    // below can't find it, and after a relaunch it couldn't be played or
    // kept (#54). Reload it as the first session did; if it's gone, the
    // lookups still resolve what they can.
    if (playlistID != null) {
      try {
        await this.loadPlaylistTracks(playlistID);
      } catch (err) {
        Sentry.addBreadcrumb({
          category: 'music-provider',
          message: `warmSongCache: reloading the playlist failed (${err instanceof Error ? err.message : String(err)})`,
          level: 'warning',
        });
      }
    }
    await this.resolveIntoCaches(trackIDs);
    // How many of the requested ids can now be played or added, so a
    // genuine shortfall can be breadcrumbed.
    return countCached(this.native.cachedKinds(trackIDs));
  }

  /**
   * Where the track's preview clip starts within the full track ("Start at
   * chorus"). Library songs usually carry no preview, so borrow the
   * catalog's: by ISRC, else the closest-duration search hit with the same
   * title and artist. Throws while the track isn't loaded yet, so the
   * caller retries.
   */
  async previewOffset(trackID: string): Promise<number | null> {
    const info = await this.native.previewInfo(trackID);
    if (!info) return null;
    let url = info.previewURL;
    if (!url && info.isrc) url = await this.native.catalogPreviewForISRC(info.isrc);
    if (!url) {
      const hits = await this.native.searchCatalogSongs(
        `${info.title} ${info.artist}`,
        PREVIEW_SEARCH_LIMIT,
      );
      const song = { id: trackID, title: info.title, artist: info.artist, duration: info.duration };
      url = bestPreviewCandidate(song, hits)?.previewURL ?? null;
    }
    return url ? this.native.shazamOffset(url) : null;
  }

  /**
   * Cache a library song for every id that has none, failing the call if a
   * lookup itself fails (a Remove or restore must not half-run on a
   * transient error). Ids not in the library just stay without a song.
   */
  private async lookUpLibrarySongs(trackIDs: string[]): Promise<void> {
    const kinds = this.native.cachedKinds(trackIDs);
    const missing = uniqueInOrder(trackIDs.filter((_, i) => kinds[i] !== 'song'));
    for (const batch of batches(missing, LOOKUP_BATCH_SIZE)) {
      const failed = (await this.native.lookupLibrarySongs(batch)).filter(
        (result) => result.failed,
      ).length;
      if (failed > 0)
        throw new Error(`Library lookup failed for ${failed} of ${batch.length} songs`);
    }
  }

  /**
   * Cache something playable/addable for every id that has nothing: a
   * library song, else the catalog's song. Lookup failures are tolerated;
   * ids that stay unresolved show up in the callers' shortfall counts.
   * `known` is the requested songs' metadata where the caller has it: it
   * lets a catalog answer under a different id be filed under the
   * requested one (see canonicalPairing). Without it, such an answer stays
   * unpaired, the safe default.
   */
  private async resolveIntoCaches(
    trackIDs: string[],
    known?: ReadonlyMap<string, CandidateSong>,
  ): Promise<void> {
    const kinds = this.native.cachedKinds(trackIDs);
    const missing = uniqueInOrder(trackIDs.filter((_, i) => kinds[i] == null));
    const notInLibrary: string[] = [];
    for (const batch of batches(missing, LOOKUP_BATCH_SIZE)) {
      for (const result of await this.native.lookupLibrarySongs(batch)) {
        if (!result.song) notInLibrary.push(result.id);
      }
    }
    for (const batch of batches(notInLibrary, LOOKUP_BATCH_SIZE)) {
      let answers: RawTrack[];
      try {
        answers = await this.native.lookupCatalogSongs(batch);
      } catch {
        continue; // offline or no subscription: these stay unresolved
      }
      const requested = new Set(batch);
      const batchKinds = this.native.cachedKinds(batch);
      const unanswered = batch.filter((_, i) => batchKinds[i] == null);
      const unmatched = answers.filter((answer) => !requested.has(answer.id)).map(toCandidate);
      const pairing = canonicalPairing(
        unanswered,
        unmatched,
        unanswered.length === 1 ? known?.get(unanswered[0]) : undefined,
      );
      if (pairing) this.native.aliasCachedItem(pairing.response.id, pairing.requestID);
    }
  }
}
