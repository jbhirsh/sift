import fc from 'fast-check';
import { REDACTED, scrubEvent, scrubText } from '../../src/utils/sentryScrub';

// Property-based tests (#147): whatever a song or playlist is called, a
// quoted name or a URL query carrying it never leaves the device. The
// example tests in sentryScrub.test.ts pin the formats; these try names
// nobody thought to write down (emoji, apostrophes, brackets, spaces).

// A name as it could appear inside quotes: anything but the quote marks.
const songName = fc
  .string({ unit: 'grapheme', minLength: 1, maxLength: 20 })
  .filter((s) => !/["“”]/.test(s));

describe('sentryScrub properties', () => {
  test('a quoted name in a message is redacted, whichever quotes it wears', () => {
    fc.assert(
      fc.property(songName, fc.constantFrom(['"', '"'], ['“', '”'], ['"', '']), (song, quotes) => {
        const [open, close] = quotes;
        expect(scrubText(`Decision: keep on ${open}${song}${close}`)).toBe(
          `Decision: keep on "${REDACTED}"`,
        );
      }),
    );
  });

  test("a URL's query, with the name encoded in it, is dropped", () => {
    fc.assert(
      fc.property(songName, songName, (track, artist) => {
        const url =
          'https://lrclib.net/api/get?track_name=' +
          encodeURIComponent(track) +
          '&artist_name=' +
          encodeURIComponent(artist);
        expect(scrubText(`GET ${url} failed`)).toBe('GET https://lrclib.net/api/get failed');
      }),
    );
  });

  test('scrubbing twice changes nothing more than scrubbing once', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'grapheme', maxLength: 60 }), (text) => {
        const once = scrubText(text);
        expect(scrubText(once)).toBe(once);
      }),
    );
  });

  test("an event's extra data keeps no quoted name, however deep it sits", () => {
    fc.assert(
      fc.property(
        songName,
        fc.array(fc.constantFrom('a', 'b', 'c'), { minLength: 1, maxLength: 4 }),
        (song, path) => {
          // { a: { b: { c: 'Saved "<song>"' } } }, at most four levels down,
          // within the depth the scrubber walks.
          const extra = path.reduceRight<unknown>(
            (inner, key) => ({ [key]: inner }),
            `Saved "${song}"`,
          );
          const scrubbed = scrubEvent({ extra: extra as Record<string, unknown> });
          const leaf = path.reduce<unknown>(
            (node, key) => (node as Record<string, unknown>)[key],
            scrubbed.extra,
          );
          expect(leaf).toBe(`Saved "${REDACTED}"`);
        },
      ),
    );
  });
});
