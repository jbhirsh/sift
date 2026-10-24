import type { RemovalRecord } from '../../src/types';

const mockExists = jest.fn();
const mockText = jest.fn();
const mockWrite = jest.fn();
const mockCopy = jest.fn();

const mockMove = jest.fn();
// The copy a rewrite writes first, then moves over the history. Absent
// unless a test leaves one behind, as a rewrite cut short would.
const mockNextExists = jest.fn(() => false);
const mockNextText = jest.fn();

const mockFileInstance = {
  get exists() {
    return mockExists();
  },
  text: () => mockText(),
  write: mockWrite,
  copy: (destination: unknown) => mockCopy(destination),
};

const mockNextInstance = {
  get exists() {
    return mockNextExists();
  },
  text: () => mockNextText(),
  // Shares the history's write mock: what a rewrite writes is what the
  // history holds once the move lands.
  write: mockWrite,
  move: (destination: unknown, options: unknown) => mockMove(destination, options),
};

jest.mock('expo-file-system', () => ({
  File: jest.fn((_dir: string, name: string) =>
    name === 'removal-history.next.json' ? mockNextInstance : mockFileInstance,
  ),
  Paths: { document: '/mock/documents/' },
}));

jest.mock('@sentry/react-native', () => ({
  captureException: jest.fn(),
  addBreadcrumb: jest.fn(),
}));

// Import after mocks are set up
const {
  logRemoval,
  loadHistory,
  removeFromHistory,
  clearHistoryForSource,
  forgetRemovals,
} = require('../../src/services/RemovalHistoryStore');
const Sentry = require('@sentry/react-native');
const { File } = require('expo-file-system');

const record: RemovalRecord = {
  track: {
    id: 'track-1',
    name: 'Test Song',
    artist: 'Test Artist',
    album: 'Test Album',
    duration: 200,
    playCount: 5,
    dateAdded: '2024-01-01T00:00:00.000Z',
  },
  source: { type: 'library' },
  provider: 'apple-music',
  removedAt: '2026-04-08T12:00:00.000Z',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockNextExists.mockReturnValue(false);
  mockMove.mockResolvedValue(undefined);
});

describe('loadHistory', () => {
  test('returns empty array when file does not exist', async () => {
    mockExists.mockReturnValue(false);
    const result = await loadHistory();
    expect(result).toEqual([]);
    // A missing file short-circuits before any read is attempted.
    expect(mockText).not.toHaveBeenCalled();
  });

  test('reads and parses existing history', async () => {
    mockExists.mockReturnValue(true);
    mockText.mockResolvedValue(JSON.stringify([record]));
    const result = await loadHistory();
    expect(result).toEqual([record]);
  });

  test('returns empty array on read error', async () => {
    mockExists.mockImplementation(() => {
      throw new Error('disk error');
    });
    const result = await loadHistory();
    expect(result).toEqual([]);
  });

  test('reports a read/parse failure to Sentry under the load flow', async () => {
    mockExists.mockReturnValue(true);
    mockText.mockResolvedValue('{not valid json');
    const result = await loadHistory();
    expect(result).toEqual([]);
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error), {
      tags: { flow: 'removal-history-load' },
    });
  });
});

describe('logRemoval', () => {
  test('appends record to existing history', async () => {
    mockExists.mockReturnValue(true);
    mockText.mockResolvedValue(JSON.stringify([record]));

    const newRecord: RemovalRecord = { ...record, removedAt: '2026-04-09T12:00:00.000Z' };
    await logRemoval(newRecord);

    expect(mockWrite).toHaveBeenCalledWith(JSON.stringify([record, newRecord]));
  });

  test('creates new history when file does not exist', async () => {
    mockExists.mockReturnValue(false);

    await logRemoval(record);

    expect(mockWrite).toHaveBeenCalledWith(JSON.stringify([record]));
  });

  test('reports to Sentry but resolves when the write fails', async () => {
    mockExists.mockReturnValue(false);
    mockWrite.mockImplementationOnce(() => {
      throw new Error('write failed');
    });

    // A logging failure must never surface to the caller.
    await expect(logRemoval(record)).resolves.toBeUndefined();
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error), {
      tags: { flow: 'removal-history-log' },
    });
  });
});

