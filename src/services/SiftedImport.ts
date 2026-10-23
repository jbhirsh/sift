import * as Sentry from '@sentry/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { MusicProvider, SiftSource, Track } from '../types';
import type { MusicProviderService } from './MusicProviderInterface';
import { ledgerKey } from '../utils/reviewedLedger';
import { siftedPlaylistName } from '../utils/sessionCopy';
import { TrackIndex } from '../utils/trackIdentity';
import { markReviewed, storedReviewedIds, takenBack } from './ReviewedLedgerStore';
import { loadPlaylistTracksOnce } from './playlistLoads';

/** The ledger keys of the playlists already looked at, as a JSON array. */
const IMPORTED_KEY = 'sift_sifted_imported';
/**
 * The "- Sifted" playlists older builds' saved sessions named, by ledger
 * key, as a JSON object of id lists: found by id, they still count after
 * the playlist or its "- Sifted" copy was renamed (#179).
 */
const REMEMBERED_IDS_KEY = 'sift_sifted_ids';

// One look per playlist at a time: Setup and the sift's load can both ask.
const running = new Map<string, Promise<void>>();
// The flag writes, one at a time, so two playlists' never overwrite each other.
let flagWrites: Promise<void> = Promise.resolve();

async function storedKeys(): Promise<string[]> {
  const parsed: unknown = JSON.parse((await AsyncStorage.getItem(IMPORTED_KEY)) ?? '[]');
  if (!Array.isArray(parsed)) return [];
  const keys: unknown[] = parsed;
  return keys.filter((key): key is string => typeof key === 'string');
}

/** Runs a storage write after the ones before it. */
function inTurn(write: () => Promise<void>): Promise<void> {
  const run = flagWrites.then(write);
  flagWrites = run.catch(() => undefined);
  return run;
}

function rememberImported(key: string): Promise<void> {
  return inTurn(async () => {
    const keys = await storedKeys().catch((): string[] => []);
    if (!keys.includes(key))
      await AsyncStorage.setItem(IMPORTED_KEY, JSON.stringify([...keys, key]));
  });
}

async function storedIdLists(): Promise<Record<string, string[]>> {
  const parsed: unknown = JSON.parse((await AsyncStorage.getItem(REMEMBERED_IDS_KEY)) ?? '{}');
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
  const lists: Record<string, string[]> = {};
  const entries: [string, unknown][] = Object.entries(parsed);
  for (const [key, value] of entries) {
    if (!Array.isArray(value)) continue;
    const ids: unknown[] = value;
    lists[key] = ids.filter((id): id is string => typeof id === 'string');
  }
  return lists;
}

/**
 * Remember the "- Sifted" playlist an older build's saved session named for
 * its playlist (its siftedPlaylistId), and look at that playlist again on
 * its next sift: the one-time look found "- Sifted" by name, and missed it
 * if either playlist was renamed. Never rejects.
 */
export function rememberSiftedPlaylist(
  provider: MusicProvider,
  source: SiftSource,
  siftedId: string,
): Promise<void> {
  if (source.type !== 'playlist') return Promise.resolve();
  const key = ledgerKey(provider, source);
  return inTurn(async () => {
    const lists = await storedIdLists().catch((): Record<string, string[]> => ({}));
    const ids = lists[key] ?? [];
    if (ids.includes(siftedId)) return;
    await AsyncStorage.setItem(
      REMEMBERED_IDS_KEY,
      JSON.stringify({ ...lists, [key]: [...ids, siftedId] }),
    );
    // Looked at before by name only: look again, with this one.
    const keys = await storedKeys().catch((): string[] => []);
    if (keys.includes(key))
      await AsyncStorage.setItem(IMPORTED_KEY, JSON.stringify(keys.filter((k) => k !== key)));
  }).catch((err: unknown) => {
    Sentry.captureException(err, { tags: { flow: 'sifted-import' } });
  });
}

