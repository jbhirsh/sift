// E2E only: named moments the app has reached, which a Maestro flow or the
// accessibility audit waits for instead of a clock (jbhirsh/ci#58). The
// app marks them here; components/E2eMarker shows one as a hidden element
// with its name as testID, in the E2E build only (services/trace's
// `tracing`). Plain functions, so services and the state layer can mark;
// hooks/useE2eMark reads one in a component.

const marked = new Set<string>();
const listeners = new Set<() => void>();

function changed(): void {
  for (const listener of listeners) listener();
}

/** Marks `name` as reached. */
export function mark(name: string): void {
  if (marked.has(name)) return;
  marked.add(name);
  changed();
}

/** Unmarks `name`, for a moment that can come round again. */
export function unmark(name: string): void {
  if (marked.delete(name)) changed();
}

/** Whether `name` has been reached. */
export function isMarked(name: string): boolean {
  return marked.has(name);
}

/** Calls `listener` whenever a mark changes; returns the unsubscribe. */
export function subscribeMarks(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
