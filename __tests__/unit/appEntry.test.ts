// index.ts, the bundle's entry: it registers App as the root component.

const mockRegisterRootComponent = jest.fn();

jest.mock('expo', () => ({ registerRootComponent: mockRegisterRootComponent }));
jest.mock('../../src/App', () => ({ __esModule: true, default: function MockApp() {} }));

test('registers App as the root component, once', () => {
  let app: unknown;
  jest.isolateModules(() => {
    require('../../index');
    app = jest.requireMock<{ default: unknown }>('../../src/App').default;
  });
  expect(mockRegisterRootComponent).toHaveBeenCalledTimes(1);
  expect(mockRegisterRootComponent).toHaveBeenCalledWith(app);
});
