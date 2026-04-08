import { siftReducer, SiftState } from '../../src/context/SiftContext';
import { Track, SiftSource } from '../../src/types';

function makeState(overrides: Partial<SiftState> = {}): SiftState {
  return {
    phase: 'sifting',
    provider: 'apple-music',
    source: { type: 'library' },
    tracks: [],
    cursor: 0,
    kept: [],
    removed: [],
    skipped: [],
    sortOrder: 'least-played',
    loadProgress: 0,
    loadMessage: 'Connecting to Music…',
    loadError: null,
    playbackPosition: 0,
    isPlaying: false,
    hasSavedSession: false,
    removalPlaylistCreated: false,
    removalPlaylistError: null,
    isCreatingPlaylist: false,
    connectionStatus: 'unknown',
    ...overrides,
  };
}

const trackA: Track = {
  id: '1',
  name: 'Track A',
  artist: 'Artist A',
  album: 'Album A',
  duration: 200,
  playCount: 10,
  dateAdded: '2020-01-01T00:00:00.000Z',
};

const trackB: Track = {
  id: '2',
  name: 'Track B',
  artist: 'Artist B',
  album: 'Album B',
  duration: 180,
  playCount: 20,
  dateAdded: '2021-06-15T00:00:00.000Z',
};

const trackC: Track = {
  id: '3',
  name: 'Track C',
  artist: 'Artist C',
  album: 'Album C',
  duration: 240,
  playCount: 5,
  dateAdded: '2019-03-10T00:00:00.000Z',
};

