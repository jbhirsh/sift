import React, { useEffect } from 'react';
import { render, act } from '@testing-library/react-native';
import { AppState } from 'react-native';
import * as Sentry from '@sentry/react-native';
import { SiftProvider, useSift } from '../../src/context/SiftContext';
import {
  MAX_REMOVAL_RETRIES,
  resetRemovalRetries,
  useMusicProvider,
} from '../../src/hooks/useMusicProvider';
import { useRemovalRetry } from '../../src/hooks/useRemovalRetry';
import {
  forgetRemovals,
  logRemoval,
  removeFromHistory,
} from '../../src/services/RemovalHistoryStore';
import type { Track } from '../../src/types';

// Retrying failed removals (#151).

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

const mockProvider = {
  requestAuthorization: jest.fn().mockResolvedValue(true),
  isAuthorized: jest.fn().mockResolvedValue(true),
  loadLibrary: jest.fn().mockResolvedValue([]),
  play: jest.fn().mockResolvedValue(undefined),
  pause: jest.fn().mockResolvedValue(undefined),
  resume: jest.fn().mockResolvedValue(undefined),
  seek: jest.fn(),
  getPlaybackState: jest.fn().mockReturnValue({ position: 0, isPlaying: false }),
  createPlaylist: jest.fn().mockResolvedValue(undefined),
  removeFromLibrary: jest.fn().mockResolvedValue(undefined),
  removeFromPlaylist: jest.fn().mockResolvedValue(undefined),
  restoreRemoved: jest.fn().mockResolvedValue(1),
  removalLanded: jest.fn().mockResolvedValue(false) as jest.Mock | undefined,
  loadPlaylists: jest
    .fn()
    .mockResolvedValue([{ id: 'removed-pl', name: 'Sift — Removed', trackCount: 0 }]),
};

jest.mock('../../src/services', () => ({
  createMusicProvider: jest.fn(() => mockProvider),
  MusicProviderService: {},
}));

const trackA: Track = {
  id: 'a',
  name: 'Track A',
  artist: 'Artist',
  album: 'Album',
  duration: 200,
  playCount: 1,
  dateAdded: '2020-01-01T00:00:00.000Z',
};
const trackB: Track = { ...trackA, id: 'b', name: 'Track B' };
const trackC: Track = { ...trackA, id: 'c', name: 'Track C' };

let api!: ReturnType<typeof useMusicProvider>;
let sift!: ReturnType<typeof useSift>;

function Harness({ retryHook = false }: { retryHook?: boolean }) {
  const currentApi = useMusicProvider();
  const currentSift = useSift();
  useEffect(() => {
    api = currentApi;
    sift = currentSift;
  });
  return retryHook ? <RetryHook /> : null;
}

function RetryHook() {
  useRemovalRetry();
  return null;
}

/** Remove the first card and fail its removal, as a real sift would. */
async function failFirstRemoval() {
  await act(async () => {
    sift.decide('remove');
  });
  mockProvider.removeFromLibrary.mockRejectedValueOnce(new Error('offline'));
  await act(async () => {
    await api.removeTrack(trackA);
  });
  expect(sift.state.failedRemovalIds).toEqual(['a']);
}

beforeEach(() => {
  jest.clearAllMocks();
  resetRemovalRetries();
  mockProvider.removalLanded = jest.fn().mockResolvedValue(false);
});

