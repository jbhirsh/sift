// A fresh start for an E2E flow without reinstalling the app: decided once
// as services/e2eReset loads, from the build and the launch argument.
type ResetModule = typeof import('../../src/services/e2eReset');

function loadWith(tracing: boolean, launchArgument: () => unknown, clearing = () => Promise.resolve()) {
  const clear = jest.fn(clearing);
  const deleted: string[] = [];
  const trace = jest.fn();
  let mod: ResetModule | undefined;
  jest.isolateModules(() => {
    jest.doMock('../../src/services/trace', () => ({ tracing, trace }));
    jest.doMock('@react-native-async-storage/async-storage', () => ({ __esModule: true, default: { clear } }));
    jest.doMock('expo-file-system', () => ({
      Paths: { document: 'documents' },
      Directory: jest.fn().mockImplementation(() => ({
        list: () => ['removal-history.json', 'removal-history.next.json'].map((name) => ({
          delete: () => deleted.push(name),
        })),
      })),
    }));
    jest.doMock('react-native/Libraries/Settings/Settings', () => ({
      __esModule: true,
      default: { get: (key: string) => (key === 'SiftResetState' ? launchArgument() : undefined) },
    }));
    mod = jest.requireActual<ResetModule>('../../src/services/e2eReset');
  });
  return { mod: mod as ResetModule, clear, deleted, trace };
}

test('the E2E build launched with SiftResetState starts with nothing saved', () => {
  expect(loadWith(true, () => 'true').mod.resetRequested).toBe(true);
});

test('no argument, one that says no, or one that can\'t be read, keeps what was saved', () => {
  expect(loadWith(true, () => undefined).mod.resetRequested).toBe(false);
  expect(loadWith(true, () => 'false').mod.resetRequested).toBe(false);
  expect(loadWith(true, () => {
    throw new Error('no user defaults');
  }).mod.resetRequested).toBe(false);
});

test('a real build never resets, whatever it was launched with', () => {
  expect(loadWith(false, () => 'true').mod.resetRequested).toBe(false);
});

test('a reset isn\'t done until AsyncStorage has finished clearing', async () => {
  let cleared: () => void = () => {};
  const { mod, deleted, trace } = loadWith(true, () => 'true', () => new Promise<void>((resolve) => { cleared = resolve; }));
  let done = false;
  const reset = mod.resetAppData().then(() => { done = true; });
  await Promise.resolve();
  expect(done).toBe(false);
  expect(deleted).toEqual([]);
  expect(trace).not.toHaveBeenCalled();
  cleared();
  await reset;
  expect(done).toBe(true);
  expect(deleted).toHaveLength(2);
});

test('a reset clears AsyncStorage and every file in the documents folder, and says so in the trace', async () => {
  const { mod, clear, deleted, trace } = loadWith(true, () => 'true');
  await mod.resetAppData();
  expect(clear).toHaveBeenCalledTimes(1);
  expect(deleted).toEqual(['removal-history.json', 'removal-history.next.json']);
  expect(trace).toHaveBeenCalledWith('reset', { cleared: 'storage,documents' });
});
