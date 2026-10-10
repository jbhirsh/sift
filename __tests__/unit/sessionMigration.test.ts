import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadSession } from '../../src/services/SessionStore';
import { resumeState } from '../../src/context/resumeSession';

import v1 from '../fixtures/sessions/v1-original.json';
import v2 from '../fixtures/sessions/v2-provider-source.json';
import v3 from '../fixtures/sessions/v3-repair-names.json';
import v4 from '../fixtures/sessions/v4-current.json';
import spotify from '../fixtures/sessions/spotify-local-file.json';
import v5State from '../fixtures/sessions/v5-compact-state.json';
import v5Tracks from '../fixtures/sessions/v5-compact-tracks.json';

jest.mock('@sentry/react-native', () => ({
  captureException: jest.fn(),
  addBreadcrumb: jest.fn(),
}));

// Frozen copies of every session shape a build has saved (#61). They are
// never edited: a new field gets a new fixture, and each old one must keep
// loading with the right defaults.
const resumeFrom = async (fixture: unknown) => {
  await AsyncStorage.setItem('sift_session', JSON.stringify(fixture));
  const saved = await loadSession();
  if (!saved) throw new Error('fixture did not load');
  return resumeState(saved, { provider: 'apple-music', connectionStatus: 'connected' });
};

beforeEach(async () => {
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
      pendingKeeps: [],
      removalErrors: [],
      failedRemovalIds: [],
      siftedPlaylistId: null,
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
    expect(state.siftedPlaylistId).toBeNull();
  });

  test('failed removals saved by name get their ids back', async () => {
    const state = await resumeFrom(v3);
    expect(state.pendingKeeps.map((t) => t.id)).toEqual(['a']);
    expect(state.removalErrors).toEqual(['Stay']);
    expect(state.failedRemovalIds).toEqual(['b']);
  });

  test('the current shape loads as saved', async () => {
    const state = await resumeFrom(v4);
    expect(state.failedRemovalIds).toEqual(['b']);
    expect(state.siftedPlaylistId).toBeNull();
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