describe('removeFromHistory', () => {
  const playlistSource = {
    type: 'playlist' as const,
    playlist: { id: 'p1', name: 'Mix', trackCount: 3 },
  };
  const playlistRecord: RemovalRecord = {
    ...record,
    track: { ...record.track, id: 'track-2' },
    source: playlistSource,
  };

  test('drops the matching library record and rewrites the file', async () => {
    mockExists.mockReturnValue(true);
    mockText.mockResolvedValue(JSON.stringify([record]));

    await removeFromHistory('track-1', { type: 'library' });

    expect(mockWrite).toHaveBeenCalledWith(JSON.stringify([]));
  });

  test('drops only the matching playlist record, keyed by playlist id', async () => {
    mockExists.mockReturnValue(true);
    mockText.mockResolvedValue(JSON.stringify([record, playlistRecord]));

    await removeFromHistory('track-2', playlistSource);

    // The library record survives; the playlist record for p1/track-2 is gone.
    expect(mockWrite).toHaveBeenCalledWith(JSON.stringify([record]));
  });

  test('does not rewrite the file when nothing matches', async () => {
    mockExists.mockReturnValue(true);
    mockText.mockResolvedValue(JSON.stringify([record]));

    // Same track id but a different playlist source → no match.
    await removeFromHistory('track-1', playlistSource);

    expect(mockWrite).not.toHaveBeenCalled();
    // A clean no-op — not an error swallowed via the catch path.
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  test('does not purge a record removed under a different playlist id', async () => {
    // The record lives under playlist p2; the restore targets playlist p1.
    // Even though the track id matches, the playlist ids differ, so the
    // record must survive (sameSource keys on the playlist id, not just type).
    const p2Record: RemovalRecord = {
      ...record,
      source: { type: 'playlist', playlist: { id: 'p2', name: 'Other', trackCount: 4 } },
    };
    mockExists.mockReturnValue(true);
    mockText.mockResolvedValue(JSON.stringify([p2Record]));

    await removeFromHistory('track-1', playlistSource); // playlistSource is p1

    expect(mockWrite).not.toHaveBeenCalled();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  test('a restored track no longer appears in history on the next sift', async () => {
    // The track was previously removed and is present in history…
    mockExists.mockReturnValue(true);
    mockText.mockResolvedValue(JSON.stringify([record]));
    const before = await loadHistory();
    expect(before.some((r: RemovalRecord) => r.track.id === 'track-1')).toBe(true);

    // …restoring it purges the record…
    await removeFromHistory('track-1', { type: 'library' });
    expect(mockWrite).toHaveBeenCalledWith(JSON.stringify([]));

    // …so a re-sift reads a history that no longer excludes it.
    mockText.mockResolvedValue(JSON.stringify([]));
    const after = await loadHistory();
    expect(after.some((r: RemovalRecord) => r.track.id === 'track-1')).toBe(false);
  });

  test('reports but never throws on a read/write error', async () => {
    mockExists.mockImplementation(() => {
      throw new Error('disk error');
    });

    await expect(removeFromHistory('track-1', { type: 'library' })).resolves.toBeUndefined();
    expect(mockWrite).not.toHaveBeenCalled();
  });

  test('reports to Sentry under the remove flow when the rewrite itself fails', async () => {
    // A matching record forces a rewrite; the write then throws, exercising
    // removeFromHistory's own catch rather than loadHistory's.
    mockExists.mockReturnValue(true);
    mockText.mockResolvedValue(JSON.stringify([record]));
    mockWrite.mockImplementationOnce(() => {
      throw new Error('write failed');
    });

    await expect(removeFromHistory('track-1', { type: 'library' })).resolves.toBeUndefined();
    expect(mockWrite).toHaveBeenCalledTimes(1);
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error), {
      tags: { flow: 'removal-history-remove' },
    });
  });
});

describe('forgetRemovals', () => {
  const fromPlaylist: RemovalRecord = {
    ...record,
    source: { type: 'playlist', playlist: { id: 'p1', name: 'My Playlist', trackCount: 10 } },
    collected: true,
  };
  const otherSong: RemovalRecord = { ...record, track: { ...record.track, id: 'track-2' } };

  test('drops every record of the song with that provider, whatever sift made it', async () => {
    mockExists.mockReturnValue(true);
    mockText.mockResolvedValue(JSON.stringify([record, fromPlaylist, otherSong]));

    await forgetRemovals('track-1', 'apple-music');

    expect(mockWrite).toHaveBeenCalledWith(JSON.stringify([otherSong]));
  });

  test("keeps another provider's records of the song", async () => {
    const other = { ...record, provider: 'spotify' };
    mockExists.mockReturnValue(true);
    mockText.mockResolvedValue(JSON.stringify([record, other]));

    await forgetRemovals('track-1', 'apple-music');

    expect(mockWrite).toHaveBeenCalledWith(JSON.stringify([other]));
  });

  test('does not rewrite the file when nothing matches', async () => {
    mockExists.mockReturnValue(true);
    mockText.mockResolvedValue(JSON.stringify([otherSong]));

    await forgetRemovals('track-1', 'apple-music');

    expect(mockWrite).not.toHaveBeenCalled();
  });

  test('reports but never throws when the rewrite fails', async () => {
    mockExists.mockReturnValue(true);
    mockText.mockResolvedValue(JSON.stringify([record]));
    mockWrite.mockImplementationOnce(() => {
      throw new Error('disk full');
    });

    await expect(forgetRemovals('track-1', 'apple-music')).resolves.toBeUndefined();

    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error), {
      tags: { flow: 'removal-history-remove' },
    });
  });
});

