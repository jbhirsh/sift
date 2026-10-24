// Whether a launch draws touches, decided once as services/touchOverlay
// loads: only the E2E build, and only when the launch argument asks.
function showTouchesWith(tracing: boolean, launchArgument: () => unknown): boolean {
  let result = false;
  jest.isolateModules(() => {
    jest.doMock('../../src/services/trace', () => ({ tracing }));
    // The launch argument as iOS hands it over, through user defaults.
    jest.doMock('react-native/Libraries/Settings/Settings', () => ({
      __esModule: true,
      default: { get: (key: string) => (key === 'SiftShowTouches' ? launchArgument() : undefined) },
    }));
    result = (
      jest.requireActual(
        '../../src/services/touchOverlay',
      ) as typeof import('../../src/services/touchOverlay')
    ).showTouches;
  });
  return result;
}

test('the E2E build launched with SiftShowTouches draws touches', () => {
  expect(showTouchesWith(true, () => 'true')).toBe(true);
});

test('no launch argument, or one that says no, draws nothing', () => {
  expect(showTouchesWith(true, () => undefined)).toBe(false);
  expect(showTouchesWith(true, () => 'false')).toBe(false);
});

test("a build that doesn't trace never draws, whatever it was launched with", () => {
  expect(showTouchesWith(false, () => 'true')).toBe(false);
});

test("a launch argument that can't be read draws nothing", () => {
  expect(
    showTouchesWith(true, () => {
      throw new Error('no user defaults');
    }),
  ).toBe(false);
});
