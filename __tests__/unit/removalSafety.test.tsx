import React, { useEffect } from 'react';
import { Alert } from 'react-native';
import { render, act } from '@testing-library/react-native';
import * as Sentry from '@sentry/react-native';
import { SiftProvider, useSift } from '../../src/context/SiftContext';
import { resetRemovalRetries, useMusicProvider } from '../../src/hooks/useMusicProvider';
import {
  forgetRemovals,
  logRemoval,
  removeFromHistory,
} from '../../src/services/RemovalHistoryStore';
import type { MusicProvider, SiftSource, Track } from '../../src/types';

// Removals and restores that overlap, a removal that failed, decisions from
// a saved session being discarded, and Music access on resume.

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
}));

jest.mock('react-native/Libraries/Alert/Alert', () => ({
  __esModule: true,
  default: { alert: jest.fn() },
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
const mix: SiftSource = { type: 'playlist', playlist: { id: 'p1', name: 'Mix', trackCount: 2 } };
// A provider that edits the playlist being sifted (none today: Apple Music
// collects every Remove in "Sift — Removed"), for the path another
// service would take.
const editing = 'spotify' as unknown as MusicProvider;

let api!: ReturnType<typeof useMusicProvider>;
let sift!: ReturnType<typeof useSift>;

function Harness() {
  const currentApi = useMusicProvider();
  const currentSift = useSift();
  useEffect(() => {
    api = currentApi;
    sift = currentSift;
  });
  return null;
}

async function renderSift(
  source: SiftSource = { type: 'library' },
  provider: MusicProvider = 'apple-music',
) {
  await render(
    <SiftProvider initialTracks={[trackA, trackB]}>
      <Harness />
    </SiftProvider>,
  );
  await act(async () => {
    if (provider !== 'apple-music') sift.dispatch({ type: 'SET_PROVIDER', provider });
    if (source.type === 'playlist') sift.dispatch({ type: 'SET_SOURCE', source });
  });
}

/** A promise the test settles by hand. */
function deferred() {
  let resolve!: () => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  jest.clearAllMocks();
  resetRemovalRetries();
  mockProvider.isAuthorized.mockResolvedValue(true);
  mockProvider.requestAuthorization.mockResolvedValue(true);
  mockProvider.removalLanded.mockResolvedValue(true);
  mockProvider.loadPlaylists.mockResolvedValue([]);
  mockProvider.loadPlaylistTracks.mockResolvedValue([]);
});

describe('Restore while the removal is still running', () => {
  test('waits for the removal to finish, then undoes it', async () => {
    await renderSift(mix);
    await act(async () => {
      sift.decide('remove');
    });
    const removal = deferred();
    mockProvider.removeFromLibrary.mockReturnValueOnce(removal.promise);
    let removing!: Promise<void>;
    let restoring!: Promise<boolean>;
    await act(async () => {
      removing = api.removeTrack(trackA);
      restoring = api.restoreTrack(trackA);
    });
    expect(mockProvider.restoreRemoved).not.toHaveBeenCalled();
    await act(async () => {
      removal.resolve();
      await Promise.all([removing, restoring]);
    });
    expect(mockProvider.restoreRemoved).toHaveBeenCalledWith(['a']);
    expect(mockProvider.restoreRemoved.mock.invocationCallOrder[0]).toBeGreaterThan(
      mockProvider.removeFromLibrary.mock.invocationCallOrder[0],
    );
    // The playlist itself is never edited.
    expect(mockProvider.removeFromPlaylist).not.toHaveBeenCalled();
    expect(mockProvider.addToPlaylist).not.toHaveBeenCalled();
    expect(sift.state.removed).toEqual([]);
    expect(sift.state.kept).toEqual([trackA]);
  });

  test("a Restore of another song doesn't wait for it", async () => {
    await renderSift(mix);
    await act(async () => {
      sift.decide('remove');
      sift.decide('remove');
    });
    const removal = deferred();
    mockProvider.removeFromLibrary.mockReturnValueOnce(removal.promise);
    await act(async () => {
      void api.removeTrack(trackA);
      await api.restoreTrack(trackB);
    });
    expect(mockProvider.restoreRemoved).toHaveBeenCalledWith(['b']);
    await act(async () => {
      removal.resolve();
    });
  });

  test('a removal that has finished is no longer waited for', async () => {
    await renderSift(mix);
    await act(async () => {
      sift.decide('remove');
    });
    await act(async () => {
      await api.removeTrack(trackA);
    });
    const later = deferred();
    mockProvider.removeFromLibrary.mockReturnValueOnce(later.promise);
    // A second removal of another song is still running; it's not this one's.
    await act(async () => {
      void api.removeTrack(trackB);
      await api.restoreTrack(trackA);
    });
    expect(mockProvider.restoreRemoved).toHaveBeenCalledWith(['a']);
    await act(async () => {
      later.resolve();
    });
  });
});

describe('two Restores of one song', () => {
  test('the second joins the first: the song is added back once', async () => {
    await renderSift(mix);
    await act(async () => {
      sift.decide('remove');
    });
    const removal = deferred();
    mockProvider.removeFromLibrary.mockReturnValueOnce(removal.promise);
    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    await act(async () => {
      void api.removeTrack(trackA);
      first = api.restoreTrack(trackA);
      second = api.restoreTrack(trackA);
    });
    expect(second).toBe(first);
    await act(async () => {
      removal.resolve();
      await Promise.all([first, second]);
    });
    expect(mockProvider.restoreRemoved).toHaveBeenCalledTimes(1);
    // Once it's done, a later Restore runs again.
    await act(async () => {
      await api.restoreTrack(trackA);
    });
    expect(mockProvider.restoreRemoved).toHaveBeenCalledTimes(2);
  });
});

describe('Restore after a collected removal that failed', () => {
  async function failRemoval() {
    await act(async () => {
      sift.decide('remove');
    });
    mockProvider.removeFromLibrary.mockRejectedValueOnce(new Error('offline'));
    await act(async () => {
      await api.removeTrack(trackA);
    });
    expect(sift.state.failedRemovalIds).toEqual(['a']);
  }

  test('a song that never went into "Sift — Removed" is just restored', async () => {
    await renderSift(mix);
    await failRemoval();
    mockProvider.restoreRemoved.mockResolvedValueOnce(0);
    mockProvider.removalLanded.mockResolvedValueOnce(false);
    await act(async () => {
      await api.restoreTrack(trackA);
    });
    expect(mockProvider.removalLanded).toHaveBeenCalledWith(mix, 'a');
    expect(forgetRemovals).toHaveBeenCalledWith('a', 'apple-music');
    expect(sift.state.removed).toEqual([]);
    expect(sift.state.kept).toEqual([trackA]);
    expect(sift.state.failedRemovalIds).toEqual([]);
    expect(sift.state.removalErrors).toEqual([]);
  });

  test('one that failed after landing comes back out of "Sift — Removed"', async () => {
    await renderSift(mix);
    await failRemoval();
    await act(async () => {
      await api.restoreTrack(trackA);
    });
    expect(mockProvider.restoreRemoved).toHaveBeenCalledWith(['a']);
    expect(sift.state.failedRemovalIds).toEqual([]);
    expect(sift.state.removalErrors).toEqual([]);
  });

  test('without a way to restore or ask, the Restore only forgets the removal', async () => {
    const { restoreRemoved, removalLanded } = mockProvider;
    (mockProvider as Partial<typeof mockProvider>).restoreRemoved = undefined;
    (mockProvider as Partial<typeof mockProvider>).removalLanded = undefined;
    try {
      await renderSift(mix);
      await act(async () => {
        sift.decide('remove');
      });
      await act(async () => {
        await api.restoreTrack(trackA);
      });
      expect(forgetRemovals).toHaveBeenCalledWith('a', 'apple-music');
      expect(sift.state.kept).toEqual([trackA]);
    } finally {
      mockProvider.restoreRemoved = restoreRemoved;
      mockProvider.removalLanded = removalLanded;
    }
  });
});

describe('Restore after a removal that failed, with a provider that edits playlists', () => {
  async function failRemoval() {
    await act(async () => {
      sift.decide('remove');
    });
    mockProvider.removeFromPlaylist.mockRejectedValueOnce(new Error('offline'));
    await act(async () => {
      await api.removeTrack(trackA);
    });
    expect(sift.state.failedRemovalIds).toEqual(['a']);
  }

  test("a song still in the playlist isn't added a second time", async () => {
    await renderSift(mix, editing);
    await failRemoval();
    mockProvider.removalLanded.mockResolvedValueOnce(false);
    await act(async () => {
      await api.restoreTrack(trackA);
    });
    expect(mockProvider.removalLanded).toHaveBeenCalledWith(mix, 'a');
    expect(mockProvider.addToPlaylist).not.toHaveBeenCalled();
    expect(removeFromHistory).toHaveBeenCalledWith('a', mix);
    // Restored, and no longer a failure to retry or report.
    expect(sift.state.removed).toEqual([]);
    expect(sift.state.kept).toEqual([trackA]);
    expect(sift.state.failedRemovalIds).toEqual([]);
    expect(sift.state.removalErrors).toEqual([]);
  });

  test('one that failed after taking effect is added back', async () => {
    await renderSift(mix, editing);
    await failRemoval();
    await act(async () => {
      await api.restoreTrack(trackA);
    });
    expect(mockProvider.addToPlaylist).toHaveBeenCalledWith('p1', ['a']);
    expect(sift.state.failedRemovalIds).toEqual([]);
    expect(sift.state.removalErrors).toEqual([]);
  });

  test('a failure that came in after the Restore was tapped is still caught', async () => {
    await renderSift(mix, editing);
    await act(async () => {
      sift.decide('remove');
    });
    const removal = deferred();
    mockProvider.removeFromPlaylist.mockReturnValueOnce(removal.promise);
    mockProvider.removalLanded.mockResolvedValueOnce(false);
    let restoring!: Promise<boolean>;
    await act(async () => {
      void api.removeTrack(trackA);
      restoring = api.restoreTrack(trackA);
    });
    await act(async () => {
      removal.reject(new Error('offline'));
      await restoring;
    });
    expect(mockProvider.addToPlaylist).not.toHaveBeenCalled();
    expect(sift.state.kept).toEqual([trackA]);
  });

  test('without a way to ask, the playlist Restore adds it back as before', async () => {
    const landed = mockProvider.removalLanded;
    (mockProvider as Partial<typeof mockProvider>).removalLanded = undefined;
    try {
      await renderSift(mix, editing);
      await act(async () => {
        sift.decide('remove');
      });
      await act(async () => {
        await api.restoreTrack(trackA);
      });
      expect(mockProvider.addToPlaylist).toHaveBeenCalledWith('p1', ['a']);
    } finally {
      mockProvider.removalLanded = landed;
    }
  });
});

describe('decisions from a saved session being discarded', () => {
  test("a Remove goes to that session's source, and a failure stays out of state", async () => {
    await renderSift();
    mockProvider.removeFromLibrary.mockRejectedValueOnce(new Error('offline'));
    await act(async () => {
      await api.removeTrack(trackA, { source: mix, provider: 'apple-music' });
    });
    // Recorded for that playlist, collected in "Sift — Removed" like any Remove.
    expect(logRemoval).toHaveBeenCalledWith(
      expect.objectContaining({ track: trackA, source: mix, collected: true }),
    );
    expect(mockProvider.removeFromLibrary).toHaveBeenCalledWith(['a']);
    expect(mockProvider.removeFromPlaylist).not.toHaveBeenCalled();
    // Its record is dropped: the song never left.
    expect(removeFromHistory).toHaveBeenCalledWith('a', mix);
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error), {
      tags: { flow: 'remove-track' },
    });
    expect(sift.state.failedRemovalIds).toEqual([]);
    expect(sift.state.removalErrors).toEqual([]);
  });

  test("one that lands doesn't retry the sift in state's failures", async () => {
    await renderSift();
    await act(async () => {
      sift.decide('remove');
    });
    mockProvider.removeFromLibrary.mockRejectedValueOnce(new Error('offline'));
    await act(async () => {
      await api.removeTrack(trackA);
    });
    mockProvider.removalLanded.mockClear();
    await act(async () => {
      await api.removeTrack(trackB, { source: mix, provider: 'apple-music' });
    });
    expect(mockProvider.removalLanded).not.toHaveBeenCalled();
    expect(sift.state.failedRemovalIds).toEqual(['a']);
  });
});

