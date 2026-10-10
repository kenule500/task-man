import { activeMention, filterMentionCandidates, insertMention, splitMentions } from '../lib/mentions';

const members = [
  { _id: 'u1', name: 'Ada Lovelace' },
  { _id: 'u2', name: 'Grace Hopper' },
  { _id: 'u3', name: 'Alan Turing' },
];

describe('splitMentions', () => {
  it('returns one plain segment when there is nothing to highlight', () => {
    expect(splitMentions('no mentions', ['Ada Lovelace'])).toEqual([{ text: 'no mentions', mention: false }]);
    expect(splitMentions('mail ada@example.com', ['Ada Lovelace'])).toEqual([{ text: 'mail ada@example.com', mention: false }]);
  });

  it('highlights full names and first names of known people', () => {
    expect(splitMentions('Hi @Ada Lovelace and @grace, ok?', ['Ada Lovelace', 'Grace Hopper'])).toEqual([
      { text: 'Hi ', mention: false },
      { text: '@Ada Lovelace', mention: true },
      { text: ' and ', mention: false },
      { text: '@grace', mention: true },
      { text: ', ok?', mention: false },
    ]);
  });

  it('does not highlight a longer word that merely starts with a name', () => {
    expect(splitMentions('@Adam is here', ['Ada Lovelace'])).toEqual([{ text: '@Adam is here', mention: false }]);
  });

  it('highlights any @word when no names are known', () => {
    expect(splitMentions('ping @sam now')).toEqual([
      { text: 'ping ', mention: false },
      { text: '@sam', mention: true },
      { text: ' now', mention: false },
    ]);
  });
});

describe('activeMention', () => {
  it('finds the query being typed before the caret', () => {
    expect(activeMention('Hello @', 7)).toEqual({ start: 6, query: '' });
    expect(activeMention('Hello @Ad', 9)).toEqual({ start: 6, query: 'Ad' });
    expect(activeMention('@Ada Lo', 7)).toEqual({ start: 0, query: 'Ada Lo' });
  });

  it('ignores an @ inside a word, after a finished name or on another line', () => {
    expect(activeMention('mail me at ada@exa', 18)).toBeNull();
    expect(activeMention('@Ada Lovelace please', 20)).toBeNull();
    expect(activeMention('@Ada\nhello', 10)).toBeNull();
    expect(activeMention('no at sign', 5)).toBeNull();
  });
});

describe('filterMentionCandidates', () => {
  it('matches the start of the name or of any word in it, ignoring case', () => {
    expect(filterMentionCandidates(members, 'ad').map(m => m.name)).toEqual(['Ada Lovelace']);
    expect(filterMentionCandidates(members, 'HOP').map(m => m.name)).toEqual(['Grace Hopper']);
    expect(filterMentionCandidates(members, 'al').map(m => m.name)).toEqual(['Alan Turing']);
    expect(filterMentionCandidates(members, 'zzz')).toEqual([]);
  });

  it('lists everyone for an empty query, capped', () => {
    expect(filterMentionCandidates(members, '')).toHaveLength(3);
    expect(filterMentionCandidates(members, '', 2)).toHaveLength(2);
  });
});

describe('insertMention', () => {
  it('replaces the typed query with the full name and moves the caret after it', () => {
    const text = 'Hi @gr and more';
    const mention = activeMention(text, 6);
    expect(mention).not.toBeNull();
    expect(insertMention(text, mention!, 6, 'Grace Hopper')).toEqual({
      text: 'Hi @Grace Hopper and more',
      caret: 17,
    });
  });
});
