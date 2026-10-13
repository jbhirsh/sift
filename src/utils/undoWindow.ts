// How long Undo can take back the latest decision (#152).

/** The undo window, in milliseconds: what the app ships with. */
export const DEFAULT_UNDO_WINDOW_MS = 5000;

/**
 * The undo window, given a build-time override in milliseconds. Only the
 * E2E build sets one (eas.json, EXPO_PUBLIC_UNDO_WINDOW_MS): its Undo flow
 * must land a tap inside the window, and a slow simulator can take longer
 * than 5 s to make one. Anything but a positive whole number is ignored.
 */
export function undoWindowMs(override: string | undefined): number {
  const value = override?.trim() ?? '';
  if (!/^\d+$/.test(value)) return DEFAULT_UNDO_WINDOW_MS;
  const ms = Number(value);
  return ms > 0 ? ms : DEFAULT_UNDO_WINDOW_MS;
}
