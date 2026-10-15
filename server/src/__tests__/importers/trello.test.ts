import { parseImport } from '../../utils/importers/index.js';
import { parseTrelloJson } from '../../utils/importers/trello.js';
import { trelloBoard, trelloJson } from './fixtures.js';

describe('parseTrelloJson', () => {
  const parsed = parseTrelloJson(trelloJson());

  it('turns open cards into items in board order and lists into columns', () => {
    expect(parsed.items.map(item => item.title)).toEqual(['Write copy', 'Design landing page', 'Ship it']);
    expect(parsed.columns).toEqual(['To Do', 'Doing', 'Done']);
    expect(parsed.items.map(item => item.status)).toEqual(['To Do', 'Doing', 'Done']);
  });

  it('skips archived cards and cards in archived lists, and says so', () => {
    expect(parsed.skipped).toBe(2);
    expect(parsed.warnings.join(' ')).toMatch(/2 archived cards/);
  });

  it('carries description, dates, labels, members, checklist and comments', () => {
    const card = parsed.items.find(item => item.externalId === 'c1');
    expect(card).toMatchObject({
      description: 'Hero, pricing and footer.',
      dueDate: '2030-06-15',
      startDate: '2030-06-01',
      labels: ['design', 'red'],
      assigneeEmails: ['Dan Developer'],
      priority: null,
      type: '',
    });
    expect(card?.checklist).toEqual([{ text: 'Mobile layout', done: true }, { text: 'Dark mode', done: false }]);
    expect(card?.comments).toEqual([{ authorEmail: 'Grace Hopper', text: 'Use the new brand colours.', createdAt: '2030-05-20T10:30:00.000Z' }]);
  });

  it('uses an email when the export has one', () => {
    const board = { ...trelloBoard, members: [{ id: 'm1', fullName: 'Dan', username: 'dan', email: 'dan@example.com' }] };
    const result = parseTrelloJson(JSON.stringify(board));
    expect(result.items.find(item => item.externalId === 'c1')?.assigneeEmails).toEqual(['dan@example.com']);
  });

  it('rejects files that are not a Trello export', () => {
    expect(() => parseTrelloJson('not json')).toThrow(/not valid JSON/);
    expect(() => parseTrelloJson('{"hello":1}')).toThrow(/Trello board export/);
    expect(() => parseImport('trello', '  ')).toThrow(/empty/);
  });
});
