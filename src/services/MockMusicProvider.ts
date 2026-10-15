import type { MusicProviderService } from './MusicProviderInterface';
import type { Playlist, SiftSource, Track } from '../types';

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
  // A pre-seeded "Road Trip - Sifted" (two of Road Trip's three songs), so
  // Done's "Save kept songs as a playlist" can add to an existing playlist
  // in E2E (the mock is stateless, so playlists created at runtime never
  // show up in loadPlaylists), and Setup's picker has one to hide. Like one
  // an older build left, the first look at Road Trip remembers those two as
  // kept (services/SiftedImport).
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
// each app launch into a seeded playlist (MOCK_PLAYLISTS, not one created
// this launch) reject, each exactly once; later calls succeed.
// EXPO_PUBLIC_MOCK_FAIL_REMOVES=<n> makes removeFromLibrary fail for the
// first n songs it is asked to remove in each launch, and keep failing for
// them, so retrying a failed removal (#151) can't heal the injected failure
// the flows check (and ONLY removeFromLibrary — removeFromPlaylist is
// deliberately never injected, see below). Unset or invalid → zero injected
// failures, i.e. default behavior is unchanged.
//
// The counters are module-scoped, not per-instance, so the injection counts
// every call of a launch as one series, whichever screen makes it. With
// FAIL_ADDS=2, saving Road Trip's keeps to the pre-seeded
// "Road Trip - Sifted" walks the failure/recovery path in one launch:
//   add #1 (Save)                   rejects → error, the button says Retry
//   add #2 (Save, Done shown again) rejects → error, the button says Retry
//   add #3 (Retry)                  succeeds → saved confirmation
// With FAIL_REMOVES=1 a library sift's first removed song can't be removed,
// retries included, surfacing the removal-errors warning block on Done.
//
// EXPO_PUBLIC_* env is baked into the bundle at build time (see the
// e2e-simulator profile in eas.json), so both knobs apply to every flow of
// an E2E build. That is only safe because of a flow audit:
//   - addToPlaylist: only Done's "Save kept songs as a playlist" calls it
//     (a Keep writes nothing; a Restore takes the song out of "Sift —
//     Removed" rather than adding it back), and only adds into one of the
//     seeded playlists count: flow 07 saves "Chill Vibes", which has no
//     "- Sifted", so its save creates one and adds to that, untouched.
//     Only 09_save_failure_retry.yaml saves into a seeded playlist
//     ("Road Trip - Sifted").
//   - removeFromLibrary: every Remove goes through it, from a library or a
//     playlist sift, so each flow's first removed song fails. Flow 03 never
//     reaches the Done screen and asserts only DECIDE-driven stats, which a
//     silently-failing native removal does not change; flow 15 relies on
//     its first remove failing (the failed song is offered again by the
//     next library sift, the second is not); 11_removal_error.yaml is the
//     flow built around it, and 24_playlist_remove.yaml counts on it too.
//     The other flows that Remove assert nothing a failed removal changes.
//   - removeFromPlaylist is NOT injectable: a launch-wide counter would
//     fail any edit of a playlist Sift made that a future flow relies on.
//     Playlist-removal failure UI stays covered by unit tests until a
//     launch-argument mechanism can scope injection per flow.
let injectedAddFailures = 0;
/** Playlists createPlaylist has made this launch: id → name. */
const createdPlaylists = new Map<string, string>();
/** Songs whose library removal always fails (FAIL_REMOVES). */
const failingRemoveIds = new Set<string>();
/** Songs whose library removal landed: "in Sift — Removed". */
const landedRemoveIds = new Set<string>();

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

  async createPlaylist(name: string): Promise<string> {
    // Simulate a short API delay
    await delay(500);
    const id = `mock-created-${createdPlaylists.size + 1}`;
    createdPlaylists.set(id, name);
    return id;
  }

  async findPlaylists(name: string): Promise<string[]> {
    await delay(100);
    // Like Apple Music's lookup, which counts a playlist made this launch
    // even before the library lists it (loadPlaylists here never does).
    return [
      ...MOCK_PLAYLISTS.filter((p) => p.name === name).map((p) => p.id),
      ...[...createdPlaylists].filter(([, created]) => created === name).map(([id]) => id),
    ];
  }

  async removeFromLibrary(trackIDs: string[]): Promise<void> {
    await delay(200);
    const requested = requestedFailures(process.env.EXPO_PUBLIC_MOCK_FAIL_REMOVES);
    for (const id of trackIDs) {
      if (!failingRemoveIds.has(id) && !landedRemoveIds.has(id) && failingRemoveIds.size < requested) {
        failingRemoveIds.add(id);
      }
    }
    if (trackIDs.some((id) => failingRemoveIds.has(id))) {
      throw new Error('Simulated remove failure (EXPO_PUBLIC_MOCK_FAIL_REMOVES)');
    }
    trackIDs.forEach((id) => landedRemoveIds.add(id));
  }

  async removalLanded(_source: SiftSource, trackID: string): Promise<boolean> {
    await delay(100);
    // Like Apple Music: a removed song from any sift is in "Sift — Removed".
    return landedRemoveIds.has(trackID);
  }

  async removeFromPlaylist(_playlistID: string, trackIDs: string[]): Promise<number> {
    await delay(200);
    return trackIDs.length;
  }

  async restoreRemoved(trackIDs: string[]): Promise<number> {
    await delay(200);
    const out = trackIDs.filter((id) => landedRemoveIds.has(id));
    out.forEach((id) => landedRemoveIds.delete(id));
    return out.length;
  }

  async addToLibrary(_trackIDs: string[]): Promise<void> {
    await delay(200);
  }

  async addToPlaylist(playlistID: string, _trackIDs: string[]): Promise<void> {
    await delay(200);
    if (!createdPlaylists.has(playlistID)
      && injectedAddFailures < requestedFailures(process.env.EXPO_PUBLIC_MOCK_FAIL_ADDS)) {
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
