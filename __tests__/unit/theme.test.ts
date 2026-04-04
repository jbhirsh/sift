import { SPACING, RADIUS, COLORS, SHADOWS } from '../../src/theme';

describe('SPACING', () => {
  it('has all expected keys', () => {
    const expected = ['xs', 'sm', 'md', 'base', 'lg', 'xl', '2xl', '3xl', '4xl'];
    expect(Object.keys(SPACING).sort()).toEqual(expected.sort());
  });

  it('all values are numbers greater than zero', () => {
    for (const [_key, value] of Object.entries(SPACING)) {
      expect(typeof value).toBe('number');
      expect(value).toBeGreaterThan(0);
    }
  });
});

describe('RADIUS', () => {
  it('has all expected keys', () => {
    const expected = ['sm', 'md', 'lg', 'xl'];
    expect(Object.keys(RADIUS).sort()).toEqual(expected.sort());
  });

  it('all values are numbers greater than zero', () => {
    for (const [_key, value] of Object.entries(RADIUS)) {
      expect(typeof value).toBe('number');
      expect(value).toBeGreaterThan(0);
    }
  });
});

describe('COLORS', () => {
  it('light and dark have matching keys', () => {
    const lightKeys = Object.keys(COLORS.light).sort();
    const darkKeys = Object.keys(COLORS.dark).sort();
    expect(lightKeys).toEqual(darkKeys);
  });

  it('has semantic action colors', () => {
    expect(COLORS.keep).toBeDefined();
    expect(COLORS.remove).toBeDefined();
    expect(COLORS.skip).toBeDefined();
  });
});

describe('SHADOWS', () => {
  it('has all expected presets', () => {
    const expected = ['subtle', 'prominent', 'button'];
    expect(Object.keys(SHADOWS).sort()).toEqual(expected.sort());
  });

  it('each preset has required shadow properties', () => {
    for (const [_name, shadow] of Object.entries(SHADOWS)) {
      expect(shadow).toHaveProperty('shadowColor');
      expect(shadow).toHaveProperty('shadowOpacity');
      expect(shadow).toHaveProperty('shadowRadius');
      expect(shadow).toHaveProperty('shadowOffset');
      expect(shadow).toHaveProperty('elevation');
    }
  });
});
