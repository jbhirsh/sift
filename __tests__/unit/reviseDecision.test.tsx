import React, { useEffect } from 'react';
import { render, act } from '@testing-library/react-native';
import * as Sentry from '@sentry/react-native';
import { SiftProvider, useSift } from '../../src/context/SiftContext';
import { resetRemovalRetries } from '../../src/hooks/useMusicProvider';
import { useSendPending } from '../../src/hooks/usePendingDecision';
import { useReviseDecision } from '../../src/hooks/useReviseDecision';
import { forgetRemovals, logRemoval } from '../../src/services/RemovalHistoryStore';
import { markReviewed, unmarkReviewed } from '../../src/services/ReviewedLedgerStore';
import type { Decision, PendingDecision, SiftSource, Track } from '../../src/types';

// Changing a decision beyond the last one: the reducer, the hook and the
// music service calls together.

jest.mock('@sentry/react-native', () => ({
  setTag: jest.fn(),
  setContext: jest.fn(),
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
}));

jest.mock('../../src/services/SessionStore', () => ({
  hasSession: jest.fn().mockResolvedValue(false),
  saveSession: jest.fn().mockResolvedValue(undefined),
  loadSession: jest.fn().mockResolvedValue(null),
  clearSession: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/services/RemovalHistoryStore', () => ({
  logRemoval: jest.fn(() => Promise.resolve()),
  loadHistory: jest.fn(() => Promise.resolve([])),
  removeFromHistory: jest.fn(() => Promise.resolve()),
  forgetRemovals: jest.fn(() => Promise.resolve()),
  clearHistoryForSource: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../src/services/ReviewedLedgerStore', () => ({
  loadReviewedIds: jest.fn(() => Promise.resolve(new Set())),
  markReviewed: jest.fn(() => Promise.resolve()),
  unmarkReviewed: jest.fn(() => Promise.resolve()),
}));

const mockProvider = {
  requestAuthorization: jest.fn().mockResolvedValue(true),
  isAuthorized: jest.fn().mockResolvedValue(true),
  loadLibrary: jest.fn().mockResolvedValue([]),
  play: jest.fn().mockResolvedValue(undefined),
  pause: jest.fn().mockResolvedValue(undefined),
  resume: jest.fn().mockResolvedValue(undefined),
  seek: jest.fn(),
  getPlaybackState: jest.fn().mockReturnValue({ position: 0, isPlaying: false }),
  createPlaylist: jest.fn().mockResolvedValue('new-playlist'),
  addToPlaylist: jest.fn().mockResolvedValue(undefined),
  removeFromLibrary: jest.fn().mockResolvedValue(undefined),
  removeFromPlaylist: jest.fn().mockResolvedValue(undefined),
  restoreRemoved: jest.fn().mockResolvedValue(1),
  removalLanded: jest.fn().mockResolvedValue(true),
  loadPlaylists: jest.fn().mockResolvedValue([]),
  loadPlaylistTracks: jest.fn().mockResolvedValue([]),
};

jest.mock('../../src/services', () => ({
  createMusicProvider: jest.fn(() => mockProvider),
  MusicProviderService: {},
}));

const track = (id: string): Track => ({
  id,
  name: `Track ${id}`,
  artist: 'Artist',
  album: 'Album',
  duration: 200,
  playCount: 1,
  dateAdded: '2020-01-01T00:00:00.000Z',
});
const [trackA, trackB, trackC] = [track('a'), track('b'), track('c')];
const mix: SiftSource = { type: 'playlist', playlist: { id: 'p1', name: 'Mix', trackCount: 3 } };

let sift!: ReturnType<typeof useSift>;
let send!: (pending: PendingDecision | null) => void;
let revise!: (track: Track, decision: Decision) => Promise<boolean>;

function Harness() {
  const currentSift = useSift();
  const currentSend = useSendPending();
  const currentRevise = useReviseDecision(currentSend);
  useEffect(() => {
    sift = currentSift;
    send = currentSend;
    revise = currentRevise;
  });
  return null;
}

async function renderSift(source: SiftSource = { type: 'library' }) {
  await render(
    <SiftProvider initialTracks={[trackA, trackB, trackC]}>
      <Harness />
    </SiftProvider>,
  );
  if (source.type === 'playlist') {
    await act(async () => {
      sift.dispatch({ type: 'SET_SOURCE', source });
    });
  }
}

/** Decide the next card and send it, as the undo window ending would. */
async function decideAndSend(decision: Decision) {
  let held: PendingDecision | null = null;
  await act(async () => {
    held = sift.decide(decision);
  });
  await act(async () => {
    send(held);
    await new Promise<void>((resolve) => setImmediate(() => resolve()));
  });
}

