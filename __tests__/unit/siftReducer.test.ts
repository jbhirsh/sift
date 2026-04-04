import { siftReducer, SiftState } from '../../src/context/SiftContext';
import { Track } from '../../src/types';

function makeState(overrides: Partial<SiftState> = {}): SiftState {
  return {
    phase: 'sifting',
    provider: 'apple-music',
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
