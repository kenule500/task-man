import { activeMention, applyMention, mentionedUserIds, segmentMentions } from '../lib/mentions';

describe('chat mentions', () => {
  it('AC-014: finds the mention at the caret but not an email address', () => {
    expect(activeMention('hello @ad', 9)).toEqual({ start: 6, end: 9, term: 'ad' });
    expect(activeMention('hello @ad', 7)).toEqual({ start: 6, end: 7, term: '' });
    expect(activeMention('(@ad', 4)).toEqual({ start: 1, end: 4, term: 'ad' });

    expect(activeMention('me@example.com', 14)).toBeNull();
    expect(activeMention('hello @ad more', 11)).toBeNull();
    expect(activeMention('no mention', 5)).toBeNull();
    expect(activeMention('x', 5)).toBeNull();
  });

  it('AC-014: inserts the chosen name with a trailing space and moves the caret', () => {
    const match = activeMention('hi @ad', 6);
    expect(match).not.toBeNull();
    if (!match) return;

    expect(applyMention('hi @ad there', match, 'Ada Lovelace')).toEqual({
      text: 'hi @AdaLovelace  there',
      caret: 16,
    });
  });

  it('AC-052: highlights a mention only when it matches a known member', () => {
    const segments = segmentMentions('hi @AdaLovelace and @nobody', ['Ada Lovelace']);

    expect(segments.filter(segment => segment.isMention).map(segment => segment.text)).toEqual(['@AdaLovelace']);
    expect(segments.find(segment => segment.text === '@nobody')?.isMention).toBe(false);
    expect(segments.map(segment => segment.text).join('')).toBe('hi @AdaLovelace and @nobody');
  });

  it('AC-014: resolves mentioned user ids case-insensitively, respecting the word boundary', () => {
    const candidates = [{ _id: 'u1', name: 'Ada Lovelace' }, { _id: 'u2', name: 'Grace' }];

    expect(mentionedUserIds('thanks @AdaLovelace!', candidates)).toEqual(['u1']);
    expect(mentionedUserIds('hi @Grace and @grace', candidates)).toEqual(['u2']);
    expect(mentionedUserIds('hi @AdaLovelaceTwo', candidates)).toEqual([]);
    expect(mentionedUserIds('no mentions here', candidates)).toEqual([]);
  });
});
