import { launchFlagOn } from '../../src/utils/launchArgs';

test('a launch argument turns a switch on when it says true, yes or 1', () => {
  for (const value of [true, 1, 'true', 'TRUE', 'YES', 'yes', '1'])
    expect(launchFlagOn(value)).toBe(true);
  for (const value of [undefined, null, false, 0, 2, '', 'false', 'NO', '0', 'truthy', ' yes']) {
    expect(launchFlagOn(value)).toBe(false);
  }
});
