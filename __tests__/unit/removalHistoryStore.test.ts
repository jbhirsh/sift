import type { RemovalRecord } from '../../src/types';

const mockExists = jest.fn();
const mockText = jest.fn();
const mockWrite = jest.fn();

const mockFileInstance = {
  get exists() { return mockExists(); },
  text: () => mockText(),
  write: mockWrite,
};

jest.mock('expo-file-system', () => ({
  File: jest.fn(() => mockFileInstance),
  Paths: { document: '/mock/documents/' },
}));

jest.mock('@sentry/react-native', () => ({
  captureException: jest.fn(),
}));

// Import after mocks are set up
const { logRemoval, loadHistory, removeFromHistory, clearHistoryForSource } = require('../../src/services/RemovalHistoryStore');

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
});

describe('loadHistory', () => {
  test('returns empty array when file does not exist', async () => {
    mockExists.mockReturnValue(false);
    const result = await loadHistory();
    expect(result).toEqual([]);
  });

  test('reads and parses existing history', async () => {
    mockExists.mockReturnValue(true);
    mockText.mockResolvedValue(JSON.stringify([record]));
    const result = await loadHistory();
    expect(result).toEqual([record]);
  });

  test('returns empty array on read error', async () => {
    mockExists.mockImplementation(() => { throw new Error('disk error'); });
    const result = await loadHistory();
    expect(result).toEqual([]);
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
});

describe('removeFromHistory', () => {
  const playlistSource = { type: 'playlist' as const, playlist: { id: 'p1', name: 'Mix', trackCount: 3 } };
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
    mockExists.mockImplementation(() => { throw new Error('disk error'); });

    await expect(removeFromHistory('track-1', { type: 'library' })).resolves.toBeUndefined();
    expect(mockWrite).not.toHaveBeenCalled();
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

    await clearHistoryForSource('p1');

    expect(mockWrite).toHaveBeenCalledWith(JSON.stringify([record, otherPlaylistRecord]));
  });

  test('keeps all records when no match', async () => {
    mockExists.mockReturnValue(true);
    mockText.mockResolvedValue(JSON.stringify([record, otherPlaylistRecord]));

    await clearHistoryForSource('p1');

    expect(mockWrite).toHaveBeenCalledWith(JSON.stringify([record, otherPlaylistRecord]));
  });

  test('handles empty history', async () => {
    mockExists.mockReturnValue(false);

    await clearHistoryForSource('p1');

    expect(mockWrite).toHaveBeenCalledWith(JSON.stringify([]));
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
});
