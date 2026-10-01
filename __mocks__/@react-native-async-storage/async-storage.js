// Root-level Jest mock for async-storage, applied automatically to every
// import (same convention as __mocks__/@sentry/react-native.js).
//
// async-storage 3 ships its official mock as the `./jest` subpath export: an
// in-memory store whose methods are plain functions. The v2 mock it replaced
// exposed jest.fn() methods, which the suites rely on to assert calls
// (expect(AsyncStorage.removeItem).toHaveBeenCalledWith(...)) and to inject
// failures (mockRejectedValueOnce). Wrap the v3 store's methods in jest.fn()
// so both keep working while the storage behavior stays the official one.
const actual = jest.requireActual('@react-native-async-storage/async-storage/jest');

const store = actual.default;
const legacy = Object.fromEntries(
  Object.keys(store).map((method) => [method, jest.fn(store[method])]),
);

module.exports = {
  __esModule: true,
  default: legacy,
  createAsyncStorage: actual.createAsyncStorage,
  clearAllMockStorages: actual.clearAllMockStorages,
};
