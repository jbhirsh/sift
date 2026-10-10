const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export interface TrackMeta {
  /** Shown on the card: "Played 28× · Added Mar 2021". Empty when nothing is known. */
  text: string;
  /** Read by VoiceOver: "Played 28 times, added March 2021". */
  label: string;
}

/**
 * The card's meta line: how often a song was played and when it was added,
 * the two things people decide on.
 *
 * A play count is only shown when the provider knows it (playsKnown: a
 * provider without play counts reports 0 for every track), and Apple
 * Music's catalog/playlist fallback tracks carry playCount 0 with no add
 * date, so a 0 there means "unknown", never "never played". An empty or unparseable add date is dropped rather
 * than shown as "Added NaN". The month is the local one, as the person
 * remembers it.
 */
export function formatTrackMeta(
  playCount: number,
  dateAdded: string,
  { playsKnown = true }: { playsKnown?: boolean } = {},
): TrackMeta {
  const time = dateAdded ? Date.parse(dateAdded) : NaN;
  const date = Number.isNaN(time) ? null : new Date(time);
  const countKnown = playsKnown && (playCount > 0 || date !== null);

  const text: string[] = [];
  const label: string[] = [];
  if (countKnown) {
    text.push(playCount > 0 ? `Played ${playCount}×` : 'Never played');
    label.push(playCount === 1 ? 'Played once' : playCount > 0 ? `Played ${playCount} times` : 'Never played');
  }
  if (date) {
    text.push(`Added ${MONTHS[date.getMonth()]} ${date.getFullYear()}`);
    label.push(`added ${MONTHS_LONG[date.getMonth()]} ${date.getFullYear()}`);
  }
  const spoken = label.join(', ');
  return {
    text: text.join(' · '),
    label: spoken.charAt(0).toUpperCase() + spoken.slice(1),
  };
}
