import { ledgerKey, mergeIntoLedger, parseLedger, reviewedNote } from '../../src/utils/reviewedLedger';

describe('reviewedLedger', () => {
  test('keys by provider and source', () => {
    expect(ledgerKey('apple-music', { type: 'library' })).toBe('apple-music:library');
    expect(ledgerKey('apple-music', { type: 'playlist', playlist: { id: 'p1', name: 'Mix', trackCount: 3 } }))
      .toBe('apple-music:playlist:p1');
  });

  test('parses a stored ledger, nothing stored reads as empty', () => {
    expect(parseLedger('{"apple-music:library":["a","b"]}')).toEqual({ 'apple-music:library': ['a', 'b'] });
    expect(parseLedger(null)).toEqual({});
  });

  test('drops bad entries one by one and ignores a non-object', () => {
    expect(parseLedger('{"good":["a",3,null,"b"],"bad":"x","worse":{}}')).toEqual({ good: ['a', 'b'] });
    expect(parseLedger('[1,2]')).toEqual({});
    expect(parseLedger('null')).toEqual({});
    expect(parseLedger('"text"')).toEqual({});
  });

  test('an unparseable blob throws for the caller to report', () => {
    expect(() => parseLedger('{"cut short')).toThrow(SyntaxError);
  });

  test('merges without duplicates or touching other sources', () => {
    const ledger = { 'apple-music:library': ['a'], other: ['z'] };
    const merged = mergeIntoLedger(ledger, 'apple-music:library', ['a', 'b']);
    expect(merged).toEqual({ 'apple-music:library': ['a', 'b'], other: ['z'] });
    expect(ledger['apple-music:library']).toEqual(['a']);
    expect(mergeIntoLedger({}, 'k', new Set(['x']))).toEqual({ k: ['x'] });
  });

  test('footnote copy', () => {
    expect(reviewedNote(1, false)).toBe('1 song you’ve already kept is left out of new sifts.');
    expect(reviewedNote(2655, false)).toBe('2,655 songs you’ve already kept are left out of new sifts.');
    expect(reviewedNote(2655, true)).toBe('Songs you’ve already kept are included in new sifts.');
  });
});
