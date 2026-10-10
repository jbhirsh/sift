import { REDACTED, scrubBreadcrumb, scrubEvent, scrubText, stripUrlQuery } from '../../src/utils/sentryScrub';

const LRCLIB = 'https://lrclib.net/api/get?track_name=Peaches&artist_name=Justin%20Bieber&duration=198';
// encodeURIComponent leaves apostrophes as they are.
const LRCLIB_APOSTROPHE = "https://lrclib.net/api/get?track_name=Don't%20Stop%20Me%20Now&artist_name=Queen&duration=210";

describe('scrubText', () => {
  test('redacts double-quoted names, straight and curly', () => {
    expect(scrubText('Decision: keep on "Peaches"')).toBe(`Decision: keep on "${REDACTED}"`);
    expect(scrubText('Loading “Road Trip”…')).toBe(`Loading "${REDACTED}"…`);
  });

  test('drops URL queries and fragments, keeping the host and path', () => {
    expect(scrubText(`GET ${LRCLIB}`)).toBe('GET https://lrclib.net/api/get');
    expect(scrubText('see https://example.com/a#b and more')).toBe('see https://example.com/a and more');
  });

  test("a name with an apostrophe doesn't end the query early", () => {
    expect(scrubText(`GET ${LRCLIB_APOSTROPHE}`)).toBe('GET https://lrclib.net/api/get');
    expect(scrubText(`"${LRCLIB_APOSTROPHE}" failed`)).toBe(`"${REDACTED}" failed`);
  });

  test('redacts an unterminated quote and mixed quote styles', () => {
    expect(scrubText('Decision: keep on "Peaches')).toBe(`Decision: keep on "${REDACTED}"`);
    expect(scrubText('Loading “Road Trip"…')).toBe(`Loading "${REDACTED}"…`);
  });

  test('leaves apostrophes and plain text alone', () => {
    expect(scrubText("Couldn't save: 3 of 10 failed")).toBe("Couldn't save: 3 of 10 failed");
    expect(scrubText('')).toBe('');
  });
});

describe('stripUrlQuery', () => {
  test('cuts at the first ? or #', () => {
    expect(stripUrlQuery(LRCLIB_APOSTROPHE)).toBe('https://lrclib.net/api/get');
    expect(stripUrlQuery('https://example.com/a#frag')).toBe('https://example.com/a');
    expect(stripUrlQuery('https://example.com/a')).toBe('https://example.com/a');
  });
});

describe('scrubBreadcrumb', () => {
  test("scrubs the message and the data's strings, and drops query keys", () => {
    const crumb = scrubBreadcrumb({
      category: 'http',
      message: 'Play failed: "Peaches"',
      data: { url: LRCLIB, method: 'GET', status_code: 200, 'http.query': 'track_name=Peaches' },
    });
    expect(crumb).toEqual({
      category: 'http',
      message: `Play failed: "${REDACTED}"`,
      data: { url: 'https://lrclib.net/api/get', method: 'GET', status_code: 200 },
    });
  });

  test("strips an XHR breadcrumb's raw url and drops its query and fragment keys", () => {
    // The keys React Native's XHR instrumentation records.
    const crumb = scrubBreadcrumb({
      category: 'xhr',
      data: {
        url: LRCLIB_APOSTROPHE,
        'http.url': LRCLIB_APOSTROPHE,
        'http.query': "?track_name=Don't%20Stop%20Me%20Now",
        'http.fragment': '#x',
        method: 'GET',
      },
    });
    expect(crumb.data).toEqual({
      url: 'https://lrclib.net/api/get',
      'http.url': 'https://lrclib.net/api/get',
      method: 'GET',
    });
  });

  test('scrubs strings nested in arrays and objects (console arguments)', () => {
    const crumb = scrubBreadcrumb({
      category: 'console',
      message: 'Warning: "Peaches"',
      data: { arguments: ['Warning:', '"Peaches"', { url: LRCLIB }], logger: 'console' },
    });
    expect(crumb.data).toEqual({
      arguments: ['Warning:', `"${REDACTED}"`, { url: 'https://lrclib.net/api/get' }],
      logger: 'console',
    });
  });

  test('adds no keys to a breadcrumb without a message or data', () => {
    expect(scrubBreadcrumb({ category: 'navigation' })).toEqual({ category: 'navigation' });
  });
});

describe('scrubEvent', () => {
  test('scrubs exception values, the message, breadcrumbs and the request', () => {
    const event = scrubEvent({
      message: 'Restore failed for "Peaches"',
      exception: { values: [{ type: 'Error', value: 'No song "Peaches" in "Road Trip"' }, { type: 'Error' }] },
      breadcrumbs: [{ message: 'Decision: keep on "Peaches"' }],
      request: { url: LRCLIB, query_string: 'track_name=Peaches', method: 'GET' },
    });
    expect(event.message).toBe(`Restore failed for "${REDACTED}"`);
    expect(event.exception?.values).toEqual([
      { type: 'Error', value: `No song "${REDACTED}" in "${REDACTED}"` },
      { type: 'Error' },
    ]);
    expect(event.breadcrumbs).toEqual([{ message: `Decision: keep on "${REDACTED}"` }]);
    expect(event.request).toEqual({ url: 'https://lrclib.net/api/get', method: 'GET' });
  });

  test("scrubs a transaction's name, its spans' URLs and the root span's data", () => {
    const xhrData = {
      url: LRCLIB_APOSTROPHE,
      'http.url': LRCLIB_APOSTROPHE,
      'http.query': "?track_name=Don't%20Stop%20Me%20Now",
      'http.fragment': '',
      'http.status_code': 200,
    };
    const scrubbedData = { url: 'https://lrclib.net/api/get', 'http.url': 'https://lrclib.net/api/get', 'http.status_code': 200 };
    const event = scrubEvent({
      transaction: 'SiftScreen',
      spans: [
        { description: `GET ${LRCLIB_APOSTROPHE}`, data: xhrData },
        { description: 'ui.load' },
      ],
      contexts: { trace: { op: 'http.client', data: xhrData } },
    });
    expect(event.transaction).toBe('SiftScreen');
    expect(event.spans).toEqual([
      { description: 'GET https://lrclib.net/api/get', data: scrubbedData },
      { description: 'ui.load' },
    ]);
    expect(event.contexts).toEqual({ trace: { op: 'http.client', data: scrubbedData } });
  });

  test('scrubs extra', () => {
    expect(scrubEvent({ extra: { note: 'left out of "Road Trip"', count: 3 } }).extra).toEqual({
      note: `left out of "${REDACTED}"`,
      count: 3,
    });
  });

  test('passes through an event with nothing to scrub, without adding keys', () => {
    expect(scrubEvent({ level: 'error' })).toEqual({ level: 'error' });
  });
});
