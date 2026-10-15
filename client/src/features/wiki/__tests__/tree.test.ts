import { ancestorsOf, canAddChild, depthOf, expandedToReveal, groupByParent, heightBelow, planMove, visibleRows } from '../lib/tree';
import type { WikiPageSummary } from '../types';

const page = (_id: string, parent: string | null, position: number, title = _id): WikiPageSummary => ({
  _id, parent, position, title, project: '', slug: _id, version: 1, archived: false,
  createdBy: null, updatedBy: null, createdAt: '2030-01-01T00:00:00.000Z', updatedAt: '2030-01-01T00:00:00.000Z',
});

// a (b (c), d), e
const pages = [page('e', null, 1), page('c', 'b', 0), page('a', null, 0), page('d', 'a', 1), page('b', 'a', 0)];

describe('visibleRows', () => {
  it('orders by position and only descends into expanded parents', () => {
    expect(visibleRows(pages, new Set()).map(row => row.page._id)).toEqual(['a', 'e']);
    const rows = visibleRows(pages, new Set(['a', 'b']));
    expect(rows.map(row => [row.page._id, row.depth])).toEqual([['a', 0], ['b', 1], ['c', 2], ['d', 1], ['e', 0]]);
    expect(rows[0]).toMatchObject({ hasChildren: true, expanded: true, posInSet: 1, setSize: 2 });
    expect(rows[2]).toMatchObject({ hasChildren: false, expanded: false });
  });

  it('treats a page with a missing parent as top level and survives a cycle', () => {
    const odd = [page('x', 'ghost', 0), page('p', 'q', 0), page('q', 'p', 0)];
    expect(groupByParent(odd).get('')?.map(item => item._id)).toEqual(['x']);
    expect(visibleRows(odd, new Set(['p', 'q'])).map(row => row.page._id)).toEqual(['x']);
  });
});

describe('ancestors and depth', () => {
  it('lists parents from the top down', () => {
    expect(ancestorsOf(pages, 'c').map(item => item._id)).toEqual(['a', 'b']);
    expect(ancestorsOf(pages, 'a')).toEqual([]);
    expect(expandedToReveal(pages, 'c')).toEqual(['a', 'b']);
    expect(depthOf(pages, 'c')).toBe(3);
    expect(heightBelow(pages, 'a')).toBe(2);
    expect(heightBelow(pages, 'e')).toBe(0);
  });

  it('allows new children only above the depth limit', () => {
    expect(canAddChild(pages, null)).toBe(true);
    expect(canAddChild(pages, 'b')).toBe(true);
    expect(canAddChild(pages, 'c')).toBe(false);
  });
});

describe('planMove', () => {
  it('moves up and down among siblings', () => {
    expect(planMove(pages, 'e', 'up')).toEqual({ parent: null, index: 0 });
    expect(planMove(pages, 'a', 'up')).toBeNull();
    expect(planMove(pages, 'a', 'down')).toEqual({ parent: null, index: 1 });
    expect(planMove(pages, 'e', 'down')).toBeNull();
    expect(planMove(pages, 'b', 'down')).toEqual({ parent: 'a', index: 1 });
  });

  it('indents under the previous sibling at the end, within the depth limit', () => {
    expect(planMove(pages, 'e', 'indent')).toEqual({ parent: 'a', index: 2 });
    expect(planMove(pages, 'd', 'indent')).toEqual({ parent: 'b', index: 1 });
    expect(planMove(pages, 'a', 'indent')).toBeNull();
    // z has two levels below it, so it cannot go under a top-level sibling
    const deep = [page('a', null, 0), page('z', null, 1), page('y', 'z', 0), page('x', 'y', 0)];
    expect(planMove(deep, 'z', 'indent')).toBeNull();
  });

  it('outdents next to its parent', () => {
    expect(planMove(pages, 'c', 'outdent')).toEqual({ parent: 'a', index: 1 });
    expect(planMove(pages, 'b', 'outdent')).toEqual({ parent: null, index: 1 });
    expect(planMove(pages, 'a', 'outdent')).toBeNull();
    expect(planMove(pages, 'missing', 'up')).toBeNull();
  });
});
