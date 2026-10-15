import * as Sentry from '@sentry/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { MusicProvider, SiftSource, Track } from '../types';
import type { MusicProviderService } from './MusicProviderInterface';
import { ledgerKey } from '../utils/reviewedLedger';
import { siftedPlaylistName } from '../utils/sessionCopy';
import { TrackIndex } from '../utils/trackIdentity';
import { markReviewed, storedReviewedIds, takenBack } from './ReviewedLedgerStore';

/** The ledger keys of the playlists already looked at, as a JSON array. */
const IMPORTED_KEY = 'sift_sifted_imported';

// One look per playlist at a time: Setup and the sift's load can both ask.
const running = new Map<string, Promise<void>>();
// The flag writes, one at a time, so two playlists' never overwrite each other.
let flagWrites: Promise<void> = Promise.resolve();

async function storedKeys(): Promise<string[]> {
  const parsed: unknown = JSON.parse((await AsyncStorage.getItem(IMPORTED_KEY)) ?? '[]');
  return Array.isArray(parsed) ? parsed.filter((key): key is string => typeof key === 'string') : [];
}

function rememberImported(key: string): Promise<void> {
  const write = flagWrites.then(async () => {
    const keys = await storedKeys().catch((): string[] => []);
    if (!keys.includes(key)) await AsyncStorage.setItem(IMPORTED_KEY, JSON.stringify([...keys, key]));
  });
  flagWrites = write.catch(() => undefined);
  return write;
}

async function importNow(
  service: MusicProviderService,
  key: string,
  source: Extract<SiftSource, { type: 'playlist' }>,
  sourceTracks: readonly Track[] | undefined,
): Promise<void> {
  try {
    // An unreadable flag list counts as empty: looking again is harmless.
    if ((await storedKeys().catch((): string[] => [])).includes(key)) return;
    // Not yet allowed to ask (Setup before sign-in): look next time.
    if (!(await service.isAuthorized())) return;
    const name = siftedPlaylistName(source.playlist.name);
    const ids = service.findPlaylists
      ? await service.findPlaylists(name)
      : (await service.loadPlaylists?.() ?? []).filter((p) => p.name === name).map((p) => p.id);
    if (ids.length > 0) {
      const saved = new TrackIndex();
      for (const id of ids) {
        for (const track of await service.loadPlaylistTracks?.(id) ?? []) saved.add(track);
      }
      // By song: Apple Music files a song under a new id in each playlist.
      // The ledger takes the id the playlist's own load gives it.
      const tracks = sourceTracks ?? await service.loadPlaylistTracks?.(source.playlist.id) ?? [];
      // Not a keep the user took back this launch (a resumed old session's
      // keep changed while this ran): that change stands.
      const undone = takenBack(key);
      const kept = tracks.filter((t) => saved.has(t) && !undone.has(t.id)).map((t) => t.id);
      await Promise.all(kept.map((id) => markReviewed(key, id)));
      // A ledger write reports its own failure and resolves: check they
      // landed, or look again next time rather than lose them.
      const stored = await storedReviewedIds(key);
      const missing = kept.filter((id) => !stored.has(id) && !takenBack(key).has(id));
      if (missing.length > 0) throw new Error(`${missing.length} of ${kept.length} kept songs weren't recorded`);
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