describe('clearHistoryForSource', () => {
  const playlistRecord: RemovalRecord = {
    track: record.track,
    source: { type: 'playlist', playlist: { id: 'p1', name: 'My Playlist', trackCount: 10 } },
    provider: 'apple-music',
    removedAt: '2026-04-08T12:00:00.000Z',
  };

  const otherPlaylistRecord: RemovalRecord = {
    track: { ...record.track, id: 'track-2' },
    source: { type: 'playlist', playlist: { id: 'p2', name: 'Other Playlist', trackCount: 5 } },
    provider: 'apple-music',
    removedAt: '2026-04-08T13:00:00.000Z',
  };

  test('removes records matching the given playlist ID', async () => {
    mockExists.mockReturnValue(true);
    mockText.mockResolvedValue(JSON.stringify([record, playlistRecord, otherPlaylistRecord]));

    const result = await clearHistoryForSource('p1');

    expect(mockWrite).toHaveBeenCalledWith(JSON.stringify([record, otherPlaylistRecord]));
    // A successful rewrite reports success so callers proceed.
    expect(result).toBe(true);
  });

  test('keeps the collected ones: those songs wait in "Sift — Removed", and starting over un-removes nothing', async () => {
    const collected = {
      ...playlistRecord,
      track: { ...record.track, id: 'track-3' },
      collected: true,
    };
    mockExists.mockReturnValue(true);
    mockText.mockResolvedValue(JSON.stringify([playlistRecord, collected]));

    await expect(clearHistoryForSource('p1')).resolves.toBe(true);

    expect(mockWrite).toHaveBeenCalledWith(JSON.stringify([collected]));
  });

  test('keeps all records when no match', async () => {
    mockExists.mockReturnValue(true);
    mockText.mockResolvedValue(JSON.stringify([record, otherPlaylistRecord]));

    await clearHistoryForSource('p1');

    expect(mockWrite).toHaveBeenCalledWith(JSON.stringify([record, otherPlaylistRecord]));
  });

  test('handles empty history', async () => {
    mockExists.mockReturnValue(false);

    const result = await clearHistoryForSource('p1');

    expect(mockWrite).toHaveBeenCalledWith(JSON.stringify([]));
    expect(result).toBe(true);
  });

  test('returns false and reports to Sentry when the rewrite fails', async () => {
    mockExists.mockReturnValue(true);
    mockText.mockResolvedValue(JSON.stringify([playlistRecord]));
    mockWrite.mockImplementationOnce(() => {
      throw new Error('write failed');
    });

    const result = await clearHistoryForSource('p1');

    // The failure is surfaced to callers so they don't proceed with stale
    // exclusions, and it is reported under the clear flow.
    expect(result).toBe(false);
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error), {
      tags: { flow: 'removal-history-clear' },
    });
  });
});

