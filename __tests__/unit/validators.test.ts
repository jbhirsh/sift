import {
  isTrack,
  isSiftSource,
  isRemovalRecord,
  isLegacyLocalFileRecord,
  isSiftSession,
  migrateLegacySession,
} from '../../src/utils/validators';
import type { RemovalRecord, SiftSession, Track } from '../../src/types';

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

const session: SiftSession = {
  tracks: [track],
  cursor: 0,
  kept: [],
  removed: [],
  skipped: [],
  sortOrder: 'least-played',
  savedAt: '2026-04-03T12:00:00Z',
};

/** Round-trip through JSON, the way stored data actually arrives. */
function stored<T>(value: T): unknown {
  return JSON.parse(JSON.stringify(value));
}

describe('isTrack', () => {
  test('accepts a track with and without the optional URLs', () => {
    expect(isTrack(stored(track))).toBe(true);
    expect(isTrack(stored({ ...track, artworkURL: 'a', previewURL: 'p' }))).toBe(true);
  });

  test.each([
    ['null', null],
    ['an array', [track]],
    ['a string', 'track'],
    ['a null id', { ...track, id: null }],
    ['a numeric name', { ...track, name: 1 }],
    ['a missing artist', { ...track, artist: undefined }],
    ['a missing album', { ...track, album: undefined }],
    ['a string duration', { ...track, duration: '200' }],
    ['a null playCount (NaN after JSON)', { ...track, playCount: null }],
    ['a numeric dateAdded', { ...track, dateAdded: 0 }],
    ['a null artworkURL', { ...track, artworkURL: null }],
    ['a numeric previewURL', { ...track, previewURL: 5 }],
  ])('rejects %s', (_label, value) => {
    expect(isTrack(value)).toBe(false);
  });
});

describe('isSiftSource', () => {
  test('accepts library and playlist sources', () => {
    expect(isSiftSource({ type: 'library' })).toBe(true);
    expect(isSiftSource(stored(playlistSource))).toBe(true);
    expect(
      isSiftSource({ type: 'playlist', playlist: { ...playlistSource.playlist, artworkURL: 'x' } }),
    ).toBe(true);
  });

  test.each([
    ['null', null],
    ['an unknown type', { type: 'album' }],
    ['a playlist without a playlist', { type: 'playlist' }],
    ['a playlist with a numeric id', { type: 'playlist', playlist: { ...playlistSource.playlist, id: 1 } }],
    ['a playlist with no name', { type: 'playlist', playlist: { id: 'p1', trackCount: 1 } }],
    ['a playlist with a string trackCount', { type: 'playlist', playlist: { ...playlistSource.playlist, trackCount: '4' } }],
    ['a playlist with a null artworkURL', { type: 'playlist', playlist: { ...playlistSource.playlist, artworkURL: null } }],
  ])('rejects %s', (_label, value) => {
    expect(isSiftSource(value)).toBe(false);
  });
});

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

describe('isSiftSession', () => {
  test('accepts a minimal session (as older builds saved it)', () => {
    expect(isSiftSession(stored(session))).toBe(true);
  });

  test('accepts a session with every optional field', () => {
    const full: SiftSession = {
      ...session,
      kept: [track],
      removed: [track],
      skipped: [track],
      cursor: 1,
      provider: 'spotify',
      source: playlistSource,
      pendingKeeps: [track],
      removalErrors: ['failed'],
      siftedPlaylistId: 'sifted-1',
    };
    expect(isSiftSession(stored(full))).toBe(true);
    expect(isSiftSession(stored({ ...full, siftedPlaylistId: null }))).toBe(true);
  });

  test.each([
    ['null', null],
    ['an array', []],
    ['missing tracks', { ...session, tracks: undefined }],
    ['tracks not an array', { ...session, tracks: {} }],
    ['a malformed track', { ...session, tracks: [{ id: 't1' }] }],
    ['missing kept', { ...session, kept: undefined }],
    ['missing removed', { ...session, removed: undefined }],
    ['missing skipped', { ...session, skipped: undefined }],
    ['a string cursor', { ...session, cursor: '0' }],
    ['a negative cursor', { ...session, cursor: -1 }],
    ['a fractional cursor', { ...session, cursor: 0.5 }],
    ['a null cursor', { ...session, cursor: null }],
    ['an unknown sortOrder', { ...session, sortOrder: 'alphabetical' }],
    ['a missing savedAt', { ...session, savedAt: undefined }],
    ['an unknown provider', { ...session, provider: 'tidal' }],
    ['a malformed source', { ...session, source: { type: 'playlist' } }],
    ['pendingKeeps not an array', { ...session, pendingKeeps: 'x' }],
    ['a malformed pending keep', { ...session, pendingKeeps: [{}] }],
    ['a non-string removal error', { ...session, removalErrors: [1] }],
    ['a numeric siftedPlaylistId', { ...session, siftedPlaylistId: 7 }],
  ])('rejects a session with %s', (_label, value) => {
    expect(isSiftSession(value)).toBe(false);
  });
});

describe('migrateLegacySession', () => {
  const local = { ...track, id: null };

  test('returns non-sessions unchanged', () => {
    expect(migrateLegacySession(null)).toBeNull();
    expect(migrateLegacySession('x')).toBe('x');
    const noTracks = { cursor: 0 };
    expect(migrateLegacySession(noTracks)).toBe(noTracks);
  });

  test('leaves a current session equal to itself', () => {
    expect(migrateLegacySession(stored(session))).toEqual(session);
  });

  test('drops id-less tracks from every list and only counts those before the cursor', () => {
    const t2 = { ...track, id: 't2' };
    const legacy = {
      ...session,
      tracks: [local, track, local, t2, local],
      cursor: 3,
      kept: [local, track],
      removed: [local],
      skipped: [track],
      pendingKeeps: [local],
    };

    expect(migrateLegacySession(legacy)).toEqual({
      ...session,
      tracks: [track, t2],
      cursor: 1,
      kept: [track],
      removed: [],
      skipped: [track],
      pendingKeeps: [],
    });
  });

  test('clamps a cursor past the end and leaves a non-numeric cursor for validation', () => {
    const past = migrateLegacySession({ ...session, tracks: [local, track], cursor: 5 });
    expect(past).toMatchObject({ tracks: [track], cursor: 4 });

    const bad = migrateLegacySession({ ...session, tracks: [local], cursor: '0' });
    expect(bad).toMatchObject({ tracks: [], cursor: '0' });
    expect(isSiftSession(bad)).toBe(false);
  });

  test('does not mutate its input', () => {
    const legacy = { ...session, tracks: [local, track], cursor: 1 };
    const snapshot = JSON.stringify(legacy);
    migrateLegacySession(legacy);
    expect(JSON.stringify(legacy)).toBe(snapshot);
  });
});
