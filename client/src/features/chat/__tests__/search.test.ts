import { formatCounter, nextIndex, segmentSnippet, snippetFor } from '../lib/search';

describe('chat search helpers', () => {
  it('AC-073: moves the selection one row and wraps at both ends', () => {
    expect(nextIndex(0, 5, 1)).toBe(1);
    expect(nextIndex(4, 5, 1)).toBe(0);
    expect(nextIndex(0, 5, -1)).toBe(4);
    expect(nextIndex(3, 5, -1)).toBe(2);
    expect(nextIndex(0, 0, 1)).toBe(0);
  });

  it('AC-073: counts the selection and marks that another page exists', () => {
    expect(formatCounter(0, 12, false)).toBe('1 of 12');
    expect(formatCounter(2, 12, false)).toBe('3 of 12');
    expect(formatCounter(2, 12, true)).toBe('3 of 12+');
    expect(formatCounter(0, 0, false)).toBe('0 of 0');
  });

  it('AC-071: clips a long body around the match', () => {
    const body = `${'a'.repeat(200)} needle ${'b'.repeat(200)}`;
    const snippet = snippetFor(body, 'needle');
    expect(snippet).toContain('needle');
    expect(snippet.startsWith('…')).toBe(true);
    expect(snippet.endsWith('…')).toBe(true);
    expect(snippet.length).toBeLessThanOrEqual(162);
  });

  it('AC-071: leaves a short body intact', () => {
    expect(snippetFor('  a   short\nmessage ', 'short')).toBe('a short message');
  });

  it('AC-071: highlights every occurrence, case-insensitively', () => {
    const segments = segmentSnippet('Deploy now, DEPLOY again', 'deploy');
    expect(segments.filter(segment => segment.match).map(segment => segment.text)).toEqual(['Deploy', 'DEPLOY']);
    expect(segments.map(segment => segment.text).join('')).toBe('Deploy now, DEPLOY again');
  });

  it('NFR-027: returns text segments, so markup stays inert text', () => {
    const segments = segmentSnippet('<b>x</b> and x', 'x');
    expect(segments.map(segment => segment.text).join('')).toBe('<b>x</b> and x');
    expect(segments.filter(segment => segment.match)).toHaveLength(2);
  });

  it('AC-071: returns the whole text when the term is blank', () => {
    expect(segmentSnippet('anything', '   ')).toEqual([{ text: 'anything', match: false }]);
  });
});
