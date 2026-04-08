import type { MusicProviderService } from './MusicProviderInterface';
import type { Playlist, Track } from '../types';

/**
 * Mock tracks matching the Swift SimulatorMusicService.
 * Used for development and testing without a native module.
 */
const MOCK_LIBRARY_TRACKS: Track[] = [
  {
    id: 'mock-1',
    name: 'Bohemian Rhapsody',
    artist: 'Queen',
    album: 'A Night at the Opera',
    duration: 354,
    playCount: 142,
    dateAdded: '2019-03-15T10:30:00.000Z',
    artworkURL: undefined,
  },
  {
    id: 'mock-2',
    name: 'Blinding Lights',
    artist: 'The Weeknd',
    album: 'After Hours',
    duration: 200,
    playCount: 87,
    dateAdded: '2020-11-22T14:15:00.000Z',
    artworkURL: undefined,
  },
  {
    id: 'mock-3',
    name: 'Levitating',
    artist: 'Dua Lipa',
    album: 'Future Nostalgia',
    duration: 203,
    playCount: 64,
    dateAdded: '2021-01-10T09:45:00.000Z',
    artworkURL: undefined,
  },
  {
    id: 'mock-4',
    name: 'drivers license',
    artist: 'Olivia Rodrigo',
    album: 'SOUR',
    duration: 242,
    playCount: 31,
    dateAdded: '2021-05-18T16:20:00.000Z',
    artworkURL: undefined,
  },
  {
    id: 'mock-5',
    name: 'Stay',
    artist: 'The Kid LAROI & Justin Bieber',
    album: 'F*ck Love 3: Over You',
    duration: 141,
    playCount: 53,
    dateAdded: '2021-07-09T11:00:00.000Z',
    artworkURL: undefined,
  },
  {
    id: 'mock-6',
    name: 'good 4 u',
    artist: 'Olivia Rodrigo',
    album: 'SOUR',
    duration: 178,
    playCount: 45,
    dateAdded: '2021-05-18T16:25:00.000Z',
    artworkURL: undefined,
  },
  {
    id: 'mock-7',
    name: 'Peaches',
    artist: 'Justin Bieber ft. Daniel Caesar & Giveon',
    album: 'Justice',
    duration: 198,
    playCount: 28,
    dateAdded: '2021-03-19T08:30:00.000Z',
    artworkURL: undefined,
  },
  {
    id: 'mock-8',
    name: 'Montero (Call Me By Your Name)',
    artist: 'Lil Nas X',
    album: 'Montero',
    duration: 137,
    playCount: 39,
    dateAdded: '2021-09-17T13:10:00.000Z',
    artworkURL: undefined,
  },
  {
    id: 'mock-9',
    name: 'Kiss Me More',
    artist: 'Doja Cat ft. SZA',
    album: 'Planet Her',
    duration: 208,
    playCount: 56,
    dateAdded: '2021-06-25T15:45:00.000Z',
    artworkURL: undefined,
  },
  {
    id: 'mock-10',
    name: 'Heat Waves',
    artist: 'Glass Animals',
    album: 'Dreamland',
    duration: 238,
    playCount: 72,
    dateAdded: '2020-08-07T12:00:00.000Z',
    artworkURL: undefined,
  },
];

/** Maps each mock playlist ID to a subset of MOCK_LIBRARY_TRACKS by index. */
const MOCK_PLAYLIST_TRACK_INDICES: Record<string, number[]> = {
  'playlist-1': [0, 2, 9],
  'playlist-2': [1, 4, 5, 7],
  'playlist-3': [3, 6, 8],
};

const MOCK_PLAYLISTS: Playlist[] = [
  { id: 'playlist-1', name: 'Chill Vibes', trackCount: MOCK_PLAYLIST_TRACK_INDICES['playlist-1'].length },
  { id: 'playlist-2', name: 'Workout Mix', trackCount: MOCK_PLAYLIST_TRACK_INDICES['playlist-2'].length },
  { id: 'playlist-3', name: 'Road Trip', trackCount: MOCK_PLAYLIST_TRACK_INDICES['playlist-3'].length },
];

/**
 * Mock music provider for development and testing.
 * Simulates playback with a timer-based position counter,
 * similar to the Swift SimulatorMusicService.
 */
export class MockMusicProvider implements MusicProviderService {
  private position = 0;
  private playing = false;
  private playStartTime = 0;
  private playStartPosition = 0;
  private currentTrackDuration = 0;

  async requestAuthorization(): Promise<boolean> {
    return true;
  }

  async isAuthorized(): Promise<boolean> {
    return true;
  }

  async loadLibrary(): Promise<Track[]> {
    // Simulate a short network delay
    await delay(300);
    return [...MOCK_LIBRARY_TRACKS];
  }

  async play(trackID: string, position?: number): Promise<void> {
    const track = MOCK_LIBRARY_TRACKS.find((t) => t.id === trackID);
    this.currentTrackDuration = track?.duration ?? 240;
    this.position = position ?? 0;
    this.playing = true;
    this.playStartTime = Date.now();
    this.playStartPosition = this.position;
  }

  async pause(): Promise<void> {
    if (this.playing) {
      this.position = this.computePosition();
      this.playing = false;
    }
  }

  async resume(): Promise<void> {
    if (!this.playing) {
      this.playing = true;
      this.playStartTime = Date.now();
      this.playStartPosition = this.position;
    }
  }

  seek(position: number): void {
    this.position = Math.max(0, Math.min(position, this.currentTrackDuration));
    if (this.playing) {
      this.playStartTime = Date.now();
      this.playStartPosition = this.position;
    }
  }

  getPlaybackState(): { position: number; isPlaying: boolean } {
    return {
      position: this.computePosition(),
      isPlaying: this.playing,
    };
  }

  async createPlaylist(_name: string, _trackIDs: string[]): Promise<void> {
    // Simulate a short API delay
    await delay(500);
  }

  async loadPlaylists(): Promise<Playlist[]> {
    await delay(200);
    return [...MOCK_PLAYLISTS];
  }

  async loadPlaylistTracks(playlistID: string): Promise<Track[]> {
    await delay(300);
    const indices = MOCK_PLAYLIST_TRACK_INDICES[playlistID];
    if (!indices) return [];
    return indices.map((i) => ({ ...MOCK_LIBRARY_TRACKS[i] }));
  }

  /** Compute the current position based on elapsed wall-clock time. */
  private computePosition(): number {
    if (!this.playing) return this.position;
    const elapsed = (Date.now() - this.playStartTime) / 1000;
    return Math.min(this.playStartPosition + elapsed, this.currentTrackDuration);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
