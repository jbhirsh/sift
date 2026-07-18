// Manual mock for @sentry/react-native, applied automatically to any test
// suite that does not provide its own jest.mock factory. The real module
// starts a cleanup setInterval at import time (AsyncExpiringMap), which
// leaks a timer handle and keeps Jest workers from exiting gracefully.
module.exports = {
  init: jest.fn(),
  wrap: jest.fn((component) => component),
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  setTag: jest.fn(),
  setContext: jest.fn(),
  mobileReplayIntegration: jest.fn(() => ({})),
  reactNativeTracingIntegration: jest.fn(() => ({})),
};