describe('mutation serialization', () => {
  const playlistSource = {
    type: 'playlist' as const,
    playlist: { id: 'p1', name: 'My Playlist', trackCount: 10 },
  };
  const recordA: RemovalRecord = {
    track: { ...record.track, id: 'track-a' },
    source: playlistSource,
    provider: 'apple-music',
    removedAt: '2026-04-08T12:00:00.000Z',
  };
  const recordB: RemovalRecord = {
    track: { ...record.track, id: 'track-b' },
    source: playlistSource,
    provider: 'apple-music',
    removedAt: '2026-04-08T13:00:00.000Z',
  };

  test('a restore in flight when Start Over clears cannot resurrect cleared records', async () => {
    // Emulate the real file: writes persist and later reads see them, but
    // the FIRST read (the restore's snapshot) is slow — it captures its
    // content at issue time and delivers it only when released. Without the
    // mutation queue, the clear would read+write while the restore is
    // parked, and the restore's stale-snapshot write would then resurrect
    // recordB, which Start Over had just wiped.
    let fileContent = JSON.stringify([recordA, recordB]);
    mockExists.mockReturnValue(true);
    mockWrite.mockImplementation((content: string) => {
      fileContent = content;
    });
    let releaseFirstRead: (() => void) | undefined;
    let reads = 0;
    mockText.mockImplementation(() => {
      reads += 1;
      if (reads === 1) {
        const snapshot = fileContent;
        return new Promise<string>((resolve) => {
          releaseFirstRead = () => resolve(snapshot);
        });
      }
      return Promise.resolve(fileContent);
    });

    const restorePromise = removeFromHistory('track-a', playlistSource);
    const clearPromise = clearHistoryForSource('p1');

    // Let the queue issue the restore's read, then release it.
    for (let i = 0; i < 10 && !releaseFirstRead; i += 1) {
      await Promise.resolve();
    }
    expect(releaseFirstRead).toBeDefined();
    releaseFirstRead?.();
    await Promise.all([restorePromise, clearPromise]);

    // Serialized order: the restore writes [recordB], THEN the clear
    // re-reads that and wipes p1 entirely. Nothing resurrected.
    expect(JSON.parse(fileContent)).toEqual([]);
  });

  test('operations queued behind a mutation observe its write', async () => {
    let fileContent = JSON.stringify([]);
    mockExists.mockReturnValue(true);
    mockWrite.mockImplementation((content: string) => {
      fileContent = content;
    });
    mockText.mockImplementation(() => Promise.resolve(fileContent));

    // Two appends issued back to back must not lose either record to a
    // stale read.
    await Promise.all([logRemoval(recordA), logRemoval(recordB)]);

    expect(JSON.parse(fileContent)).toEqual([recordA, recordB]);
  });

  test('a mutation whose own error reporting throws does not poison the queue', async () => {
    mockExists.mockReturnValue(false); // loadHistory returns []

    // First op: the write throws, and the Sentry report in its catch ALSO
    // throws, so the underlying operation promise rejects. The queue's reject
    // handler must recover so the next mutation still runs.
    mockWrite
      .mockImplementationOnce(() => {
        throw new Error('write failed');
      })
      .mockImplementation(() => {});
    Sentry.captureException.mockImplementationOnce(() => {
      throw new Error('sentry down');
    });

    const first = logRemoval(recordA).catch(() => 'rejected');
    const second = logRemoval(recordB);

    await expect(first).resolves.toBe('rejected');
    await expect(second).resolves.toBeUndefined();
    // The second append landed even though the first op rejected.
    expect(mockWrite).toHaveBeenLastCalledWith(JSON.stringify([recordB]));
  });
});

