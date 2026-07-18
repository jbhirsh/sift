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
  // Pre-seeded "- Sifted" companion for Road Trip so the already-sifted
  // Re-sift Playlist flow is exercisable in E2E (the mock is stateless, so
  // playlists created at runtime never show up in loadPlaylists).
  'playlist-4': [3, 6],
};

const MOCK_PLAYLISTS: Playlist[] = [
  { id: 'playlist-1', name: 'Chill Vibes', trackCount: MOCK_PLAYLIST_TRACK_INDICES['playlist-1'].length },
  { id: 'playlist-2', name: 'Workout Mix', trackCount: MOCK_PLAYLIST_TRACK_INDICES['playlist-2'].length },
  { id: 'playlist-3', name: 'Road Trip', trackCount: MOCK_PLAYLIST_TRACK_INDICES['playlist-3'].length },
  { id: 'playlist-4', name: 'Road Trip - Sifted', trackCount: MOCK_PLAYLIST_TRACK_INDICES['playlist-4'].length },
];

// ── Failure injection (E2E / unit tests) ───────────────
//
// EXPO_PUBLIC_MOCK_FAIL_ADDS=<n> makes the FIRST n addToPlaylist calls of
// each app launch reject (each exactly once); later calls succeed.
// EXPO_PUBLIC_MOCK_FAIL_REMOVES=<n> does the same for removeFromLibrary
// (and ONLY removeFromLibrary — removeFromPlaylist is deliberately never
// injected, see below). Unset or invalid → zero injected failures, i.e.
// default behavior is unchanged.
//
// The counters are module-scoped, not per-instance: every useMusicProvider
// hook instance constructs its own MockMusicProvider (keeps add through the
// sifting screen's instance, the Done fallback saves through its own), and
// the injection must count them as one launch-wide series. With
// FAIL_ADDS=2 a playlist sift walks the full failure/recovery path in one
// launch:
//   add #1 (keepTrack)        rejects → the keep buffers as a pending keep
//   add #2 (Done fallback)    rejects → failed-save error + Retry appear
//   add #3 (Retry)            succeeds → success confirmation
// With FAIL_REMOVES=1 a library sift's first Remove decision fails,
// surfacing the removal-errors warning block on Done.
//
// EXPO_PUBLIC_* env is baked into the bundle at build time (see the
// e2e-simulator profile in eas.json), so both knobs apply to every flow of
// an E2E build. That is only safe because of a flow audit:
//   - addToPlaylist: flows 01-08 never call it (library sifts no-op
//     keepTrack; "Chill Vibes" has no companion, so its keeps buffer and
//     the Done fallback goes through createPlaylist; flow 08's re-sift
//     only clears). Only 09_save_failure_retry.yaml triggers adds.
//   - removeFromLibrary: only flows 03 and 11 tap Remove on a library
//     sift. Flow 03 never reaches the Done screen and asserts only
//     DECIDE-driven stats, which a silently-failing native removal does
//     not change; 11_removal_error.yaml is the flow built around it.
//   - removeFromPlaylist is NOT injectable on purpose: Start Over /
//     Re-sift clears (flows 08 and 09) depend on it succeeding, and a
//     launch-wide counter cannot distinguish a sift-decision remove from
//     a clear. Playlist-removal failure UI stays covered by unit tests
//     until a launch-argument mechanism can scope injection per flow.
let injectedAddFailures = 0;
let injectedRemoveFailures = 0;

function requestedFailures(raw: string | undefined): number {
  if (!raw) return 0;
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) || parsed < 0 ? 0 : parsed;
}

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

  async removeFromLibrary(_trackIDs: string[]): Promise<void> {
    await delay(200);
    if (injectedRemoveFailures < requestedFailures(process.env.EXPO_PUBLIC_MOCK_FAIL_REMOVES)) {
      injectedRemoveFailures += 1;
      throw new Error('Simulated remove failure (EXPO_PUBLIC_MOCK_FAIL_REMOVES)');
    }
  }

  async removeFromPlaylist(_playlistID: string, _trackIDs: string[]): Promise<void> {
    await delay(200);
  }

  async addToLibrary(_trackIDs: string[]): Promise<void> {
    await delay(200);
  }

  async addToPlaylist(_playlistID: string, _trackIDs: string[]): Promise<void> {
    await delay(200);
    if (injectedAddFailures < requestedFailures(process.env.EXPO_PUBLIC_MOCK_FAIL_ADDS)) {
      injectedAddFailures += 1;
      throw new Error('Simulated add failure (EXPO_PUBLIC_MOCK_FAIL_ADDS)');
    }
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
