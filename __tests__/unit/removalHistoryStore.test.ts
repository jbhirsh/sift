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
const { logRemoval, loadHistory } = require('../../src/services/RemovalHistoryStore');

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
