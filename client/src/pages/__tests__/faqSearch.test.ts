import {
  FAQ_CATEGORIES, highlightSegments, normalizeText, queryTerms, searchFaq, type FaqCategory,
} from '@/content/faq';

const SAMPLE: FaqCategory[] = [
  {
    id: 'a',
    title: 'A',
    items: [
      { id: 'one', question: 'How do I plan a sprint?', answer: 'Move backlog tasks into the sprint.' },
      { id: 'two', question: 'What is the backlog?', answer: 'Tasks without a sprint. Plan work from here.' },
      { id: 'three', question: 'Café résumé', answer: 'Accents are ignored.' },
    ],
  },
];

describe('FAQ content', () => {
  it('has about thirty entries with unique ids and the required topics', () => {
    const items = FAQ_CATEGORIES.flatMap((category) => category.items);
    expect(items.length).toBeGreaterThanOrEqual(28);
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
    expect(FAQ_CATEGORIES.map((category) => category.title)).toEqual([
      'Getting started', 'Tasks & views', 'Projects & sprints', 'Team & roles',
      'Notifications & account', 'Mobile & offline', 'Keyboard shortcuts', 'Security & privacy',
    ]);
  });
});

describe('searchFaq', () => {
  it('returns everything in source order for an empty query', () => {
    expect(searchFaq('  ', SAMPLE).map((result) => result.id)).toEqual(['one', 'two', 'three']);
  });

  it('is case and diacritic insensitive', () => {
    expect(searchFaq('CAFE RESUME', SAMPLE).map((result) => result.id)).toEqual(['three']);
    expect(searchFaq('café', SAMPLE).map((result) => result.id)).toEqual(['three']);
  });

  it('requires every word to match', () => {
    expect(searchFaq('sprint backlog', SAMPLE).map((result) => result.id).sort()).toEqual(['one', 'two']);
    expect(searchFaq('sprint unicorn', SAMPLE)).toEqual([]);
  });

  it('ranks question matches above answer matches', () => {
    // "backlog" is in the question of "two" but only in the answer of "one"
    expect(searchFaq('backlog', SAMPLE).map((result) => result.id)).toEqual(['two', 'one']);
  });

  it('finds the real content', () => {
    expect(searchFaq('story points')[0].id).toBe('story-points');
    expect(searchFaq('ctrl k').length).toBeGreaterThan(0);
  });
});

describe('highlightSegments', () => {
  it('flags matched words, ignoring case and accents', () => {
    expect(highlightSegments('Plan the Sprint', queryTerms('sprint'))).toEqual([
      { text: 'Plan the ', match: false },
      { text: 'Sprint', match: true },
    ]);
    expect(highlightSegments('Café time', queryTerms('cafe'))).toEqual([
      { text: 'Café', match: true },
      { text: ' time', match: false },
    ]);
  });

  it('returns the text untouched without terms', () => {
    expect(highlightSegments('Hello', [])).toEqual([{ text: 'Hello', match: false }]);
    expect(normalizeText('  Ünï  Code ')).toBe('uni code');
  });
});