describe('malformed history on disk', () => {
  const validRecord: RemovalRecord = { ...record, track: { ...record.track, id: 'valid' } };

  test('loadHistory keeps valid records and drops malformed ones without reporting', async () => {
    // The read path runs on every playlist load; the backup on the next
    // mutation is what reports, once.
    mockExists.mockReturnValue(true);
    mockText.mockResolvedValue(
      JSON.stringify([validRecord, { track: { id: 'x' } }, null, { ...record, source: undefined }]),
    );

    const result = await loadHistory();

    expect(result).toEqual([validRecord]);
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(mockWrite).not.toHaveBeenCalled();
  });

  test('clearHistoryForSource backs up wrong-shaped records before rewriting without them', async () => {
    // A parseable file whose entries lack `source` used to make the filter
    // throw on every call, so a playlist Start Over could never proceed. The
    // rewrite drops them, so the original is copied aside first.
    mockExists.mockReturnValue(true);
    mockText.mockResolvedValue(JSON.stringify([{ track: record.track }, validRecord]));
    mockCopy.mockResolvedValue(undefined);

    const result = await clearHistoryForSource('p1');

    expect(result).toBe(true);
    expect(mockCopy).toHaveBeenCalledTimes(1);
    expect(mockCopy.mock.invocationCallOrder[0]).toBeLessThan(
      mockWrite.mock.invocationCallOrder[0],
    );
    expect(mockWrite).toHaveBeenCalledWith(JSON.stringify([validRecord]));
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('Dropped 1 malformed') }),
      {
        tags: { flow: 'removal-history-backup' },
        extra: { backup: expect.stringMatching(/^removal-history\.corrupt-\d+\.json$/), legacy: 0 },
      },
    );
  });

  test('legacy local-file records (null id) are backed up and dropped without an error event', async () => {
    const legacyRecord = { ...record, track: { ...record.track, id: null } };
    mockExists.mockReturnValue(true);
    mockText.mockResolvedValue(JSON.stringify([legacyRecord, validRecord]));
    mockCopy.mockResolvedValue(undefined);

    await logRemoval(record);

    expect(mockCopy).toHaveBeenCalledTimes(1);
    expect(mockWrite).toHaveBeenCalledWith(JSON.stringify([validRecord, record]));
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'removal-history',
        message: expect.stringContaining('Dropped 1 legacy local-file record'),
      }),
    );
  });

  test('never rewrites without dropped records when their backup fails', async () => {
    mockExists.mockReturnValue(true);
    mockText.mockResolvedValue(JSON.stringify([{ track: record.track }, validRecord]));
    mockCopy.mockRejectedValue(new Error('disk full'));

    expect(await clearHistoryForSource('p1')).toBe(false);
    expect(mockWrite).not.toHaveBeenCalled();
  });

  test('a record with drift in unread fields is kept with no backup', async () => {
    const drifted = { track: { id: 'drift' }, source: { type: 'library' } };
    mockExists.mockReturnValue(true);
    mockText.mockResolvedValue(JSON.stringify([drifted]));

    await logRemoval(record);

    expect(mockCopy).not.toHaveBeenCalled();
    expect(mockWrite).toHaveBeenCalledWith(JSON.stringify([drifted, record]));
  });

  test('a Restore after a reset rewrites the file, so it is backed up only once', async () => {
    // removeFromHistory skips the write when nothing matched; after a reset
    // that would leave the corrupt file in place and back it up again on
    // every later Restore.
    let fileContent = 'not json';
    mockExists.mockReturnValue(true);
    mockText.mockImplementation(() => Promise.resolve(fileContent));
    mockWrite.mockImplementation((content: string) => {
      fileContent = content;
    });
    mockCopy.mockResolvedValue(undefined);

    await removeFromHistory('track-1', { type: 'library' });
    await removeFromHistory('track-1', { type: 'library' });

    expect(mockCopy).toHaveBeenCalledTimes(1);
    expect(mockWrite).toHaveBeenCalledTimes(1);
    expect(fileContent).toBe(JSON.stringify([]));
  });

  test('a parseable non-array file is treated as unreadable', async () => {
    mockExists.mockReturnValue(true);
    mockText.mockResolvedValue(JSON.stringify({ records: [record] }));

    expect(await loadHistory()).toEqual([]);
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error), {
      tags: { flow: 'removal-history-load' },
    });
  });

  test('logRemoval backs up an unparseable file before starting fresh', async () => {
    mockExists.mockReturnValue(true);
    mockText.mockResolvedValue('[{"track":{"id":"tru');
    mockCopy.mockResolvedValue(undefined);

    await logRemoval(record);

    // The corrupt file is copied aside under a distinct name…
    expect(mockCopy).toHaveBeenCalledTimes(1);
    // (The one file named for neither the history nor its rewrite.)
    const others = File.mock.calls
      .map((call: string[]) => call[1])
      .filter(
        (name: string) => name !== 'removal-history.json' && name !== 'removal-history.next.json',
      );
    expect(others).toHaveLength(1);
    const backupName = others[0];
    expect(backupName).toMatch(/^removal-history\.corrupt-\d+\.json$/);
    // …the copy lands before the original is overwritten…
    expect(mockCopy.mock.invocationCallOrder[0]).toBeLessThan(
      mockWrite.mock.invocationCallOrder[0],
    );
    // …and the reset is reported once, under its own flow.
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error), {
      tags: { flow: 'removal-history-backup' },
      extra: { backup: backupName },
    });
    expect(mockWrite).toHaveBeenCalledWith(JSON.stringify([record]));
  });

  test('a non-array file is backed up too before clearHistoryForSource rewrites it', async () => {
    mockExists.mockReturnValue(true);
    mockText.mockResolvedValue('{}');
    mockCopy.mockResolvedValue(undefined);

    const result = await clearHistoryForSource('p1');

    expect(result).toBe(true);
    expect(mockCopy).toHaveBeenCalledTimes(1);
    expect(mockWrite).toHaveBeenCalledWith(JSON.stringify([]));
  });

  test('never overwrites an unparseable file when the backup fails', async () => {
    mockExists.mockReturnValue(true);
    mockText.mockResolvedValue('not json');
    mockCopy.mockRejectedValue(new Error('disk full'));

    await expect(logRemoval(record)).resolves.toBeUndefined();

    expect(mockWrite).not.toHaveBeenCalled();
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'disk full' }),
      { tags: { flow: 'removal-history-log' } },
    );
  });

  test('a read failure aborts the mutation instead of writing over the history', async () => {
    // A transient I/O error is not an empty history: appending to [] would
    // replace every stored record with just the new one.
    mockExists.mockReturnValue(true);
    mockText.mockRejectedValue(new Error('read failed'));

    await logRemoval(record);

    expect(mockWrite).not.toHaveBeenCalled();
    expect(mockCopy).not.toHaveBeenCalled();
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error), {
      tags: { flow: 'removal-history-log' },
    });
  });

  test('a valid history is appended to without a backup or a report', async () => {
    mockExists.mockReturnValue(true);
    mockText.mockResolvedValue(JSON.stringify([validRecord]));

    await logRemoval(record);

    expect(mockCopy).not.toHaveBeenCalled();
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(mockWrite).toHaveBeenCalledWith(JSON.stringify([validRecord, record]));
  });
});

