import { requireNativeModule } from 'expo';
import type {
  AddResult,
  CachedKind,
  CatalogSearchHit,
  LibrarySongLookup,
  MusicKitPlaylist,
  MusicKitTrack,
  PlaybackState,
  PreviewInfo,
} from './ExpoMusicKit.types';

// A thin bridge: each function asks MusicKit, ShazamKit or the player one
// thing. The decisions live in src/utils/musicKit and AppleMusicProvider.

const ExpoMusicKit = requireNativeModule('ExpoMusicKit');

export async function requestAuthorization(): Promise<boolean> {
  return ExpoMusicKit.requestAuthorization();
}

export function getAuthorizationStatus(): string {
  return ExpoMusicKit.getAuthorizationStatus();
}

/** One page of library songs. */
export async function loadLibraryPage(offset: number, limit: number): Promise<MusicKitTrack[]> {
  return ExpoMusicKit.loadLibraryPage(offset, limit);
}

/** One page of library playlists. */
export async function loadPlaylistsPage(offset: number, limit: number): Promise<MusicKitPlaylist[]> {
  return ExpoMusicKit.loadPlaylistsPage(offset, limit);
}

/** A playlist's entries, in order. */
export async function loadPlaylistItems(playlistID: string): Promise<MusicKitTrack[]> {
  return ExpoMusicKit.loadPlaylistItems(playlistID);
}

/** Each id looked up as a library song; one result per id, in order. */
export async function lookupLibrarySongs(ids: string[]): Promise<LibrarySongLookup[]> {
  return ExpoMusicKit.lookupLibrarySongs(ids);
}

/** One catalog request; every song the catalog answered with. */
export async function lookupCatalogSongs(ids: string[]): Promise<MusicKitTrack[]> {
  return ExpoMusicKit.lookupCatalogSongs(ids);
}

/** File the item cached under `fromID` under `toID` too. */
export function aliasCachedItem(fromID: string, toID: string): boolean {
  return ExpoMusicKit.aliasCachedItem(fromID, toID);
}

/** What is cached for each id. */
export function cachedKinds(ids: string[]): CachedKind[] {
  return ExpoMusicKit.cachedKinds(ids);
}

export async function play(trackID: string, position: number = 0): Promise<void> {
  return ExpoMusicKit.play(trackID, position);
}

export async function pause(): Promise<void> {
  return ExpoMusicKit.pause();
}

export async function resume(): Promise<void> {
  return ExpoMusicKit.resume();
}

export function seek(position: number): void {
  ExpoMusicKit.seek(position);
}

export function getPlaybackState(): PlaybackState {
  return ExpoMusicKit.getPlaybackState();
}

/** Create an empty playlist; resolves to its id. */
export async function createEmptyPlaylist(name: string): Promise<string> {
  return ExpoMusicKit.createEmptyPlaylist(name);
}

/**
 * The ids of every library playlist with exactly this name (read `pageSize`
 * at a time), then any created here within the last `recentSeconds` that the
 * library doesn't list yet.
 */
export async function findPlaylistsByName(name: string, recentSeconds: number, pageSize: number): Promise<string[]> {
  return ExpoMusicKit.findPlaylistsByName(name, recentSeconds, pageSize);
}

/** Add each cached item to the playlist; one result per id, in order. */
export async function addEachToPlaylist(playlistID: string, ids: string[]): Promise<AddResult[]> {
  return ExpoMusicKit.addEachToPlaylist(playlistID, ids);
}

/** Remove entries from a playlist this app created; resolves to how many came out. */
export async function removeFromPlaylist(playlistID: string, trackIDs: string[]): Promise<number> {
  return ExpoMusicKit.removeFromPlaylist(playlistID, trackIDs);
}

/** Add each cached song to the library; one result per id, in order. */
export async function addEachToLibrary(ids: string[]): Promise<AddResult[]> {
  return ExpoMusicKit.addEachToLibrary(ids);
}

/** What is known about a cached song's preview; null if it isn't a song. */
export async function previewInfo(trackID: string): Promise<PreviewInfo | null> {
  return ExpoMusicKit.previewInfo(trackID);
}

export async function catalogPreviewForISRC(isrc: string): Promise<string | null> {
  return ExpoMusicKit.catalogPreviewForISRC(isrc);
}

export async function searchCatalogSongs(term: string, limit: number): Promise<CatalogSearchHit[]> {
  return ExpoMusicKit.searchCatalogSongs(term, limit);
}

/** Where the preview clip sits in its recording (ShazamKit), or null. */
export async function shazamOffset(previewURL: string): Promise<number | null> {
  return ExpoMusicKit.shazamOffset(previewURL);
}

export async function resolveArtworkURL(trackID: string, width: number, height: number): Promise<string | null> {
  return ExpoMusicKit.resolveArtworkURL(trackID, width, height);
}

export type {
  AddResult,
  CachedKind,
  CatalogSearchHit,
  LibrarySongLookup,
  MusicKitPlaylist,
  MusicKitTrack,
  PlaybackState,
  PreviewInfo,
};