async function change(t: Track, decision: Decision): Promise<boolean> {
  let changed = false;
  await act(async () => {
    changed = await revise(t, decision);
    await new Promise<void>((resolve) => setImmediate(() => resolve()));
  });
  return changed;
}

beforeEach(() => {
  jest.clearAllMocks();
  resetRemovalRetries();
  mockProvider.loadPlaylists.mockResolvedValue([]);
  mockProvider.loadPlaylistTracks.mockResolvedValue([]);
  mockProvider.removalLanded.mockResolvedValue(true);
});

describe('changing a decision', () => {
  test('one still held for Undo just changes, and nothing is sent yet', async () => {
    await renderSift();
    await act(async () => {
      sift.decide('remove');
    });
    await expect(change(trackA, 'keep')).resolves.toBe(true);
    expect(sift.state.kept).toEqual([trackA]);
    expect(sift.state.removed).toEqual([]);
    expect(sift.state.pending).toEqual(expect.objectContaining({ trackId: 'a', decision: 'keep' }));
    expect(mockProvider.removeFromLibrary).not.toHaveBeenCalled();
    expect(markReviewed).not.toHaveBeenCalled();
  });

  test('a sent library Remove changed to Keep is restored, then kept', async () => {
    await renderSift();
    await decideAndSend('remove');
    expect(mockProvider.removeFromLibrary).toHaveBeenCalledWith(['a']);
    await expect(change(trackA, 'keep')).resolves.toBe(true);
    // Out of "Sift — Removed", out of the history, into the ledger.
    expect(mockProvider.restoreRemoved).toHaveBeenCalledWith(['a']);
    expect(forgetRemovals).toHaveBeenCalledWith('a', 'apple-music');
    expect(markReviewed).toHaveBeenCalledWith('apple-music:library', 'a');
    expect(sift.state.kept).toEqual([trackA]);
    expect(sift.state.removed).toEqual([]);
  });

  test("changing the latest decision after it was sent: it isn't sent again, nor offered for Undo", async () => {
    await renderSift();
    let held: PendingDecision | null = null;
    await act(async () => {
      held = sift.decide('remove');
    });
    await act(async () => {
      send(held);
    });
    // Sent, but held again, as a session saved before the send was
    // cleared comes back.
    await act(async () => {
      const {
        phase: _p,
        startAtChorus: _c,
        playbackFailedId: _f,
        songCacheWarming: _w,
        songCacheGeneration: _g,
        filter: _filter,
        ...session
      } = sift.state;
      sift.dispatch({ type: 'RESUME_SESSION', session: { ...session, pending: held } });
    });
    expect(sift.state.pending).toEqual(held);
    await expect(change(trackA, 'keep')).resolves.toBe(true);
    expect(markReviewed).toHaveBeenCalledTimes(1);
    expect(sift.state.pending).toBeNull();
    // Whatever re-sends what's held (Done mounting, the next decision,
    // the screen going away) sends nothing more.
    await act(async () => {
      send(sift.state.pending);
      send(held);
    });
    expect(markReviewed).toHaveBeenCalledTimes(1);
    expect(mockProvider.removeFromLibrary).toHaveBeenCalledTimes(1);
  });

  test('a sent library Keep changed to Remove comes out of the ledger, then is removed', async () => {
    await renderSift();
    await decideAndSend('keep');
    expect(markReviewed).toHaveBeenCalledWith('apple-music:library', 'a');
    await expect(change(trackA, 'remove')).resolves.toBe(true);
    expect(unmarkReviewed).toHaveBeenCalledWith('apple-music:library', 'a');
    expect(logRemoval).toHaveBeenCalledWith(expect.objectContaining({ track: trackA }));
    expect(mockProvider.removeFromLibrary).toHaveBeenCalledWith(['a']);
    expect(sift.state.removed).toEqual([trackA]);
  });

  test('a sent Skip changed to Keep just keeps', async () => {
    await renderSift();
    await decideAndSend('skip');
    await expect(change(trackA, 'keep')).resolves.toBe(true);
    expect(markReviewed).toHaveBeenCalledWith('apple-music:library', 'a');
    expect(unmarkReviewed).not.toHaveBeenCalled();
    expect(sift.state.skipped).toEqual([]);
    expect(sift.state.kept).toEqual([trackA]);
  });

  test("a sent playlist Keep changed to Skip comes out of that playlist's ledger; nothing is written", async () => {
    await renderSift(mix);
    await decideAndSend('keep');
    expect(markReviewed).toHaveBeenCalledWith('apple-music:playlist:p1', 'a');
    await expect(change(trackA, 'skip')).resolves.toBe(true);
    expect(unmarkReviewed).toHaveBeenCalledWith('apple-music:playlist:p1', 'a');
    expect(sift.state.skipped).toEqual([trackA]);
    expect(sift.state.kept).toEqual([]);
    expect(mockProvider.loadPlaylists).not.toHaveBeenCalled();
    expect(mockProvider.removeFromPlaylist).not.toHaveBeenCalled();
    expect(mockProvider.addToPlaylist).not.toHaveBeenCalled();
    expect(mockProvider.createPlaylist).not.toHaveBeenCalled();
  });

  test('kept again after that, it is remembered again', async () => {
    await renderSift(mix);
    await decideAndSend('keep');
    await change(trackA, 'skip');
    await change(trackA, 'keep');
    expect((markReviewed as jest.Mock).mock.calls).toEqual([
      ['apple-music:playlist:p1', 'a'],
      ['apple-music:playlist:p1', 'a'],
    ]);
    expect(sift.state.kept).toEqual([trackA]);
  });

  test('two changes of one song in the same millisecond both go out', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    try {
      await renderSift();
      await decideAndSend('skip');
      await change(trackA, 'keep');
      await change(trackA, 'skip');
      await change(trackA, 'keep');
      expect(markReviewed).toHaveBeenCalledTimes(2);
      expect(unmarkReviewed).toHaveBeenCalledTimes(1);
    } finally {
      now.mockRestore();
    }
  });

  test('a change made in the same millisecond as the decision it replaces still goes out', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000);
    try {
      await renderSift();
      await decideAndSend('skip');
      await change(trackA, 'keep');
      expect(markReviewed).toHaveBeenCalledWith('apple-music:library', 'a');
    } finally {
      now.mockRestore();
    }
  });

  test("if the Remove can't be undone, nothing changes", async () => {
    await renderSift(mix);
    await decideAndSend('remove');
    mockProvider.restoreRemoved.mockRejectedValueOnce(new Error('offline'));
    await expect(change(trackA, 'keep')).resolves.toBe(false);
    expect(sift.state.removed).toEqual([trackA]);
    expect(sift.state.kept).toEqual([]);
    expect(forgetRemovals).not.toHaveBeenCalled();
    expect(mockProvider.loadPlaylists).not.toHaveBeenCalledWith();
  });

  test('a Restore that took nothing out while the song is still in "Sift — Removed" failed, so nothing changes', async () => {
    await renderSift(mix);
    await decideAndSend('remove');
    // Filed there under an id the take-out didn't match.
    mockProvider.restoreRemoved.mockResolvedValueOnce(0);
    mockProvider.removalLanded.mockResolvedValueOnce(true);
    await expect(change(trackA, 'keep')).resolves.toBe(false);
    expect(sift.state.removed).toEqual([trackA]);
    expect(forgetRemovals).not.toHaveBeenCalled();
  });

  test('nothing to take out because the removal never landed is a Restore all the same', async () => {
    await renderSift(mix);
    await decideAndSend('remove');
    mockProvider.restoreRemoved.mockResolvedValueOnce(0);
    mockProvider.removalLanded.mockResolvedValueOnce(false);
    await expect(change(trackA, 'keep')).resolves.toBe(true);
    expect(forgetRemovals).toHaveBeenCalledWith('a', 'apple-music');
  });

  test('a sent playlist Keep changed to Remove is unremembered, then collected like any Remove', async () => {
    await renderSift(mix);
    await decideAndSend('keep');
    await expect(change(trackA, 'remove')).resolves.toBe(true);
    expect(unmarkReviewed).toHaveBeenCalledWith('apple-music:playlist:p1', 'a');
    expect(mockProvider.removeFromLibrary).toHaveBeenCalledWith(['a']);
    expect(mockProvider.removeFromPlaylist).not.toHaveBeenCalled();
    expect(sift.state.removed).toEqual([trackA]);
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  test("an undecided card can't be changed; the same decision is no change", async () => {
    await renderSift();
    await decideAndSend('keep');
    (markReviewed as jest.Mock).mockClear();
    await expect(change(trackB, 'remove')).resolves.toBe(false);
    await expect(change(trackA, 'keep')).resolves.toBe(true);
    expect(markReviewed).not.toHaveBeenCalled();
    expect(unmarkReviewed).not.toHaveBeenCalled();
    expect(sift.state.kept).toEqual([trackA]);
  });
});
