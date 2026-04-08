export interface MusicKitTrack {
  id: string;
  name: string;
  artist: string;
  album: string;
  duration: number;
  playCount: number;
  dateAdded: string;
  artworkURL: string | null;
}

export interface MusicKitPlaylist {
  id: string;
  name: string;
  trackCount: number;
  artworkURL: string | null;
}

export interface PlaybackState {
  position: number;
  isPlaying: boolean;
}
