// What a mock cover's artworkURL shows (services/mockCovers): the file CI put
// into the E2E app, or Apple's URL everywhere else.
import covers from '../../src/services/mockCovers.json';

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

describe('mockCoverSource', () => {
  const sour = covers.find((cover) => cover.slug === 'sour');

  test("the E2E build reads the cover from the app's bundle", () => {
    expect(loadWith(true).mockCoverSource('mock-cover:sour')).toBe(
      'file:///x/Sift.app/mock-covers/sour.jpg',
    );
  });

  test("dev, Expo Go and the web show Apple's artwork URL", () => {
    expect(loadWith(false).mockCoverSource('mock-cover:sour')).toBe(
      `https://is1-ssl.mzstatic.com/image/thumb/${sour?.path}/1000x1000bb.jpg`,
    );
  });

  test('mockCoverURL makes what mockCoverSource reads', () => {
    const { mockCoverURL, mockCoverSource } = loadWith(true);
    for (const { slug } of covers) {
      expect(mockCoverSource(mockCoverURL(slug))).toBe(
        `file:///x/Sift.app/mock-covers/${slug}.jpg`,
      );
    }
  });

  test.each(['https://example.com/a.jpg', 'file:///a/b.jpg', 'musicKit://1', ''])(
    'any other URL (%p) comes back unchanged',
    (url) => {
      expect(loadWith(true).mockCoverSource(url)).toBe(url);
      expect(loadWith(false).mockCoverSource(url)).toBe(url);
    },
  );

  test.each([
    'mock-cover:',
    'mock-cover:nope',
    'mock-cover:../../etc/passwd',
    'mock-cover:__proto__',
  ])('a slug the list does not have (%p) comes back unchanged', (url) => {
    expect(loadWith(true).mockCoverSource(url)).toBe(url);
    expect(loadWith(false).mockCoverSource(url)).toBe(url);
  });
});