describe('ensureAccess', () => {
  test('already authorized: yes, without asking', async () => {
    await renderSift();
    let ok = false;
    await act(async () => {
      ok = await api.ensureAccess();
    });
    expect(ok).toBe(true);
    expect(mockProvider.requestAuthorization).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  test('not yet: asks, and a yes is a yes', async () => {
    mockProvider.isAuthorized.mockResolvedValue(false);
    await renderSift();
    let ok = false;
    await act(async () => {
      ok = await api.ensureAccess();
    });
    expect(ok).toBe(true);
    expect(mockProvider.requestAuthorization).toHaveBeenCalledTimes(1);
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  test('refused: says so, offers Settings, and marks the connection lost', async () => {
    mockProvider.isAuthorized.mockResolvedValue(false);
    mockProvider.requestAuthorization.mockResolvedValue(false);
    await renderSift();
    let ok = true;
    await act(async () => {
      ok = await api.ensureAccess();
    });
    expect(ok).toBe(false);
    expect(sift.state.connectionStatus).toBe('disconnected');
    expect(Alert.alert).toHaveBeenCalledWith('Music Access Required', expect.any(String), [
      expect.objectContaining({ text: 'Cancel' }),
      expect.objectContaining({ text: 'Open Settings' }),
    ]);
  });
});