describe('retryFailedRemovals', () => {
  test("retries a failed library removal; on success it's no longer a failure and is recorded again", async () => {
    await render(
      <SiftProvider initialTracks={[trackA, trackB]}>
        <Harness />
      </SiftProvider>,
    );
    await failFirstRemoval();
    (logRemoval as jest.Mock).mockClear();
    await act(async () => {
      await api.retryFailedRemovals();
    });
    expect(mockProvider.removalLanded).toHaveBeenCalledWith({ type: 'library' }, 'a');
    expect(mockProvider.removeFromLibrary).toHaveBeenLastCalledWith(['a']);
    expect(sift.state.failedRemovalIds).toEqual([]);
    expect(sift.state.removalErrors).toEqual([]);
    expect(logRemoval).toHaveBeenCalledWith(
      expect.objectContaining({ track: trackA, source: { type: 'library' } }),
    );
  });

  test('a removal that already landed is cleared without removing it again', async () => {
    await render(
      <SiftProvider initialTracks={[trackA, trackB]}>
        <Harness />
      </SiftProvider>,
    );
    await failFirstRemoval();
    mockProvider.removeFromLibrary.mockClear();
    mockProvider.removalLanded?.mockResolvedValueOnce(true);
    await act(async () => {
      await api.retryFailedRemovals();
    });
    expect(mockProvider.removeFromLibrary).not.toHaveBeenCalled();
    expect(sift.state.failedRemovalIds).toEqual([]);
  });

  test('without a landed check, the retry removes again', async () => {
    mockProvider.removalLanded = undefined;
    await render(
      <SiftProvider initialTracks={[trackA, trackB]}>
        <Harness />
      </SiftProvider>,
    );
    await failFirstRemoval();
    await act(async () => {
      await api.retryFailedRemovals();
    });
    expect(mockProvider.removeFromLibrary).toHaveBeenLastCalledWith(['a']);
    expect(sift.state.failedRemovalIds).toEqual([]);
  });

  test(`a removal that keeps failing stays failed, and stops after ${MAX_REMOVAL_RETRIES} retries`, async () => {
    await render(
      <SiftProvider initialTracks={[trackA, trackB]}>
        <Harness />
      </SiftProvider>,
    );
    await failFirstRemoval();
    mockProvider.removeFromLibrary.mockReset().mockRejectedValue(new Error('still offline'));
    for (let i = 0; i < MAX_REMOVAL_RETRIES + 1; i++) {
      await act(async () => {
        await api.retryFailedRemovals();
      });
    }
    expect(mockProvider.removeFromLibrary).toHaveBeenCalledTimes(MAX_REMOVAL_RETRIES);
    expect(sift.state.failedRemovalIds).toEqual(['a']);
    // A retry failing again isn't a second error for the same song.
    expect(sift.state.removalErrors).toEqual(['Track A']);
    expect(Sentry.addBreadcrumb).toHaveBeenLastCalledWith(
      expect.objectContaining({
        message: `retryFailedRemovals: a still failing (attempt ${MAX_REMOVAL_RETRIES} of ${MAX_REMOVAL_RETRIES}): still offline`,
      }),
    );
    mockProvider.removeFromLibrary.mockReset().mockResolvedValue(undefined);
  });

  test('a removal that succeeds retries the ones that failed', async () => {
    await render(
      <SiftProvider initialTracks={[trackA, trackB, trackC]}>
        <Harness />
      </SiftProvider>,
    );
    await failFirstRemoval();
    await act(async () => {
      sift.decide('remove');
    });
    await act(async () => {
      await api.removeTrack(trackB);
    });
    expect(mockProvider.removeFromLibrary.mock.calls).toEqual([[['a']], [['b']], [['a']]]);
    expect(sift.state.failedRemovalIds).toEqual([]);
  });

  test('overlapping retries run once', async () => {
    await render(
      <SiftProvider initialTracks={[trackA, trackB]}>
        <Harness />
      </SiftProvider>,
    );
    await failFirstRemoval();
    mockProvider.removeFromLibrary.mockClear();
    await act(async () => {
      await Promise.all([api.retryFailedRemovals(), api.retryFailedRemovals()]);
    });
    expect(mockProvider.removeFromLibrary).toHaveBeenCalledTimes(1);
  });

  test('a playlist removal retries into "Sift — Removed", never the playlist, and is recorded again', async () => {
    await render(
      <SiftProvider initialTracks={[trackA, trackB]}>
        <Harness />
      </SiftProvider>,
    );
    const source = {
      type: 'playlist' as const,
      playlist: { id: 'p1', name: 'Mix', trackCount: 2 },
    };
    await act(async () => {
      sift.dispatch({ type: 'SET_SOURCE', source });
    });
    await act(async () => {
      sift.decide('remove');
    });
    mockProvider.removeFromLibrary.mockRejectedValueOnce(new Error('offline'));
    await act(async () => {
      await api.removeTrack(trackA);
    });
    // The failed removal dropped its record, so the song isn't hidden.
    expect(removeFromHistory).toHaveBeenCalledWith('a', source);
    (logRemoval as jest.Mock).mockClear();
    await act(async () => {
      await api.retryFailedRemovals();
    });
    expect(mockProvider.removalLanded).toHaveBeenCalledWith(source, 'a');
    expect(mockProvider.removeFromLibrary).toHaveBeenLastCalledWith(['a']);
    expect(mockProvider.removeFromPlaylist).not.toHaveBeenCalled();
    expect(logRemoval).toHaveBeenCalledWith(
      expect.objectContaining({ track: trackA, source, collected: true }),
    );
    expect(sift.state.failedRemovalIds).toEqual([]);
  });

  test('a Restore during a retry waits for it, so the song ends up restored (#151)', async () => {
    await render(
      <SiftProvider initialTracks={[trackA, trackB]}>
        <Harness />
      </SiftProvider>,
    );
    await failFirstRemoval();
    let landedCheck!: (landed: boolean) => void;
    mockProvider.removalLanded?.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          landedCheck = resolve;
        }),
    );
    (logRemoval as jest.Mock).mockClear();
    let retry!: Promise<void>;
    let restore!: Promise<boolean>;
    await act(async () => {
      retry = api.retryFailedRemovals();
      restore = api.restoreTrack(trackA);
    });
    // The restore hasn't touched "Sift — Removed" while the retry is out.
    expect(mockProvider.restoreRemoved).not.toHaveBeenCalled();
    await act(async () => {
      landedCheck(false);
      await Promise.all([retry, restore]);
    });
    // Retry's remove and record first, then the restore undoes both.
    const removeOrder = mockProvider.removeFromLibrary.mock.invocationCallOrder.at(-1) ?? 0;
    expect(mockProvider.restoreRemoved).toHaveBeenCalledWith(['a']);
    expect(mockProvider.restoreRemoved.mock.invocationCallOrder[0]).toBeGreaterThan(removeOrder);
    expect((forgetRemovals as jest.Mock).mock.invocationCallOrder.at(-1)).toBeGreaterThan(
      (logRemoval as jest.Mock).mock.invocationCallOrder.at(-1) ?? Infinity,
    );
    expect(sift.state.removed).toEqual([]);
  });

  test('a retry that starts during a Restore leaves that song alone (#151)', async () => {
    await render(
      <SiftProvider initialTracks={[trackA, trackB]}>
        <Harness />
      </SiftProvider>,
    );
    await failFirstRemoval();
    let restored!: (count: number) => void;
    mockProvider.restoreRemoved.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          restored = resolve;
        }),
    );
    mockProvider.removeFromLibrary.mockClear();
    let restore!: Promise<boolean>;
    await act(async () => {
      restore = api.restoreTrack(trackA);
    });
    await act(async () => {
      await api.retryFailedRemovals();
    });
    expect(mockProvider.removalLanded).not.toHaveBeenCalled();
    expect(mockProvider.removeFromLibrary).not.toHaveBeenCalled();
    await act(async () => {
      restored(1);
      await restore;
    });
    expect(sift.state.removed).toEqual([]);
  });

  test('nothing failed, nothing retried', async () => {
    await render(
      <SiftProvider initialTracks={[trackA]}>
        <Harness />
      </SiftProvider>,
    );
    await act(async () => {
      await api.retryFailedRemovals();
    });
    expect(mockProvider.removalLanded).not.toHaveBeenCalled();
  });
});

