import { siftReducer, SiftState } from '../../src/context/SiftContext';
import { Track, SiftSource } from '../../src/types';

function makeState(overrides: Partial<SiftState> = {}): SiftState {
  return {
    phase: 'sifting',
    provider: 'apple-music',
    source: { type: 'library' },
    activeSource: null,
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
    removalPlaylistCreated: false,
    removalPlaylistError: null,
    isCreatingPlaylist: false,
    removalErrors: [],
    connectionStatus: 'unknown',
    pendingKeeps: [],
    skipFiltering: false,
    siftedPlaylistId: null,
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
      pendingKeeps: [trackC],
    });
    const next = siftReducer(state, { type: 'LOAD_TRACKS', tracks: [trackA, trackB] });
    expect(next.tracks).toEqual([trackA, trackB]);
    expect(next.cursor).toBe(0);
    expect(next.kept).toEqual([]);
    expect(next.removed).toEqual([]);
    expect(next.skipped).toEqual([]);
    expect(next.pendingKeeps).toEqual([]);
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

  test('SET_SORT_ORDER mid-sift re-sorts only remaining tracks', () => {
    // trackA=10 plays, trackB=20 plays, trackC=5 plays
    // Current order: least-played → [C(5), A(10), B(20)]
    // Cursor at 1 means C is already decided, A and B remain
    const state = makeState({
      tracks: [trackC, trackA, trackB],
      cursor: 1,
      sortOrder: 'least-played',
    });
    const next = siftReducer(state, { type: 'SET_SORT_ORDER', sortOrder: 'most-played' });
    expect(next.sortOrder).toBe('most-played');
    // Decided track (before cursor) is unchanged
    expect(next.tracks[0]).toBe(trackC);
    // Remaining tracks re-sorted by most-played: B(20) then A(10)
    expect(next.tracks[1]).toBe(trackB);
    expect(next.tracks[2]).toBe(trackA);
    // Cursor unchanged
    expect(next.cursor).toBe(1);
  });

  test('SET_SORT_ORDER with no active tracks does not re-sort', () => {
    const state = makeState({ tracks: [], sortOrder: 'least-played' });
    const next = siftReducer(state, { type: 'SET_SORT_ORDER', sortOrder: 'newest' });
    expect(next.sortOrder).toBe('newest');
    expect(next.tracks).toEqual([]);
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

  test('START_FRESH preserves selected source', () => {
    const playlistSource = { type: 'playlist' as const, playlist: { id: 'p1', name: 'My Playlist', trackCount: 10 } };
    const state = makeState({ source: playlistSource });
    const next = siftReducer(state, { type: 'START_FRESH' });
    expect(next.source).toEqual(playlistSource);
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
    expect(next.removalErrors).toEqual([]);
  });

  test('ADD_REMOVAL_ERROR appends to removalErrors', () => {
    const state = makeState({ removalErrors: ['first error'] });
    const next = siftReducer(state, { type: 'ADD_REMOVAL_ERROR', error: 'second error' });
    expect(next.removalErrors).toEqual(['first error', 'second error']);
  });

  test('ADD_REMOVAL_ERROR on empty array', () => {
    const state = makeState();
    const next = siftReducer(state, { type: 'ADD_REMOVAL_ERROR', error: 'some error' });
    expect(next.removalErrors).toEqual(['some error']);
  });

  test('LOAD_TRACKS resets removalErrors', () => {
    const state = makeState({ removalErrors: ['old error'] });
    const next = siftReducer(state, { type: 'LOAD_TRACKS', tracks: [trackA] });
    expect(next.removalErrors).toEqual([]);
  });

  test('START_FRESH resets removalErrors', () => {
    const state = makeState({ removalErrors: ['old error'] });
    const next = siftReducer(state, { type: 'START_FRESH' });
    expect(next.removalErrors).toEqual([]);
  });

  test('START_FRESH passes skipFiltering into state', () => {
    const state = makeState();
    const next = siftReducer(state, { type: 'START_FRESH', skipFiltering: true });
    expect(next.skipFiltering).toBe(true);
  });

  test('START_FRESH defaults skipFiltering to false', () => {
    const state = makeState({ skipFiltering: true });
    const next = siftReducer(state, { type: 'START_FRESH' });
    expect(next.skipFiltering).toBe(false);
  });

  test('LOAD_TRACKS resets skipFiltering', () => {
    const state = makeState({ skipFiltering: true });
    const next = siftReducer(state, { type: 'LOAD_TRACKS', tracks: [trackA] });
    expect(next.skipFiltering).toBe(false);
  });

  test('RESTORE_TRACK moves track from removed to kept', () => {
    const state = makeState({ removed: [trackA, trackB], kept: [] });
    const next = siftReducer(state, { type: 'RESTORE_TRACK', trackId: trackA.id });
    expect(next.removed).toEqual([trackB]);
    expect(next.kept).toEqual([trackA]);
  });

  test('RESTORE_TRACK is a no-op if track not in removed', () => {
    const state = makeState({ removed: [trackA], kept: [] });
    const next = siftReducer(state, { type: 'RESTORE_TRACK', trackId: 'nonexistent' });
    expect(next).toBe(state);
  });

  test('ADD_PENDING_KEEP appends the track to pendingKeeps', () => {
    const state = makeState({ pendingKeeps: [trackA] });
    const next = siftReducer(state, { type: 'ADD_PENDING_KEEP', track: trackB });
    expect(next.pendingKeeps).toEqual([trackA, trackB]);
  });

  test('ADD_PENDING_KEEP dedupes by track id and returns the same state', () => {
    const state = makeState({ pendingKeeps: [trackA] });
    const next = siftReducer(state, { type: 'ADD_PENDING_KEEP', track: { ...trackA } });
    expect(next).toBe(state);
    expect(next.pendingKeeps).toEqual([trackA]);
  });

  test('REMOVE_PENDING_KEEPS removes only the listed tracks', () => {
    // The save's cleanup names exactly the snapshot it persisted; a keep
    // that was buffered while the save was in flight must survive it.
    const state = makeState({ pendingKeeps: [trackA, trackB, trackC] });
    const next = siftReducer(state, {
      type: 'REMOVE_PENDING_KEEPS',
      trackIds: [trackA.id, trackC.id],
    });
    expect(next.pendingKeeps).toEqual([trackB]);
  });

  test('REMOVE_PENDING_KEEPS empties pendingKeeps when all ids are listed', () => {
    const state = makeState({ pendingKeeps: [trackA, trackB] });
    const next = siftReducer(state, {
      type: 'REMOVE_PENDING_KEEPS',
      trackIds: [trackA.id, trackB.id],
    });
    expect(next.pendingKeeps).toEqual([]);
  });

  test('REMOVE_PENDING_KEEPS is a no-op when nothing matches', () => {
    const state = makeState({ pendingKeeps: [trackA] });
    const next = siftReducer(state, { type: 'REMOVE_PENDING_KEEPS', trackIds: [trackB.id] });
    expect(next).toBe(state);
  });

  test('REMOVE_PENDING_KEEPS is a no-op when pendingKeeps is already empty', () => {
    const state = makeState({ pendingKeeps: [] });
    const next = siftReducer(state, { type: 'REMOVE_PENDING_KEEPS', trackIds: [trackA.id] });
    expect(next).toBe(state);
  });

  test('SET_SIFTED_PLAYLIST_ID stores the id', () => {
    const state = makeState();
    const next = siftReducer(state, { type: 'SET_SIFTED_PLAYLIST_ID', id: 'sifted-1' });
    expect(next.siftedPlaylistId).toBe('sifted-1');
  });

  test('SET_SIFTED_PLAYLIST_ID is a no-op when the id is unchanged', () => {
    const state = makeState({ siftedPlaylistId: 'sifted-1' });
    const next = siftReducer(state, { type: 'SET_SIFTED_PLAYLIST_ID', id: 'sifted-1' });
    expect(next).toBe(state);
  });

  test('SET_SOURCE to a different playlist clears siftedPlaylistId', () => {
    const state = makeState({
      source: { type: 'playlist', playlist: { id: 'p1', name: 'One', trackCount: 3 } },
      siftedPlaylistId: 'sifted-1',
    });
    const next = siftReducer(state, {
      type: 'SET_SOURCE',
      source: { type: 'playlist', playlist: { id: 'p2', name: 'Two', trackCount: 4 } },
    });
    expect(next.siftedPlaylistId).toBeNull();
  });

  test('SET_SOURCE to the library clears siftedPlaylistId', () => {
    const state = makeState({
      source: { type: 'playlist', playlist: { id: 'p1', name: 'One', trackCount: 3 } },
      siftedPlaylistId: 'sifted-1',
    });
    const next = siftReducer(state, { type: 'SET_SOURCE', source: { type: 'library' } });
    expect(next.siftedPlaylistId).toBeNull();
  });

  test('SET_SOURCE re-selecting the same playlist keeps siftedPlaylistId', () => {
    const playlist = { id: 'p1', name: 'One', trackCount: 3 };
    const state = makeState({
      source: { type: 'playlist', playlist },
      siftedPlaylistId: 'sifted-1',
    });
    const next = siftReducer(state, { type: 'SET_SOURCE', source: { type: 'playlist', playlist } });
    expect(next.siftedPlaylistId).toBe('sifted-1');
  });

  test('RESET_TO_SETUP resets the full session state back to setup', () => {
    const playlistSource: SiftSource = {
      type: 'playlist',
      playlist: { id: 'p1', name: 'My Playlist', trackCount: 10 },
    };
    const state = makeState({
      phase: 'done',
      source: playlistSource,
      activeSource: playlistSource,
      tracks: [trackA, trackB],
      cursor: 2,
      kept: [trackA],
      removed: [trackB],
      skipped: [trackC],
      loadProgress: 1,
      loadError: 'some error',
      loadMessage: 'Loading…',
      removalPlaylistCreated: true,
      removalPlaylistError: 'playlist error',
      removalErrors: ['track failed'],
      pendingKeeps: [trackC],
      skipFiltering: true,
      isPlaying: true,
      playbackPosition: 42,
      isCreatingPlaylist: true,
    });
    const next = siftReducer(state, { type: 'RESET_TO_SETUP' });
    expect(next.phase).toBe('setup');
    expect(next.activeSource).toBeNull();
    expect(next.tracks).toEqual([]);
    expect(next.cursor).toBe(0);
    expect(next.kept).toEqual([]);
    expect(next.removed).toEqual([]);
    expect(next.skipped).toEqual([]);
    expect(next.loadProgress).toBe(0);
    expect(next.loadError).toBeNull();
    expect(next.loadMessage).toBe('');
    expect(next.removalPlaylistCreated).toBe(false);
    expect(next.removalPlaylistError).toBeNull();
    expect(next.removalErrors).toEqual([]);
    expect(next.pendingKeeps).toEqual([]);
    expect(next.skipFiltering).toBe(false);
    // Playback/creation flags must not leak into the next session
    expect(next.isPlaying).toBe(false);
    expect(next.playbackPosition).toBe(0);
    expect(next.isCreatingPlaylist).toBe(false);
    // The selected source and provider survive the reset
    expect(next.source).toEqual(playlistSource);
    expect(next.provider).toBe('apple-music');
  });

  test('START_FRESH resets playback and playlist-creation flags', () => {
    const state = makeState({
      isPlaying: true,
      playbackPosition: 42,
      isCreatingPlaylist: true,
      pendingKeeps: [trackA],
    });
    const next = siftReducer(state, { type: 'START_FRESH' });
    expect(next.isPlaying).toBe(false);
    expect(next.playbackPosition).toBe(0);
    expect(next.isCreatingPlaylist).toBe(false);
    expect(next.pendingKeeps).toEqual([]);
  });

  test('RESET_TO_SETUP retains siftedPlaylistId', () => {
    // The source survives the reset, so the companion id resolved for it
    // stays valid — keeping it means the next sift of the same playlist
    // still resolves by id (rename-proof) instead of by name.
    const state = makeState({
      phase: 'done',
      source: { type: 'playlist', playlist: { id: 'p1', name: 'One', trackCount: 3 } },
      siftedPlaylistId: 'sifted-1',
    });
    const next = siftReducer(state, { type: 'RESET_TO_SETUP' });
    expect(next.siftedPlaylistId).toBe('sifted-1');
  });

  test('START_FRESH retains siftedPlaylistId', () => {
    const state = makeState({
      source: { type: 'playlist', playlist: { id: 'p1', name: 'One', trackCount: 3 } },
      siftedPlaylistId: 'sifted-1',
    });
    const next = siftReducer(state, { type: 'START_FRESH' });
    expect(next.siftedPlaylistId).toBe('sifted-1');
  });

  test('LOAD_TRACKS records the loaded source as activeSource', () => {
    // activeSource drives the inline "Resume Sifting" affordance — a load
    // that forgets to stamp it would silently kill in-memory resume.
    const playlistSource: SiftSource = {
      type: 'playlist',
      playlist: { id: 'p1', name: 'One', trackCount: 2 },
    };
    const state = makeState({ source: playlistSource, activeSource: null });
    const next = siftReducer(state, { type: 'LOAD_TRACKS', tracks: [trackA, trackB] });
    expect(next.activeSource).toEqual(playlistSource);
  });

  test('RESUME_SESSION records the session source as activeSource', () => {
    const playlistSource: SiftSource = {
      type: 'playlist',
      playlist: { id: 'p1', name: 'One', trackCount: 2 },
    };
    const base = makeState({
      source: playlistSource,
      activeSource: null,
      tracks: [trackA, trackB],
      cursor: 1,
      kept: [trackA],
    });
    const { phase: _phase, ...session } = base;
    const next = siftReducer(makeState({ activeSource: null }), {
      type: 'RESUME_SESSION',
      session,
    });
    expect(next.activeSource).toEqual(playlistSource);
    expect(next.phase).toBe('sifting');
  });

  test('START_FRESH clears activeSource', () => {
    const playlistSource: SiftSource = {
      type: 'playlist',
      playlist: { id: 'p1', name: 'One', trackCount: 2 },
    };
    const state = makeState({ source: playlistSource, activeSource: playlistSource });
    const next = siftReducer(state, { type: 'START_FRESH' });
    expect(next.activeSource).toBeNull();
  });

  test('SET_SOURCE A→B→A yields a null siftedPlaylistId (accepted degradation)', () => {
    // Switching away wipes the id (a stale id must never point id-first
    // lookups at another playlist's companion); switching back does NOT
    // restore it. Accepted degradation: the id is re-derived on the next
    // keep/save via the name lookup, at worst falling back to name-based
    // resolution for one session.
    const playlistA = { id: 'pA', name: 'A', trackCount: 1 };
    const playlistB = { id: 'pB', name: 'B', trackCount: 1 };
    let state = makeState({
      source: { type: 'playlist', playlist: playlistA },
      siftedPlaylistId: 'sifted-A',
    });
    state = siftReducer(state, {
      type: 'SET_SOURCE',
      source: { type: 'playlist', playlist: playlistB },
    });
    expect(state.siftedPlaylistId).toBeNull();
    state = siftReducer(state, {
      type: 'SET_SOURCE',
      source: { type: 'playlist', playlist: playlistA },
    });
    expect(state.siftedPlaylistId).toBeNull();
  });
});
