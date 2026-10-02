import { isRemovalRecord, isLegacyLocalFileRecord } from '../../src/utils/validators';
import type { RemovalRecord, Track } from '../../src/types';

const track: Track = {
  id: 't1',
  name: 'Song',
  artist: 'Artist',
  album: 'Album',
  duration: 200,
  playCount: 3,
  dateAdded: '2024-01-01T00:00:00.000Z',
};

const playlistSource = {
  type: 'playlist' as const,
  playlist: { id: 'p1', name: 'Mix', trackCount: 4 },
};

const record: RemovalRecord = {
  track,
  source: { type: 'library' },
  provider: 'spotify',
  removedAt: '2026-04-08T12:00:00.000Z',
};

/** Round-trip through JSON, the way stored data actually arrives. */
function stored<T>(value: T): unknown {
  return JSON.parse(JSON.stringify(value));
}

describe('isRemovalRecord', () => {
  test('accepts a well-formed record for each source type', () => {
    expect(isRemovalRecord(stored(record))).toBe(true);
    expect(isRemovalRecord(stored({ ...record, source: playlistSource, provider: 'apple-music' }))).toBe(true);
  });

  test('tolerates drift in fields the app never reads from history', () => {
    // Only track.id, source.type and source.playlist.id are read.
    expect(isRemovalRecord({ track: { id: 't1' }, source: { type: 'library' } })).toBe(true);
    expect(
      isRemovalRecord({
        ...record,
        provider: 'tidal',
        removedAt: undefined,
        track: { ...track, duration: null, extra: true },
        source: { type: 'playlist', playlist: { id: 'p1' } },
      }),
    ).toBe(true);
  });

  test.each([
    ['null', null],
    ['a missing track', { ...record, track: undefined }],
    ['a null track id (legacy local file)', { ...record, track: { ...track, id: null } }],
    ['a numeric track id', { ...record, track: { ...track, id: 1 } }],
    ['a missing source', { ...record, source: undefined }],
    ['a source with no type', { ...record, source: {} }],
    ['an unknown source type', { ...record, source: { type: 'album' } }],
    ['a playlist source without a playlist', { ...record, source: { type: 'playlist' } }],
    ['a playlist source with no id', { ...record, source: { type: 'playlist', playlist: { name: 'Mix' } } }],
  ])('rejects %s', (_label, value) => {
    expect(isRemovalRecord(value)).toBe(false);
  });
});

describe('isLegacyLocalFileRecord', () => {
  test('matches a record whose track id is null', () => {
    expect(isLegacyLocalFileRecord({ ...record, track: { ...track, id: null } })).toBe(true);
  });

  test.each([
    ['a valid record', record],
    ['a record with no track', { ...record, track: undefined }],
    ['a record with a missing track id', { ...record, track: { name: 'x' } }],
    ['null', null],
  ])('does not match %s', (_label, value) => {
    expect(isLegacyLocalFileRecord(value)).toBe(false);
  });
});
