import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadSession, saveSession } from '../../src/services/SessionStore';
import { loadReviewedIds, unmarkReviewed } from '../../src/services/ReviewedLedgerStore';
import { resumeState } from '../../src/context/resumeSession';

import v1 from '../fixtures/sessions/v1-original.json';
import v2 from '../fixtures/sessions/v2-provider-source.json';
import v3 from '../fixtures/sessions/v3-repair-names.json';
import v4 from '../fixtures/sessions/v4-current.json';
import spotify from '../fixtures/sessions/spotify-local-file.json';
import v5State from '../fixtures/sessions/v5-compact-state.json';
import v5Tracks from '../fixtures/sessions/v5-compact-tracks.json';
import v6State from '../fixtures/sessions/v6-compact-pending-state.json';
import v7State from '../fixtures/sessions/v7-compact-keeps-remembered-state.json';
import v8State from '../fixtures/sessions/v8-compact-album-sort-state.json';
import v8Tracks from '../fixtures/sessions/v8-compact-tracks-numbers.json';

jest.mock('@sentry/react-native', () => ({
  captureException: jest.fn(),
  addBreadcrumb: jest.fn(),
}));

// Frozen copies of every session shape a build has saved (#61). They are
// never edited: a new field gets a new fixture, and each old one must keep
// loading with the right defaults.
// The ledger key of the playlist the playlist fixtures sift ("Road Trip", p1).
const ROAD_TRIP = 'apple-music:playlist:p1';
// Fields the automatic "- Sifted" playlist used, gone once keeps were
// remembered for playlists too.
const GONE = ['pendingKeeps', 'siftedPlaylistId', 'removalPlaylistCreated', 'removalPlaylistError', 'isCreatingPlaylist'];
const expectNoGoneFields = (value: object) => {
  for (const key of GONE) expect(value).not.toHaveProperty(key);
};

const resumeFrom = async (fixture: unknown) => {
  await AsyncStorage.setItem('sift_session', JSON.stringify(fixture));
  const saved = await loadSession();
  if (!saved) throw new Error('fixture did not load');
  return resumeState(saved, { provider: 'apple-music', connectionStatus: 'connected' });
};

beforeEach(async () => {
  // Let a ledger write an earlier test started land before clearing.
  await unmarkReviewed('settle', 'nothing');
  await AsyncStorage.clear();
});