describe('rewrites the app is killed during', () => {
  const recordB: RemovalRecord = { ...record, track: { ...record.track, id: 'track-2' } };

  test('a rewrite lands whole: written aside, then moved over the history', async () => {
    mockExists.mockReturnValue(true);
    mockText.mockResolvedValue(JSON.stringify([record]));
    mockMove.mockResolvedValue(undefined);

    await logRemoval(recordB);

    expect(mockWrite).toHaveBeenCalledWith(JSON.stringify([record, recordB]));
    expect(mockMove).toHaveBeenCalledTimes(1);
    expect(mockMove).toHaveBeenCalledWith(mockFileInstance, { overwrite: true });
    // Written in full before the history is replaced.
    expect(mockWrite.mock.invocationCallOrder[0]).toBeLessThan(
      mockMove.mock.invocationCallOrder[0],
    );
  });

  test('a rewrite written in full but never moved is the latest history', async () => {
    // Killed after the old history was deleted for the move: only the
    // rewrite is left.
    mockExists.mockReturnValue(false);
    mockNextExists.mockReturnValue(true);
    mockNextText.mockResolvedValue(JSON.stringify([record, recordB]));

    await expect(loadHistory()).resolves.toEqual([record, recordB]);
  });

  test('a rewrite cut short is ignored in favour of the history', async () => {
    mockExists.mockReturnValue(true);
    mockText.mockResolvedValue(JSON.stringify([record]));
    mockNextExists.mockReturnValue(true);
    mockNextText.mockResolvedValue('[{"track":{"id":"tr');

    await expect(loadHistory()).resolves.toEqual([record]);
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  test('a rewrite that is not a list is ignored too', async () => {
    mockExists.mockReturnValue(true);
    mockText.mockResolvedValue(JSON.stringify([record]));
    mockNextExists.mockReturnValue(true);
    mockNextText.mockResolvedValue('{}');

    await expect(loadHistory()).resolves.toEqual([record]);
  });

  test('the next mutation builds on a recovered rewrite', async () => {
    mockExists.mockReturnValue(false);
    mockNextExists.mockReturnValue(true);
    mockNextText.mockResolvedValue(JSON.stringify([record]));
    mockMove.mockResolvedValue(undefined);

    await removeFromHistory('track-1', { type: 'library' });

    expect(mockWrite).toHaveBeenCalledWith(JSON.stringify([]));
    expect(mockMove).toHaveBeenCalledTimes(1);
  });

  test('a failed move is reported, like a failed write', async () => {
    mockExists.mockReturnValue(true);
    mockText.mockResolvedValue(JSON.stringify([record]));
    mockMove.mockRejectedValueOnce(new Error('move failed'));

    await expect(clearHistoryForSource('pl')).resolves.toBe(false);
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error), {
      tags: { flow: 'removal-history-clear' },
    });
  });
});
