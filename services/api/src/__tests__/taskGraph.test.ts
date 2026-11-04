import { normalizeIds, wouldCreateCycle, DependencyGraph } from '../utils/taskGraph.js';

describe('wouldCreateCycle', () => {
  // design -> research, build -> design, ship -> build
  const graph: DependencyGraph = new Map([
    ['research', []],
    ['design', ['research']],
    ['build', ['design']],
    ['ship', ['build']],
  ]);

  it('allows a dependency on an unrelated upstream task', () => {
    expect(wouldCreateCycle('ship', ['research'], graph)).toBe(false);
  });

  it('detects a direct cycle', () => {
    expect(wouldCreateCycle('research', ['design'], graph)).toBe(true);
  });

  it('detects a transitive cycle', () => {
    expect(wouldCreateCycle('research', ['ship'], graph)).toBe(true);
  });

  it('detects a self dependency', () => {
    expect(wouldCreateCycle('build', ['build'], graph)).toBe(true);
  });

  it('handles an empty dependency list', () => {
    expect(wouldCreateCycle('build', [], graph)).toBe(false);
  });

  it('terminates on graphs that already contain a cycle', () => {
    const cyclic: DependencyGraph = new Map([['a', ['b']], ['b', ['a']]]);
    expect(wouldCreateCycle('c', ['a'], cyclic)).toBe(false);
  });
});

describe('normalizeIds', () => {
  it('removes duplicates and blanks while keeping order', () => {
    expect(normalizeIds(['b', 'a', 'b', ' ', 'c'])).toEqual(['b', 'a', 'c']);
  });

  it('returns an empty list for non-array input', () => {
    expect(normalizeIds(undefined)).toEqual([]);
    expect(normalizeIds('abc')).toEqual([]);
  });
});
