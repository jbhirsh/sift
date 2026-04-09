import { requireNativeModule } from 'expo-modules-core';
import type { MusicKitPlaylist, MusicKitTrack, PlaybackState } from './ExpoMusicKit.types';

const ExpoMusicKit = requireNativeModule('ExpoMusicKit');

export async function requestAuthorization(): Promise<boolean> {
  return ExpoMusicKit.requestAuthorization();
}

export function getAuthorizationStatus(): string {
  return ExpoMusicKit.getAuthorizationStatus();
}

export async function loadLibrary(sortOrder: string, offset: number, limit: number): Promise<MusicKitTrack[]> {
  return ExpoMusicKit.loadLibrary(sortOrder, offset, limit);
}

export async function loadFullLibrary(): Promise<MusicKitTrack[]> {
  return ExpoMusicKit.loadFullLibrary();
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

export async function createPlaylist(name: string, trackIDs: string[]): Promise<void> {
  return ExpoMusicKit.createPlaylist(name, trackIDs);
}

export async function loadPlaylists(): Promise<MusicKitPlaylist[]> {
  return ExpoMusicKit.loadPlaylists();
}

export async function loadPlaylistTracks(playlistID: string): Promise<MusicKitTrack[]> {
  return ExpoMusicKit.loadPlaylistTracks(playlistID);
}

export async function removeFromLibrary(trackIDs: string[]): Promise<void> {
  return ExpoMusicKit.removeFromLibrary(trackIDs);
}

export async function removeFromPlaylist(playlistID: string, trackIDs: string[]): Promise<void> {
  return ExpoMusicKit.removeFromPlaylist(playlistID, trackIDs);
}

export async function addToLibrary(trackIDs: string[]): Promise<void> {
  return ExpoMusicKit.addToLibrary(trackIDs);
}

export async function addToPlaylist(playlistID: string, trackIDs: string[]): Promise<void> {
  return ExpoMusicKit.addToPlaylist(playlistID, trackIDs);
}

export async function resolveArtworkURL(trackID: string, width: number, height: number): Promise<string | null> {
  return ExpoMusicKit.resolveArtworkURL(trackID, width, height);
}

export type { MusicKitPlaylist, MusicKitTrack, PlaybackState };
