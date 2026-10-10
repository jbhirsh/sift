import fc from 'fast-check';
import { fromCompact, toCompact } from '../../src/utils/sessionFormat';
import { isCompactSession, isStoredTracks } from '../../src/utils/validators';
import type { SiftSession, Track } from '../../src/types';

const track = (i: number): Track => ({
  id: `t${i}`, name: `Track ${i}`, artist: 'Artist', album: 'Album', duration: 200, playCount: i, dateAdded: '2020-01-01T00:00:00.000Z',
});

// A session as the reducer builds one: decided cards split three ways,
// some removed songs restored to kept (appended out of order).
const sessionArb = fc
  .tuple(
    fc.integer({ min: 1, max: 30 }),
    fc.array(fc.constantFrom('keep', 'remove', 'skip'), { maxLength: 30 }),
    fc.array(fc.nat(), { maxLength: 5 }),
    fc.boolean(),
  )
  .map(([n, decisions, restores, withOptional]): SiftSession => {
    const tracks = Array.from({ length: n }, (_, i) => track(i));
    const decided = decisions.slice(0, n);
    const kept: Track[] = [];
    let removed: Track[] = [];
    const skipped: Track[] = [];
    decided.forEach((d, i) => (d === 'keep' ? kept : d === 'remove' ? removed : skipped).push(tracks[i]));
    for (const r of restores) {
      if (removed.length === 0) break;
      const t = removed[r % removed.length];
      removed = removed.filter((x) => x !== t);
      kept.push(t);
    }
    const base: SiftSession = { tracks, cursor: decided.length, kept, removed, skipped, sortOrder: 'oldest', savedAt: '2026-10-10T00:00:00.000Z' };
    return withOptional
      ? {
        ...base, provider: 'apple-music', source: { type: 'library' }, pendingKeeps: kept.slice(0, 1), removalErrors: ['x'], failedRemovalIds: [], siftedPlaylistId: null,
        pending: decided.length > 0 ? { trackId: tracks[decided.length - 1].id, decision: decided[decided.length - 1], at: 1700000000000 } : null,
      }
      : base;
  });

describe('compact session format (#150)', () => {
  test('any session survives the round trip exactly, through JSON', () => {
    fc.assert(
      fc.property(sessionArb, (session) => {
        const compact = JSON.parse(JSON.stringify(toCompact(session, { slot: 'b', version: 'v1' })));
        const stored = JSON.parse(JSON.stringify({ version: 'v1', tracks: session.tracks }));
        expect(isCompactSession(compact)).toBe(true);
        expect(isStoredTracks(stored)).toBe(true);
        expect(fromCompact(compact, stored)).toEqual(session);
      }),
    );
  });

  test("a record and a list that don't go together give no session", () => {
    const tracks = [track(1), track(2)];
    const session: SiftSession = { tracks, cursor: 1, kept: [tracks[0]], removed: [], skipped: [], sortOrder: 'oldest', savedAt: 'now' };
    const compact = toCompact(session, { slot: 'a', version: 'v1' });
    expect(fromCompact(compact, { version: 'v2', tracks })).toBeNull();
    expect(fromCompact(compact, { version: 'v1', tracks: [track(2)] })).toBeNull();
    expect(fromCompact({ ...compact, cursor: 3 }, { version: 'v1', tracks })).toBeNull();
  });

  test('the record holds ids, not tracks', () => {
    const tracks = [track(1)];
    const compact = toCompact({ tracks, cursor: 1, kept: tracks, removed: [], skipped: [], sortOrder: 'oldest', savedAt: 'now' }, { slot: 'a', version: 'v' });
    expect(JSON.stringify(compact)).not.toContain('Track 1');
    expect(isCompactSession({ ...compact, tracksSlot: 'c' })).toBe(false);
    expect(isCompactSession({ ...compact, v: 1 })).toBe(false);
  });
});
