import fc from 'fast-check';
import { siftReducer, SiftState } from '../../src/context/SiftContext';
import type { Track } from '../../src/types';

// Property-based tests (#61): random sequences of actions, checked against
// invariants that must hold after every step. Example tests catch the bugs
// we thought of; the bugs this reducer has had (double adds, a buffer wiped
// mid-save, exit-path races) were unanticipated sequences.

const track = (i: number): Track => ({
  id: `t${i}`, name: `Track ${i}`, artist: 'Artist', album: 'Album',
  duration: 200, playCount: (i * 7) % 13, dateAdded: `2020-01-${String((i % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
});

// Track lists with unique ids, as the providers return them.
const trackList = fc.uniqueArray(fc.integer({ min: 0, max: 40 }), { minLength: 1, maxLength: 12 }).map((ids) => ids.map(track));

const action = fc.oneof(
  fc.tuple(fc.constantFrom('keep', 'remove', 'skip'), fc.nat()).map(([decision, at]) => ({ type: 'DECIDE' as const, decision, at })),
  fc.constant({ type: 'FINISH' as const }),
  fc.constant({ type: 'CONTINUE_SIFTING' as const }),
  fc.constantFrom('least-played', 'most-played', 'oldest', 'newest').map((sortOrder) => ({ type: 'SET_SORT_ORDER' as const, sortOrder })),
  trackList.map((tracks) => ({ type: 'LOAD_TRACKS' as const, tracks })),
  fc.integer({ min: 0, max: 40 }).map((i) => ({ type: 'RESTORE_TRACK' as const, trackId: `t${i}` })),
  fc.integer({ min: 0, max: 40 }).map((i) => ({ type: 'ADD_PENDING_KEEP' as const, track: track(i) })),
  fc.array(fc.integer({ min: 0, max: 40 })).map((ids) => ({ type: 'REMOVE_PENDING_KEEPS' as const, trackIds: ids.map((i) => `t${i}`) })),
  fc.integer({ min: 0, max: 40 }).map((i) => ({ type: 'ADD_REMOVAL_ERROR' as const, error: `Track ${i}`, failedRemovalId: `t${i}` })),
  fc.constant({ type: 'UNDO_LAST' as const }),
  fc.tuple(fc.integer({ min: 0, max: 40 }), fc.nat()).map(([i, at]) => ({ type: 'PENDING_SENT' as const, trackId: `t${i}`, at })),
  fc.constant({ type: 'START_FRESH' as const }),
  fc.constant({ type: 'RESET_TO_SETUP' as const }),
);

const start = (tracks: Track[]): SiftState => ({
  phase: 'sifting', provider: 'apple-music', source: { type: 'library' }, activeSource: { type: 'library' },
  tracks, cursor: 0, kept: [], removed: [], skipped: [], sortOrder: 'least-played',
  loadProgress: 1, loadMessage: '', loadError: null, playbackPosition: 0, isPlaying: false,
  removalPlaylistCreated: false, removalPlaylistError: null, isCreatingPlaylist: false,
  removalErrors: [], failedRemovalIds: [], connectionStatus: 'connected', pendingKeeps: [],
  skipFiltering: false, siftedPlaylistId: null, startAtChorus: false, pending: null,
});

const ids = (list: readonly Track[]) => list.map((t) => t.id);

function checkInvariants(state: SiftState) {
  // The cursor stays on the list.
  expect(state.cursor).toBeGreaterThanOrEqual(0);
  expect(state.cursor).toBeLessThanOrEqual(state.tracks.length);
  // Every decided card is in exactly one of kept, removed and skipped,
  // and only decided cards are.
  const decided = [...ids(state.kept), ...ids(state.removed), ...ids(state.skipped)];
  expect(new Set(decided).size).toBe(decided.length);
  expect(decided.length).toBe(state.cursor);
  expect(new Set(decided)).toEqual(new Set(ids(state.tracks.slice(0, state.cursor))));
  // A buffered keep is listed once.
  expect(new Set(ids(state.pendingKeeps)).size).toBe(state.pendingKeeps.length);
  // A held decision is the latest decided card's (#152).
  if (state.pending) {
    expect(state.cursor).toBeGreaterThan(0);
    expect(state.tracks[state.cursor - 1].id).toBe(state.pending.trackId);
  }
  // Sifting always has a card to show.
  if (state.phase === 'sifting' && state.tracks.length > 0) {
    expect(state.cursor).toBeLessThan(state.tracks.length);
  }
}

describe('siftReducer properties (#61)', () => {
  test('invariants hold after every step of any action sequence', () => {
    fc.assert(
      fc.property(trackList, fc.array(action, { maxLength: 40 }), (tracks, actions) => {
        let state = start(tracks);
        checkInvariants(state);
        for (const a of actions) {
          state = siftReducer(state, a);
          checkInvariants(state);
        }
      }),
      { numRuns: 300 },
    );
  });

  test('re-sorting never moves a decided card', () => {
    fc.assert(
      fc.property(trackList, fc.nat(), fc.constantFrom('most-played', 'oldest', 'newest'), (tracks, n, sortOrder) => {
        let state = start(tracks);
        const decisions = n % (tracks.length + 1);
        for (let i = 0; i < decisions; i++) state = siftReducer(state, { type: 'DECIDE', decision: 'skip' });
        const before = ids(state.tracks.slice(0, state.cursor));
        state = siftReducer(state, { type: 'SET_SORT_ORDER', sortOrder });
        expect(ids(state.tracks.slice(0, state.cursor))).toEqual(before);
        expect(new Set(ids(state.tracks))).toEqual(new Set(ids(tracks)));
      }),
    );
  });

  test('Finish then Continue sifting comes back to the same card', () => {
    fc.assert(
      fc.property(trackList, fc.nat(), (tracks, n) => {
        let state = start(tracks);
        const decisions = n % tracks.length;
        for (let i = 0; i < decisions; i++) state = siftReducer(state, { type: 'DECIDE', decision: 'keep' });
        const cursor = state.cursor;
        state = siftReducer(siftReducer(state, { type: 'FINISH' }), { type: 'CONTINUE_SIFTING' });
        expect(state.phase).toBe('sifting');
        expect(state.cursor).toBe(cursor);
      }),
    );
  });
});
