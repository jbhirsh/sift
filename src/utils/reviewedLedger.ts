import type { MusicProvider, SiftSource } from '../types';

/**
 * The ledger of songs kept in earlier sifts (#143), as stored: a map from a
 * source key to the kept track ids. Library sifts leave kept songs where
 * they are, so without it every library sift offered every kept song again.
 */
export type ReviewedLedger = Record<string, string[]>;

/**
 * Where a source's kept ids live in the ledger. Keyed by provider as well,
 * since track ids are only unique within one service.
 */
export function ledgerKey(provider: MusicProvider, source: SiftSource): string {
  return source.type === 'playlist'
    ? `${provider}:playlist:${source.playlist.id}`
    : `${provider}:library`;
}

/**
 * Parse a stored ledger. Anything that isn't an object of string arrays is
 * left out entry by entry, so one bad value can't cost the rest; a blob that
 * isn't JSON at all throws, for the caller to report.
 */
export function parseLedger(json: string | null): ReviewedLedger {
  const parsed: unknown = JSON.parse(json ?? '{}');
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
  const ledger: ReviewedLedger = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (Array.isArray(value)) {
      ledger[key] = value.filter((id): id is string => typeof id === 'string');
    }
  }
  return ledger;
}

/** Add ids to a source's entry, without duplicates. Returns a new ledger. */
export function mergeIntoLedger(ledger: ReviewedLedger, key: string, ids: Iterable<string>): ReviewedLedger {
  const merged = new Set(ledger[key] ?? []);
  for (const id of ids) merged.add(id);
  return { ...ledger, [key]: [...merged] };
}

/** Setup's footnote under "Include songs I've already sifted". */
export function reviewedNote(count: number, included: boolean): string {
  if (included) return 'Songs you kept in earlier sifts are included.';
  const n = count.toLocaleString('en-US');
  return count === 1
    ? '1 song you kept in an earlier sift is left out.'
    : `${n} songs you kept in earlier sifts are left out.`;
}
