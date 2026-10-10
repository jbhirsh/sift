/**
 * A count short enough for the Sift screen's stats pill (#142): 2,655 is
 * "2.6k", so four- and five-digit counts no longer clip at 360 pt. Rounds
 * down, so a count never reads as more than it is.
 */
export function compactCount(n: number): string {
  if (n < 1000) return String(n);
  const scaled = (value: number, unit: string) => {
    const tenths = Math.floor(value * 10) / 10;
    return `${Number.isInteger(tenths) ? tenths.toFixed(0) : tenths.toFixed(1)}${unit}`;
  };
  if (n < 10_000) return scaled(n / 1000, 'k');
  if (n < 1_000_000) return `${Math.floor(n / 1000)}k`;
  return scaled(n / 1_000_000, 'M');
}
