// Keeps listening history out of the events Sift's JavaScript sends to
// Sentry (#147). Sift's own breadcrumbs no longer name tracks or playlists;
// this catches what else could: error messages that quote a name, and the
// HTTP breadcrumbs and spans the SDK records on its own, whose URLs carry
// LRCLIB's track_name/artist_name query. It redacts quoted names and URL
// queries; an unquoted name in free text gets through. Native crash reports
// bypass the JavaScript hooks entirely (App.tsx turns off the native network
// breadcrumbs they would otherwise carry).
//
// Structural types rather than Sentry's, so utils stay free of SDK imports.

export const REDACTED = '[redacted]';

// A URL's query and fragment in free text. encodeURIComponent leaves
// apostrophes, parentheses and the like unencoded, so the query runs to the
// next whitespace or double quote, never to an apostrophe ("Don't").
const URL_QUERY = /(https?:\/\/[^\s?#"“”]+)[?#][^\s"“”]*/g;
// A double-quoted run, straight or curly, closed by either kind or by the
// end of the text. Names are quoted by convention in messages
// ('Decision: keep on "Peaches"'); apostrophes are left alone.
const QUOTED = /["“][^"“”]*(?:["”]|$)/g;

/** Drops URL queries and quoted runs from free text. */
export function scrubText(text: string): string {
  return text.replace(URL_QUERY, '$1').replace(QUOTED, `"${REDACTED}"`);
}

/** A URL without its query or fragment. */
export function stripUrlQuery(url: string): string {
  const cut = url.search(/[?#]/);
  return cut === -1 ? url : url.slice(0, cut);
}

// Keys holding a request's query or fragment on their own, and keys holding
// a whole URL (OpenTelemetry and Sentry naming).
const QUERY_KEYS = new Set(['http.query', 'http.fragment', 'url.query', 'url.fragment', 'query']);
const URL_KEYS = new Set(['url', 'http.url', 'url.full']);
const MAX_DEPTH = 5;

function scrubValue(value: unknown, depth: number): unknown {
  if (typeof value === 'string') return scrubText(value);
  if (depth >= MAX_DEPTH || value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => scrubValue(v, depth + 1));
  return scrubData(value as Data, depth + 1);
}

type Data = Record<string, unknown>;

/** Scrubs every string in a breadcrumb's or span's data, nested ones too. */
function scrubData(data: Data, depth = 0): Data {
  const out: Data = {};
  for (const [key, value] of Object.entries(data)) {
    if (QUERY_KEYS.has(key)) continue;
    out[key] = URL_KEYS.has(key) && typeof value === 'string'
      ? scrubText(stripUrlQuery(value))
      : scrubValue(value, depth);
  }
  return out;
}

export interface ScrubbableBreadcrumb {
  category?: string;
  message?: string;
  data?: Data;
}

export function scrubBreadcrumb<B extends ScrubbableBreadcrumb>(breadcrumb: B): B {
  return {
    ...breadcrumb,
    ...(breadcrumb.message != null && { message: scrubText(breadcrumb.message) }),
    ...(breadcrumb.data != null && { data: scrubData(breadcrumb.data) }),
  };
}

export interface ScrubbableEvent {
  level?: string;
  message?: string;
  exception?: { values?: { value?: string }[] };
  breadcrumbs?: ScrubbableBreadcrumb[];
  request?: { url?: string; query_string?: unknown };
  spans?: { description?: string; data?: Data }[];
  transaction?: string;
  extra?: Data;
  contexts?: Data;
}

/** Scrubs an error or transaction event before it leaves the device. */
export function scrubEvent<E extends ScrubbableEvent>(event: E): E {
  const out: E = { ...event };
  if (event.message != null) out.message = scrubText(event.message);
  if (event.transaction != null) out.transaction = scrubText(event.transaction);
  if (event.exception?.values) {
    out.exception = {
      ...event.exception,
      values: event.exception.values.map((v) => (v.value != null ? { ...v, value: scrubText(v.value) } : v)),
    };
  }
  if (event.breadcrumbs) out.breadcrumbs = event.breadcrumbs.map(scrubBreadcrumb);
  if (event.request) {
    const { query_string: _dropped, ...request } = event.request;
    out.request = request.url != null ? { ...request, url: stripUrlQuery(request.url) } : request;
  }
  if (event.spans) {
    out.spans = event.spans.map((span) => ({
      ...span,
      ...(span.description != null && { description: scrubText(span.description) }),
      ...(span.data != null && { data: scrubData(span.data) }),
    }));
  }
  if (event.extra) out.extra = scrubData(event.extra);
  // The root span's data (contexts.trace.data) holds the same URLs as spans.
  if (event.contexts) out.contexts = scrubData(event.contexts);
  return out;
}
