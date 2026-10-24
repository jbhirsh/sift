import * as Sentry from '@sentry/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { MusicProvider } from '../types';
import type { MusicProviderService } from './MusicProviderInterface';
import {
  collectedRemovalIds,
  collectsRemovals,
  deletionCandidates,
} from '../utils/libraryRemovals';
import { loadHistory } from './RemovalHistoryStore';
import { trace } from './trace';

/**
 * The songs Setup has already said were deleted, by provider, as a JSON
 * object of id lists. Their removal records stay: a song can come back (a
 * lapsed subscription or library sync hides catalog songs from the library
 * and its playlists until it's restored), and must still be left out of
 * sifts then. It just isn't counted again.
 */
const REPORTED_KEY = 'sift_deleted_in_music_reported';

interface Look {
  provider: MusicProvider;
  /** Deleted since, not said yet. */
  deleted: string[];
  /** Every song still collected, to keep the reported list to those. */
  collected: Set<string>;
}

// This launch's look, kept until a Setup shows its count: one that goes
// away before the look finishes (a resumed sift, Start Sifting) leaves the
// note for the next.
let look: Promise<Look> | null = null;
let shown = false;

async function storedReported(): Promise<Record<string, string[]>> {
  // Anything but an object of lists reads as none (Object.entries of a
  // number or string has no lists; of null, it throws: callers catch).
  const parsed = JSON.parse((await AsyncStorage.getItem(REPORTED_KEY)) ?? '{}') as Record<
    string,
    unknown
  >;
  const lists: Record<string, string[]> = {};
  for (const [provider, ids] of Object.entries(parsed)) {
    if (Array.isArray(ids))
      lists[provider] = ids.filter((id): id is string => typeof id === 'string');
  }
  return lists;
}

async function lookNow(service: MusicProviderService, provider: MusicProvider): Promise<Look> {
  const nothing: Look = { provider, deleted: [], collected: new Set() };
  try {
    if (!collectsRemovals(provider) || !service.deletedFromLibrary) return nothing;
    // Silent without library access: this never asks for it.
    if (!(await service.isAuthorized())) return nothing;
    const history = await loadHistory();
    const reported = new Set(
      (await storedReported().catch((): Record<string, string[]> => ({})))[provider] ?? [],
    );
    const candidates = deletionCandidates(history, provider).filter((t) => !reported.has(t.id));
    if (candidates.length === 0) return nothing;
    const deleted = await service.deletedFromLibrary(candidates);
    if (deleted.length > 0) trace('deleted-in-music', { count: deleted.length });
    return { provider, deleted, collected: collectedRemovalIds(history, provider) };
  } catch (err) {
    Sentry.captureException(err, { tags: { flow: 'deleted-in-music' } });
    return nothing;
  }
}

/**
 * How many songs Sift collected in "Sift — Removed" the user has since
 * deleted from their library in Music (#183), for Setup to say: a library
 * song gone from "Sift — Removed" and not found in the library. Looks once
 * per launch, and only when there's something to look up; the same count
 * until a Setup shows it (markDeletedInMusicShown), then 0. 0 without
 * library access or when the look fails. Never rejects.
 */
export async function deletedInMusicCount(
  service: MusicProviderService,
  provider: MusicProvider,
): Promise<number> {
  look ??= lookNow(service, provider);
  const result = await look;
  return shown ? 0 : result.deleted.length;
}

/**
 * Setup said it: those songs are remembered as reported, so no later launch
 * counts them again, and this launch says it no more. Never rejects.
 */
export async function markDeletedInMusicShown(): Promise<void> {
  if (shown || !look) return;
  shown = true;
  const { provider, deleted, collected } = await look;
  if (deleted.length === 0) return;
  try {
    const lists = await storedReported().catch((): Record<string, string[]> => ({}));
    // Only songs still collected: a restored one's records are gone.
    const ids = [...new Set([...(lists[provider] ?? []), ...deleted])].filter((id) =>
      collected.has(id),
    );
    await AsyncStorage.setItem(REPORTED_KEY, JSON.stringify({ ...lists, [provider]: ids }));
  } catch (err) {
    Sentry.captureException(err, { tags: { flow: 'deleted-in-music' } });
  }
}