/**
 * The "- Sifted" playlists to look in: the ones named after the playlist,
 * and any an older build's session named that are still in the library (a
 * deleted one is no keeps, not a failed look to retry forever).
 */
async function siftedPlaylistIds(
  service: MusicProviderService,
  key: string,
  name: string,
): Promise<string[]> {
  const byName = service.findPlaylists
    ? await service.findPlaylists(name)
    : ((await service.loadPlaylists?.()) ?? []).filter((p) => p.name === name).map((p) => p.id);
  const remembered = (await storedIdLists().catch((): Record<string, string[]> => ({})))[key] ?? [];
  const extra = remembered.filter((id) => !byName.includes(id));
  if (extra.length === 0 || !service.loadPlaylists) return byName;
  const listed = new Set((await service.loadPlaylists()).map((p) => p.id));
  return [...byName, ...extra.filter((id) => listed.has(id))];
}

async function importNow(
  service: MusicProviderService,
  key: string,
  source: Extract<SiftSource, { type: 'playlist' }>,
  sourceTracks: readonly Track[] | undefined,
): Promise<void> {
  try {
    // After any flag or id write under way: an old session's "- Sifted"
    // remembered at launch reopens a playlist already looked at.
    await flagWrites;
    // An unreadable flag list counts as empty: looking again is harmless.
    if ((await storedKeys().catch((): string[] => [])).includes(key)) return;
    // Not yet allowed to ask (Setup before sign-in): look next time.
    if (!(await service.isAuthorized())) return;
    const ids = await siftedPlaylistIds(service, key, siftedPlaylistName(source.playlist.name));
    if (ids.length > 0) {
      const saved = new TrackIndex();
      for (const id of ids) {
        for (const track of (await service.loadPlaylistTracks?.(id)) ?? []) saved.add(track);
      }
      // By song: Apple Music files a song under a new id in each playlist.
      // The ledger takes the id the playlist's own load gives it, shared
      // with a sift's load of it under way (#179).
      const tracks =
        sourceTracks ?? (await loadPlaylistTracksOnce(service, source.playlist.id)) ?? [];
      // Not a keep the user took back this launch (a resumed old session's
      // keep changed while this ran): that change stands.
      const undone = takenBack(key);
      const kept = tracks.filter((t) => saved.has(t) && !undone.has(t.id)).map((t) => t.id);
      await Promise.all(kept.map((id) => markReviewed(key, id)));
      // A ledger write reports its own failure and resolves: check they
      // landed, or look again next time rather than lose them.
      const stored = await storedReviewedIds(key);
      const missing = kept.filter((id) => !stored.has(id) && !takenBack(key).has(id));
      if (missing.length > 0)
        throw new Error(`${missing.length} of ${kept.length} kept songs weren't recorded`);
    }
    await rememberImported(key);
  } catch (err) {
    // Not remembered as done, so the next sift of the playlist looks again.
    Sentry.captureException(err, { tags: { flow: 'sifted-import' } });
  }
}

/**
 * Once per playlist, remember as kept the songs an older build copied into
 * "<name> - Sifted" on each Keep, so later sifts of the playlist leave them
 * out as they did then, and Done's "Save kept songs as a playlist" counts
 * them. Builds since remember a playlist keep in the reviewed ledger
 * instead. Never rejects: a failed look is reported and tried again on the
 * next sift. `sourceTracks`: the playlist's songs when the caller has just
 * loaded them.
 */
export function importSiftedKeeps(
  service: MusicProviderService,
  provider: MusicProvider,
  source: SiftSource,
  sourceTracks?: readonly Track[],
): Promise<void> {
  if (source.type !== 'playlist') return Promise.resolve();
  const key = ledgerKey(provider, source);
  const existing = running.get(key);
  if (existing) return existing;
  const run = importNow(service, key, source, sourceTracks).finally(() => running.delete(key));
  running.set(key, run);
  return run;
}