describe('siftReducer', () => {
  test('DECIDE keep moves track to kept[] and advances cursor', () => {
    const state = makeState({ tracks: [trackA, trackB, trackC], cursor: 0 });
    const next = siftReducer(state, { type: 'DECIDE', decision: 'keep' });
    expect(next.kept).toEqual([trackA]);
    expect(next.cursor).toBe(1);
    expect(next.removed).toEqual([]);
    expect(next.skipped).toEqual([]);
  });

  test('DECIDE remove moves track to removed[] and advances cursor', () => {
    const state = makeState({ tracks: [trackA, trackB, trackC], cursor: 0 });
    const next = siftReducer(state, { type: 'DECIDE', decision: 'remove' });
    expect(next.removed).toEqual([trackA]);
    expect(next.cursor).toBe(1);
    expect(next.kept).toEqual([]);
    expect(next.skipped).toEqual([]);
  });

  test('DECIDE skip moves track to skipped[] and advances cursor', () => {
    const state = makeState({ tracks: [trackA, trackB, trackC], cursor: 0 });
    const next = siftReducer(state, { type: 'DECIDE', decision: 'skip' });
    expect(next.skipped).toEqual([trackA]);
    expect(next.cursor).toBe(1);
    expect(next.kept).toEqual([]);
    expect(next.removed).toEqual([]);
  });

  test('when cursor reaches end of tracks, phase becomes done', () => {
    const state = makeState({ tracks: [trackA], cursor: 0 });
    const next = siftReducer(state, { type: 'DECIDE', decision: 'keep' });
    expect(next.cursor).toBe(1);
    expect(next.phase).toBe('done');
  });

  test('LOAD_TRACKS resets cursor, kept, removed, skipped and sets phase to sifting', () => {
    const state = makeState({
      phase: 'loading',
      cursor: 5,
      kept: [trackA],
      removed: [trackB],
      skipped: [trackC],
    });
    const next = siftReducer(state, { type: 'LOAD_TRACKS', tracks: [trackA, trackB] });
    expect(next.tracks).toEqual([trackA, trackB]);
    expect(next.cursor).toBe(0);
    expect(next.kept).toEqual([]);
    expect(next.removed).toEqual([]);
    expect(next.skipped).toEqual([]);
    expect(next.phase).toBe('sifting');
  });

  test('SET_PHASE changes phase', () => {
    const state = makeState({ phase: 'setup' });
    const next = siftReducer(state, { type: 'SET_PHASE', phase: 'loading' });
    expect(next.phase).toBe('loading');
  });

  test('SET_PROVIDER changes provider', () => {
    const state = makeState({ provider: 'apple-music' });
    const next = siftReducer(state, { type: 'SET_PROVIDER', provider: 'spotify' });
    expect(next.provider).toBe('spotify');
  });

  test('SET_SORT_ORDER changes sortOrder', () => {
    const state = makeState({ sortOrder: 'least-played' });
    const next = siftReducer(state, { type: 'SET_SORT_ORDER', sortOrder: 'newest' });
    expect(next.sortOrder).toBe('newest');
  });

  test('TOGGLE_PLAY_PAUSE toggles isPlaying', () => {
    const state = makeState({ isPlaying: false });
    const next = siftReducer(state, { type: 'TOGGLE_PLAY_PAUSE' });
    expect(next.isPlaying).toBe(true);

    const next2 = siftReducer(next, { type: 'TOGGLE_PLAY_PAUSE' });
    expect(next2.isPlaying).toBe(false);
  });

  test('DECIDE does nothing when cursor is past tracks array', () => {
    const state = makeState({ tracks: [trackA], cursor: 5 });
    const next = siftReducer(state, { type: 'DECIDE', decision: 'keep' });
    expect(next).toBe(state);
  });

  test('SET_LOAD_PROGRESS only updates loadMessage if provided', () => {
    const state = makeState({ loadProgress: 0, loadMessage: 'Initial' });
    const next = siftReducer(state, { type: 'SET_LOAD_PROGRESS', progress: 0.5 });
    expect(next.loadProgress).toBe(0.5);
    expect(next.loadMessage).toBe('Initial');
  });

  test('SET_LOAD_PROGRESS updates loadMessage when provided', () => {
    const state = makeState({ loadProgress: 0, loadMessage: 'Initial' });
    const next = siftReducer(state, { type: 'SET_LOAD_PROGRESS', progress: 0.5, message: 'Updated' });
    expect(next.loadProgress).toBe(0.5);
    expect(next.loadMessage).toBe('Updated');
  });

  test('SET_LOAD_ERROR sets error and phase to setup', () => {
    const state = makeState({ phase: 'loading' });
    const next = siftReducer(state, { type: 'SET_LOAD_ERROR', error: 'Something failed' });
    expect(next.loadError).toBe('Something failed');
    expect(next.phase).toBe('setup');
  });

  test('SET_PLAYBACK_POSITION updates playbackPosition', () => {
    const state = makeState({ playbackPosition: 0 });
    const next = siftReducer(state, { type: 'SET_PLAYBACK_POSITION', position: 42 });
    expect(next.playbackPosition).toBe(42);
  });

  test('SET_IS_PLAYING updates isPlaying', () => {
    const state = makeState({ isPlaying: false });
    const next = siftReducer(state, { type: 'SET_IS_PLAYING', isPlaying: true });
    expect(next.isPlaying).toBe(true);
  });

  test('SET_CONNECTION_STATUS updates connectionStatus', () => {
    const state = makeState({ connectionStatus: 'unknown' });
    const next = siftReducer(state, { type: 'SET_CONNECTION_STATUS', status: 'connected' });
    expect(next.connectionStatus).toBe('connected');
  });

  test('SET_PLAYLIST_CREATED updates removalPlaylistCreated', () => {
    const state = makeState({ removalPlaylistCreated: false });
    const next = siftReducer(state, { type: 'SET_PLAYLIST_CREATED', created: true });
    expect(next.removalPlaylistCreated).toBe(true);
  });

  test('SET_PLAYLIST_ERROR updates removalPlaylistError', () => {
    const state = makeState({ removalPlaylistError: null });
    const next = siftReducer(state, { type: 'SET_PLAYLIST_ERROR', error: 'Error msg' });
    expect(next.removalPlaylistError).toBe('Error msg');
  });

  test('SET_CREATING_PLAYLIST updates isCreatingPlaylist', () => {
    const state = makeState({ isCreatingPlaylist: false });
    const next = siftReducer(state, { type: 'SET_CREATING_PLAYLIST', creating: true });
    expect(next.isCreatingPlaylist).toBe(true);
  });

  test('SET_HAS_SAVED_SESSION updates hasSavedSession', () => {
    const state = makeState({ hasSavedSession: false });
    const next = siftReducer(state, { type: 'SET_HAS_SAVED_SESSION', has: true });
    expect(next.hasSavedSession).toBe(true);
  });

  test('RESUME_SESSION merges session state', () => {
    const state = makeState();
    const session = {
      ...state,
      tracks: [trackA, trackB],
      cursor: 1,
      kept: [trackA],
      provider: 'spotify' as const,
      phase: 'sifting' as const,
    };
    const next = siftReducer(state, { type: 'RESUME_SESSION', session });
    expect(next.tracks).toEqual([trackA, trackB]);
    expect(next.cursor).toBe(1);
    expect(next.phase).toBe('sifting');
  });

  test('RESUME_SESSION defaults to sifting when no phase', () => {
    const state = makeState();
    const session = { ...state, tracks: [trackA] };
    delete (session as Partial<typeof session>).phase;
    const next = siftReducer(state, { type: 'RESUME_SESSION', session: session as typeof session });
    expect(next.phase).toBe('sifting');
  });

  test('unknown action returns same state', () => {
    const state = makeState();
    const next = siftReducer(state, { type: 'UNKNOWN' } as never);
    expect(next).toBe(state);
  });

  test('SET_SOURCE sets source on state', () => {
    const state = makeState();
    const playlistSource: SiftSource = {
      type: 'playlist',
      playlist: { id: 'p1', name: 'My Playlist', trackCount: 10 },
    };
    const next = siftReducer(state, { type: 'SET_SOURCE', source: playlistSource });
    expect(next.source).toEqual(playlistSource);
  });

  test('START_FRESH resets source to library', () => {
    const state = makeState({
      source: { type: 'playlist', playlist: { id: 'p1', name: 'My Playlist', trackCount: 10 } },
    });
    const next = siftReducer(state, { type: 'START_FRESH' });
    expect(next.source).toEqual({ type: 'library' });
  });

  test('RESUME_SESSION with source preserves it', () => {
    const state = makeState();
    const playlistSource: SiftSource = {
      type: 'playlist',
      playlist: { id: 'p1', name: 'My Playlist', trackCount: 10 },
    };
    const session = {
      ...state,
      source: playlistSource,
      tracks: [trackA],
      phase: 'sifting' as const,
    };
    const next = siftReducer(state, { type: 'RESUME_SESSION', session });
    expect(next.source).toEqual(playlistSource);
  });

  test('RESUME_SESSION without source defaults to library', () => {
    const state = makeState();
    const session = {
      ...state,
      source: { type: 'library' as const },
      tracks: [trackA],
      phase: 'sifting' as const,
    };
    const next = siftReducer(state, { type: 'RESUME_SESSION', session });
    expect(next.source).toEqual({ type: 'library' });
  });

  test('START_FRESH resets state and sets phase to loading', () => {
    const state = makeState({
      phase: 'done',
      tracks: [trackA, trackB],
      cursor: 2,
      kept: [trackA],
      removed: [trackB],
      skipped: [],
      loadProgress: 1,
      loadError: 'some error',
      removalPlaylistCreated: true,
      removalPlaylistError: 'playlist error',
    });
    const next = siftReducer(state, { type: 'START_FRESH' });
    expect(next.phase).toBe('loading');
    expect(next.tracks).toEqual([]);
    expect(next.cursor).toBe(0);
    expect(next.kept).toEqual([]);
    expect(next.removed).toEqual([]);
    expect(next.skipped).toEqual([]);
    expect(next.loadProgress).toBe(0);
    expect(next.loadError).toBeNull();
    expect(next.removalPlaylistCreated).toBe(false);
    expect(next.removalPlaylistError).toBeNull();
  });
});