describe('useRemovalRetry', () => {
  test('retries when it mounts with failures, and when the app comes back', async () => {
    const listeners: ((state: string) => void)[] = [];
    const removers: jest.Mock[] = [];
    const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation((type, listener) => {
      if (type === 'change') listeners.push(listener as (state: string) => void);
      const remove = jest.fn();
      removers.push(remove);
      return { remove } as unknown as ReturnType<typeof AppState.addEventListener>;
    });
    const { rerender, unmount } = await render(
      <SiftProvider initialTracks={[trackA, trackB]}>
        <Harness />
      </SiftProvider>,
    );
    await failFirstRemoval();
    mockProvider.removeFromLibrary.mockReset().mockRejectedValue(new Error('still offline'));

    const before = removers.length;
    await rerender(
      <SiftProvider initialTracks={[trackA, trackB]}>
        <Harness retryHook />
      </SiftProvider>,
    );
    const ownRemovers = removers.slice(before);
    expect(ownRemovers.length).toBeGreaterThan(0);
    await act(async () => {});
    expect(mockProvider.removeFromLibrary).toHaveBeenCalledTimes(1);

    await act(async () => {
      listeners.forEach((listener) => listener('background'));
    });
    expect(mockProvider.removeFromLibrary).toHaveBeenCalledTimes(1);
    await act(async () => {
      listeners.forEach((listener) => listener('active'));
    });
    expect(mockProvider.removeFromLibrary).toHaveBeenCalledTimes(2);
    // Leaving the screen stops listening.
    ownRemovers.forEach((remove) => expect(remove).not.toHaveBeenCalled());
    await unmount();
    ownRemovers.forEach((remove) => expect(remove).toHaveBeenCalled());
    spy.mockRestore();
    mockProvider.removeFromLibrary.mockReset().mockResolvedValue(undefined);
  });

  test('no failures, no retry on mount or return', async () => {
    const listeners: ((state: string) => void)[] = [];
    const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      listeners.push(listener as (state: string) => void);
      return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
    });
    await render(
      <SiftProvider initialTracks={[trackA]}>
        <Harness retryHook />
      </SiftProvider>,
    );
    await act(async () => {
      listeners.forEach((listener) => listener('active'));
    });
    expect(mockProvider.removalLanded).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
