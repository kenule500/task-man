import { filterMembers, findMentionQuery, insertMention, splitMentions } from '../lib/mentions';
import { ANA, BEN, SAM } from './fixtures';

const members = [ANA, BEN, SAM, { _id: 'u-ann', name: 'Anna Berg', avatarUrl: '' }];

describe('findMentionQuery', () => {
  it('finds the mention being typed at the caret', () => {
    expect(findMentionQuery('hello @an', 9)).toEqual({ start: 6, query: 'an' });
    expect(findMentionQuery('@', 1)).toEqual({ start: 0, query: '' });
    expect(findMentionQuery('hi @Ana Lo', 10)).toEqual({ start: 3, query: 'Ana Lo' });
  });

  it('ignores an @ inside a word, after the caret or followed by a finished mention', () => {
    expect(findMentionQuery('mail me at x@ana', 16)).toBeNull();
    expect(findMentionQuery('hello @an and more', 6)).toBeNull();
    expect(findMentionQuery('@Ana Lopez said hi', 18)).toBeNull();
    expect(findMentionQuery('no mention here', 15)).toBeNull();
  });
});

describe('filterMembers', () => {
  it('puts names that start with the query first, ignoring case and accents', () => {
    expect(filterMembers(members, 'an').map(member => member.name)).toEqual(['Ana Lopez', 'Anna Berg']);
    expect(filterMembers(members, 'LOP').map(member => member.name)).toEqual(['Ana Lopez']);
    expect(filterMembers([{ _id: 'x', name: 'Éloïse Martin', avatarUrl: '' }], 'eloi')).toHaveLength(1);
  });

  it('matches any word of the name, then contained text, and skips the excluded member', () => {
    expect(filterMembers(members, 'carter').map(member => member.name)).toEqual(['Ben Carter']);
    expect(filterMembers(members, 'ivera').map(member => member.name)).toEqual(['Sam Rivera']);
    expect(filterMembers(members, '', ANA._id).map(member => member._id)).not.toContain(ANA._id);
    expect(filterMembers(members, 'zzz')).toEqual([]);
  });
});

describe('insertMention', () => {
  it('replaces the query with the full name and a trailing space', () => {
    const result = insertMention('hello @an and more', { start: 6, query: 'an' }, 9, 'Ana Lopez');
    expect(result.text).toBe('hello @Ana Lopez  and more');
    expect(result.caret).toBe('hello @Ana Lopez '.length);
  });
});

describe('splitMentions', () => {
  it('marks full names of known members and keeps everything else as text', () => {
    expect(splitMentions('hi @Ana Lopez, meet @Sam Rivera!', members)).toEqual([
      { text: 'hi ', mention: false },
      { text: '@Ana Lopez', mention: true },
      { text: ', meet ', mention: false },
      { text: '@Sam Rivera', mention: true },
      { text: '!', mention: false },
    ]);
  });

  it('does not mark unknown names, partial names or e-mail addresses, and never produces markup', () => {
    expect(splitMentions('@Nobody Here', members)).toEqual([{ text: '@Nobody Here', mention: false }]);
    expect(splitMentions('mail ana@Ana Lopez.com', members).some(segment => segment.mention)).toBe(false);
    const script = '<script>alert(1)</script> @Ana Lopez';
    expect(splitMentions(script, members).map(segment => segment.text).join('')).toBe(script);
  });

  it('prefers the longer name when two members share a prefix', () => {
    const result = splitMentions('@Anna Berg and @Ana Lopez', members);
    expect(result.filter(segment => segment.mention).map(segment => segment.text)).toEqual(['@Anna Berg', '@Ana Lopez']);
  });
});
