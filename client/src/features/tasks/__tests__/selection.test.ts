import {
  idsBetween, pruneSelection, selectRange, selectionLabel, selectionState, toggleAll, toggleId,
} from '../lib/selection';

const ids = ['a', 'b', 'c', 'd', 'e'];

describe('toggleId', () => {
  it('adds a missing id and removes a present one without mutating the input', () => {
    const empty = new Set<string>();
    const one = toggleId(empty, 'a');
    expect([...one]).toEqual(['a']);
    expect(empty.size).toBe(0);
    expect([...toggleId(one, 'a')]).toEqual([]);
  });
});

describe('selectionState', () => {
  it('is none, some or all of the visible rows', () => {
    expect(selectionState(ids, new Set())).toBe('none');
    expect(selectionState(ids, new Set(['a']))).toBe('some');
    expect(selectionState(ids, new Set(ids))).toBe('all');
  });

  it('ignores selected ids that are not visible and handles an empty list', () => {
    expect(selectionState(ids, new Set(['zzz']))).toBe('none');
    expect(selectionState([], new Set(['a']))).toBe('none');
  });
});

describe('toggleAll', () => {
  it('selects every visible row when some or none are selected', () => {
    expect([...toggleAll(ids, new Set(['b']))].sort()).toEqual(ids);
    expect([...toggleAll(ids, new Set())].sort()).toEqual(ids);
  });

  it('clears the visible rows when all are selected, keeping other selections', () => {
    expect([...toggleAll(['a', 'b'], new Set(['a', 'b', 'x']))]).toEqual(['x']);
  });
});

describe('idsBetween', () => {
  it('returns the inclusive range in either direction', () => {
    expect(idsBetween(ids, 'b', 'd')).toEqual(['b', 'c', 'd']);
    expect(idsBetween(ids, 'd', 'b')).toEqual(['b', 'c', 'd']);
  });

  it('falls back to the target when there is no usable anchor and is empty for an unknown target', () => {
    expect(idsBetween(ids, null, 'c')).toEqual(['c']);
    expect(idsBetween(ids, 'gone', 'c')).toEqual(['c']);
    expect(idsBetween(ids, 'a', 'gone')).toEqual([]);
  });
});

describe('selectRange', () => {
  it('adds the range when selecting and keeps the rest', () => {
    expect([...selectRange(ids, new Set(['a']), 'b', 'd', true)].sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('removes the range when deselecting', () => {
    expect([...selectRange(ids, new Set(ids), 'b', 'd', false)].sort()).toEqual(['a', 'e']);
  });
});

describe('pruneSelection', () => {
  it('drops ids that are no longer visible', () => {
    expect([...pruneSelection(new Set(['a', 'x']), ids)]).toEqual(['a']);
  });

  it('returns the same set when nothing changed', () => {
    const selected = new Set(['a']);
    expect(pruneSelection(selected, ids)).toBe(selected);
  });
});

describe('selectionLabel', () => {
  it('counts the selection', () => {
    expect(selectionLabel(3)).toBe('3 selected');
    expect(selectionLabel(0)).toBe('');
  });
});
