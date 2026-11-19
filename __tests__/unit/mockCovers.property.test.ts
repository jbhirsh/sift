import fc from 'fast-check';
import covers from '../../src/services/mockCovers.json';

// Property-based tests: a saved session's artworkURL is stored data, so
// whatever it holds, mockCoverSource neither throws nor leads outside
// mock-covers/. The examples are in mockCovers.test.ts.

type CoversModule = typeof import('../../src/services/mockCovers');

function loadWith(tracing: boolean): CoversModule {
  let mod: CoversModule | undefined;
  jest.isolateModules(() => {
    jest.doMock('../../src/services/trace', () => ({ tracing }));
    jest.doMock('expo-file-system', () => ({ Paths: { bundle: { uri: 'file:///x/Sift.app/' } } }));
    mod = jest.requireActual<CoversModule>('../../src/services/mockCovers');
  });
  return mod as CoversModule;
}

const slugs = new Set(covers.map((cover) => cover.slug));
const anyURL = fc.oneof(
  fc.string({ unit: 'grapheme' }),
  fc.string({ unit: 'grapheme' }).map((rest) => `mock-cover:${rest}`),
  fc.constantFrom(...slugs).map((slug) => `mock-cover:${slug}`),
);

describe('mockCoverSource properties', () => {
  for (const tracing of [true, false]) {
    const { mockCoverSource } = loadWith(tracing);

    test(`never throws, whatever the URL (tracing ${tracing})`, () => {
      fc.assert(fc.property(anyURL, (url) => typeof mockCoverSource(url) === 'string'));
    });

    test(`a URL that is not a listed mock cover is unchanged (tracing ${tracing})`, () => {
      fc.assert(
        fc.property(
          fc.string({ unit: 'grapheme' }).filter((url) => {
            return !url.startsWith('mock-cover:') || !slugs.has(url.slice('mock-cover:'.length));
          }),
          (url) => mockCoverSource(url) === url,
        ),
      );
    });

    test(`a result is never a path outside mock-covers/ (tracing ${tracing})`, () => {
      fc.assert(
        fc.property(anyURL, (url) => {
          const out = mockCoverSource(url);
          if (out === url) return true;
          return tracing
            ? /^file:\/\/\/x\/Sift\.app\/mock-covers\/[a-z0-9-]+\.jpg$/.test(out)
            : out.startsWith('https://is1-ssl.mzstatic.com/image/thumb/');
        }),
      );
    });
  }
});
