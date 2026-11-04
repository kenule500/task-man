import {
  canMoveUnder, depthOf, escapeRegex, extractTaskKeys, slugify, snippetAround, subtreeHeight, uniqueSlug, type PageNode,
} from '../utils/pages.js';

const tree = (...edges: [string, string | null][]): Map<string, PageNode> =>
  new Map(edges.map(([_id, parent]) => [_id, { _id, parent }]));

describe('slugify and uniqueSlug', () => {
  it('makes URL-friendly slugs', () => {
    expect(slugify('Release plan: Q3 (draft)')).toBe('release-plan-q3-draft');
    expect(slugify('Café déjà vu')).toBe('cafe-deja-vu');
    expect(slugify('***')).toBe('page');
    expect(slugify('a'.repeat(200)).length).toBeLessThanOrEqual(80);
  });

  it('adds a counter until the slug is free', () => {
    const taken = new Set(['notes', 'notes-2']);
    expect(uniqueSlug('notes', slug => taken.has(slug))).toBe('notes-3');
    expect(uniqueSlug('plan', slug => taken.has(slug))).toBe('plan');
  });
});

describe('extractTaskKeys', () => {
  it('finds distinct keys in order and ignores lookalikes', () => {
    const keys = extractTaskKeys('See WEB-12 and API-7, again WEB-12. Not web-3, X-1 or ABCDEFGH-4.');
    expect(keys.map(item => item.key)).toEqual(['WEB-12', 'API-7']);
    expect(keys[0]).toEqual({ key: 'WEB-12', prefix: 'WEB', number: 12 });
  });

  it('caps the number of mentions', () => {
    const text = Array.from({ length: 80 }, (_, i) => `TK-${i + 1}`).join(' ');
    expect(extractTaskKeys(text)).toHaveLength(50);
  });
});

describe('page tree rules', () => {
  const nodes = tree(['a', null], ['b', 'a'], ['c', 'b'], ['d', null], ['e', 'd']);

  it('measures depth and subtree height', () => {
    expect(depthOf('a', nodes)).toBe(1);
    expect(depthOf('c', nodes)).toBe(3);
    expect(subtreeHeight('a', nodes)).toBe(2);
    expect(subtreeHeight('c', nodes)).toBe(0);
  });

  it('limits nesting to three levels', () => {
    expect(canMoveUnder('d', 'a', nodes)).toBe(true); // d + e under a: a(1) d(2) e(3)
    expect(canMoveUnder('d', 'b', nodes)).toBe(false); // would reach level 4
    expect(canMoveUnder('e', 'b', nodes)).toBe(true);
    expect(canMoveUnder('e', 'c', nodes)).toBe(false);
    expect(canMoveUnder('c', null, nodes)).toBe(true);
  });

  it('refuses moving a page under itself or a descendant', () => {
    expect(canMoveUnder('a', 'a', nodes)).toBe(false);
    expect(canMoveUnder('a', 'c', nodes)).toBe(false);
  });

  it('does not loop on a corrupt cycle', () => {
    const cyclic = tree(['x', 'y'], ['y', 'x']);
    expect(depthOf('x', cyclic)).toBe(2);
    expect(subtreeHeight('x', cyclic)).toBeGreaterThanOrEqual(0);
  });
});

describe('search helpers', () => {
  it('escapes regular expression characters', () => {
    expect(new RegExp(escapeRegex('a.b(c)+[d]')).test('a.b(c)+[d]')).toBe(true);
    expect(new RegExp(escapeRegex('a.b')).test('axb')).toBe(false);
  });

  it('cuts a snippet around the first match', () => {
    const text = `${'word '.repeat(40)}needle ${'tail '.repeat(40)}`;
    const snippet = snippetAround(text, 'NEEDLE', 20);
    expect(snippet).toContain('needle');
    expect(snippet.startsWith('…')).toBe(true);
    expect(snippet.endsWith('…')).toBe(true);
    expect(snippetAround('', 'x')).toBe('');
    expect(snippetAround('plain text', 'zzz')).toBe('plain text');
  });
});
