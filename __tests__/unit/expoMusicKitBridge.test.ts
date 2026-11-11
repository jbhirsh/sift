// modules/expo-musickit/src/index.ts: each wrapper hands its arguments to
// the Swift function of the same name and returns its answer untouched (the
// bridge stays thin; the decisions are in utils/musicKit and
// AppleMusicProvider). The native module is faked here; the Native bridge
// check holds the Swift side to the same names.

type Native = Record<string, jest.Mock>;

const mockNative: Native = {};
const mockRequireNativeModule = jest.fn((_name: string) => mockNative);

jest.mock('expo', () => ({ requireNativeModule: mockRequireNativeModule }));

// Required, not imported: an import would be hoisted above the fakes it needs.
const bridge: typeof import('../../modules/expo-musickit/src') = require('../../modules/expo-musickit/src');

// Each wrapper, the arguments it's called with, and the ones Swift must get.
const calls: [keyof typeof bridge, unknown[], unknown[]][] = [
  ['requestAuthorization', [], []],
  ['getAuthorizationStatus', [], []],
  ['loadLibraryPage', [100, 50], [100, 50]],
  ['loadPlaylistsPage', [0, 25], [0, 25]],
  ['loadPlaylistItems', ['p.1'], ['p.1']],
  ['lookupLibrarySongs', [['i.1', 'i.2']], [['i.1', 'i.2']]],
  ['lookupCatalogSongs', [['123']], [['123']]],
  ['aliasCachedItem', ['i.1', '123'], ['i.1', '123']],
  ['cachedKinds', [['i.1']], [['i.1']]],
  ['play', ['i.1', 42], ['i.1', 42]],
  ['play', ['i.1'], ['i.1', 0]],
  ['pause', [], []],
  ['resume', [], []],
  ['seek', [12.5], [12.5]],
  ['getPlaybackState', [], []],
  ['createEmptyPlaylist', ['Sift — Removed'], ['Sift — Removed']],
  ['findPlaylistsByName', ['Mix - Sifted', 600, 100], ['Mix - Sifted', 600, 100]],
  ['addEachToPlaylist', ['p.1', ['i.1']], ['p.1', ['i.1']]],
  ['removeFromPlaylist', ['p.1', ['i.1']], ['p.1', ['i.1']]],
  ['addEachToLibrary', [['123']], [['123']]],
  ['previewInfo', ['i.1'], ['i.1']],
  ['catalogPreviewForISRC', ['USRC17607839'], ['USRC17607839']],
  ['searchCatalogSongs', ['song artist', 5], ['song artist', 5]],
  ['shazamOffset', ['https://example.com/p.m4a'], ['https://example.com/p.m4a']],
  ['resolveArtworkURL', ['i.1', 300, 300], ['i.1', 300, 300]],
];

test('loads the ExpoMusicKit native module', () => {
  expect(mockRequireNativeModule).toHaveBeenCalledWith('ExpoMusicKit');
});

test.each(calls)('%s(%j) asks Swift with %j and returns its answer', async (name, args, sent) => {
  const answer = { from: name };
  mockNative[name] = jest.fn(() => answer);
  const wrapper = bridge[name] as (...a: unknown[]) => unknown;

  const result: unknown = await wrapper(...args);

  expect(mockNative[name]).toHaveBeenCalledTimes(1);
  expect(mockNative[name]).toHaveBeenCalledWith(...sent);
  // seek returns nothing; every other wrapper hands Swift's answer back.
  expect(result).toBe(name === 'seek' ? undefined : answer);
});

test('every wrapper the bridge exports is checked above', () => {
  const exported = Object.keys(bridge).filter(
    (key) => typeof (bridge as Record<string, unknown>)[key] === 'function',
  );
  expect(new Set(calls.map(([name]) => name))).toEqual(new Set(exported));
});
