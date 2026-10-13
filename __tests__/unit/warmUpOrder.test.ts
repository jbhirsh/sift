import { UP_NEXT_COUNT, warmUpOrder } from '../../src/utils/warmUpOrder';

const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];

describe('warmUpOrder', () => {
  test('the current card and the next few first, then on from there, then the decided ones', () => {
    expect(UP_NEXT_COUNT).toBe(3);
    expect(warmUpOrder(ids, 2)).toEqual({ upNext: ['c', 'd', 'e'], rest: ['f', 'g', 'a', 'b'] });
  });

  test('from the top: nothing decided yet', () => {
    expect(warmUpOrder(ids, 0)).toEqual({ upNext: ['a', 'b', 'c'], rest: ['d', 'e', 'f', 'g'] });
  });

  test('near the end: fewer up next', () => {
    expect(warmUpOrder(ids, 5)).toEqual({ upNext: ['f', 'g'], rest: ['a', 'b', 'c', 'd', 'e'] });
  });

  test('finished, or a cursor off either end: every song once', () => {
    expect(warmUpOrder(ids, 7)).toEqual({ upNext: [], rest: ids });
    expect(warmUpOrder(ids, 99)).toEqual({ upNext: [], rest: ids });
    expect(warmUpOrder(ids, -3)).toEqual({ upNext: ['a', 'b', 'c'], rest: ['d', 'e', 'f', 'g'] });
  });

  test('no songs', () => {
    expect(warmUpOrder([], 0)).toEqual({ upNext: [], rest: [] });
  });
});