describe('saved sessions from every build (#61)', () => {
  test('the original shape: a library sift, no repair signal', async () => {
    const state = await resumeFrom(v1);
    expect(state).toMatchObject({
      cursor: 3,
      provider: 'apple-music',
      source: { type: 'library' },
      activeSource: { type: 'library' },
      phase: 'sifting',
      removalErrors: [],
      failedRemovalIds: [],
      connectionStatus: 'connected',
      skipFiltering: false,
    });
    expect(state.kept.map((t) => t.id)).toEqual(['a']);
    expect(state.removed.map((t) => t.id)).toEqual(['b']);
    expect(state.skipped.map((t) => t.id)).toEqual(['c']);
  });

  test('with provider and source: the playlist comes back', async () => {
    const state = await resumeFrom(v2);
    expect(state.source).toEqual({ type: 'playlist', playlist: { id: 'p1', name: 'Road Trip', trackCount: 4 } });
    expect(state.activeSource).toEqual(state.source);
    expectNoGoneFields(state);
  });

  test('a playlist session from before the "- Sifted" fields: its keeps are remembered too', async () => {
    // Every session stored in the pre-compact shape predates remembered keeps.
    await resumeFrom(v2);
    await expect(loadReviewedIds(ROAD_TRIP)).resolves.toEqual(new Set(['a']));
  });

  test('failed removals saved by name get their ids back', async () => {
    const state = await resumeFrom(v3);
    expect(state.removalErrors).toEqual(['Stay']);
    expect(state.failedRemovalIds).toEqual(['b']);
  });

  test('a keep that never reached "Road Trip - Sifted" (pendingKeeps) is remembered in the ledger', async () => {
    // Nothing fills "- Sifted" on a Keep any more: the parked keep goes
    // where a keep goes now, so Done's Save includes it and later sifts of
    // the playlist leave it out, whether the session is resumed or not.
    const state = await resumeFrom(v3);
    expectNoGoneFields(state);
    await expect(loadReviewedIds(ROAD_TRIP)).resolves.toEqual(new Set(['a']));
  });

  test('the pre-compact shape with every field loads, without the "- Sifted" fields', async () => {
    const state = await resumeFrom(v4);
    expect(state.failedRemovalIds).toEqual(['b']);
    expectNoGoneFields(state);
    // A library session's (empty) pendingKeeps leaves the ledger alone.
    await expect(loadReviewedIds('apple-music:library')).resolves.toEqual(new Set());
  });

  test('the compact shape (#150): the record joins its track list', async () => {
    await AsyncStorage.setItem('sift_session_v2', JSON.stringify(v5State));
    await AsyncStorage.setItem('sift_session_v2_tracks_b', JSON.stringify(v5Tracks));
    const saved = await loadSession();
    if (!saved) throw new Error('fixture did not load');
    const state = resumeState(saved, { provider: 'apple-music', connectionStatus: 'connected' });
    expect(state.cursor).toBe(3);
    expect(state.kept.map((t) => t.name)).toEqual(['Peaches']);
    expect(state.removed.map((t) => t.name)).toEqual(['Stay']);
    expect(state.failedRemovalIds).toEqual(['b']);
  });

  test('an old compact playlist record with pendingKeeps and siftedPlaylistId: both dropped, the keep remembered', async () => {
    const legacy = {
      ...v5State,
      source: { type: 'playlist', playlist: { id: 'p1', name: 'Road Trip', trackCount: 4 } },
      pendingKeeps: [v5Tracks.tracks[0]],
      siftedPlaylistId: 'sifted-1',
    };
    await AsyncStorage.setItem('sift_session_v2', JSON.stringify(legacy));
    await AsyncStorage.setItem('sift_session_v2_tracks_b', JSON.stringify(v5Tracks));
    const saved = await loadSession();
    if (!saved) throw new Error('fixture did not load');
    expectNoGoneFields(saved);
    expectNoGoneFields(resumeState(saved, { provider: 'apple-music', connectionStatus: 'connected' }));
    await expect(loadReviewedIds(ROAD_TRIP)).resolves.toEqual(new Set(['a']));
  });

  test('an old playlist session: the keeps it sent to "- Sifted" are remembered, not the one held for Undo', async () => {
    // Its build copied each sent keep into "Road Trip - Sifted" and recorded
    // none: they go to the ledger, where a keep goes now. The held keep (c)
    // isn't sent yet: Resume sends it, or Undo takes it back.
    const legacy = {
      ...v6State,
      source: { type: 'playlist', playlist: { id: 'p1', name: 'Road Trip', trackCount: 4 } },
      keptIds: ['a', 'c'],
      skippedIds: [],
      pending: { trackId: 'c', decision: 'keep', at: 1760097600000 },
      pendingKeeps: [],
      siftedPlaylistId: 'sifted-1',
    };
    await AsyncStorage.setItem('sift_session_v2', JSON.stringify(legacy));
    await AsyncStorage.setItem('sift_session_v2_tracks_b', JSON.stringify(v5Tracks));
    const saved = await loadSession();
    if (!saved) throw new Error('fixture did not load');
    expect(saved.kept.map((t) => t.id)).toEqual(['a', 'c']);
    await expect(loadReviewedIds(ROAD_TRIP)).resolves.toEqual(new Set(['a']));
  });

  test('keeps remembered for playlists: a playlist sift with a held keep resumes to send it', async () => {
    await AsyncStorage.setItem('sift_session_v2', JSON.stringify(v7State));
    await AsyncStorage.setItem('sift_session_v2_tracks_b', JSON.stringify(v5Tracks));
    const saved = await loadSession();
    if (!saved) throw new Error('fixture did not load');
    const state = resumeState(saved, { provider: 'apple-music', connectionStatus: 'connected' });
    expect(state.source).toEqual({ type: 'playlist', playlist: { id: 'p1', name: 'Road Trip', trackCount: 4 } });
    expect(state.kept.map((t) => t.name)).toEqual(['Peaches', 'Intro']);
    expect(state.pending).toEqual({ trackId: 'c', decision: 'keep', at: 1760529600000 });
    expect(state.phase).toBe('sifting');
    expectNoGoneFields(state);
    // Loading it records nothing: the held keep is sent by the screen it resumes to.
    await expect(loadReviewedIds(ROAD_TRIP)).resolves.toEqual(new Set());
  });

  test('Artist and Album sorts (#176): track numbers and the Album sort come back', async () => {
    await AsyncStorage.setItem('sift_session_v2', JSON.stringify(v8State));
    await AsyncStorage.setItem('sift_session_v2_tracks_b', JSON.stringify(v8Tracks));
    const saved = await loadSession();
    if (!saved) throw new Error('fixture did not load');
    const state = resumeState(saved, { provider: 'apple-music', connectionStatus: 'connected' });
    expect(state.sortOrder).toBe('album');
    expect(state.tracks.map((t) => [t.trackNumber, t.discNumber])).toEqual([[6, 1], [3, 1], [1, 1], [10, 1]]);
  });

  test('older track lists, with no track numbers, still load', async () => {
    await AsyncStorage.setItem('sift_session_v2', JSON.stringify(v7State));
    await AsyncStorage.setItem('sift_session_v2_tracks_b', JSON.stringify(v5Tracks));
    const saved = await loadSession();
    expect(saved?.tracks.every((t) => t.trackNumber === undefined && t.discNumber === undefined)).toBe(true);
  });

  test('this build saves the current shape: the "- Sifted" fields are never written', async () => {
    await AsyncStorage.setItem('sift_session_v2', JSON.stringify({ ...v5State, pendingKeeps: [], siftedPlaylistId: null }));
    await AsyncStorage.setItem('sift_session_v2_tracks_b', JSON.stringify(v5Tracks));
    const saved = await loadSession();
    if (!saved) throw new Error('fixture did not load');
    await saveSession({ ...saved, savedAt: '2026-10-15T12:00:00.000Z' });
    const written = JSON.parse((await AsyncStorage.getItem('sift_session_v2')) ?? 'null') as object;
    expect(written).toMatchObject({ v: 2, keptIds: ['a'], removedIds: ['b'], skippedIds: ['c'] });
    expectNoGoneFields(written);
  });

  test('with a held decision (#152): it comes back to be sent', async () => {
    await AsyncStorage.setItem('sift_session_v2', JSON.stringify(v6State));
    await AsyncStorage.setItem('sift_session_v2_tracks_b', JSON.stringify(v5Tracks));
    const saved = await loadSession();
    if (!saved) throw new Error('fixture did not load');
    expect(resumeState(saved, { provider: 'apple-music', connectionStatus: 'connected' }).pending)
      .toEqual({ trackId: 'c', decision: 'skip', at: 1760097600000 });
  });

  test('older shapes resume with nothing held', async () => {
    expect((await resumeFrom(v4)).pending).toBeNull();
  });

  test('a finished session resumes to Done', async () => {
    const state = await resumeFrom({ ...v4, cursor: 4, kept: [...v4.kept, v4.tracks[3]] });
    expect(state.phase).toBe('done');
  });

  test('a Spotify session (#140) is set aside, not resumed', async () => {
    await AsyncStorage.setItem('sift_session', JSON.stringify(spotify));
    await expect(loadSession()).resolves.toBeNull();
    await expect(AsyncStorage.getItem('sift_session.invalid')).resolves.toBe(JSON.stringify(spotify));
  });
});
