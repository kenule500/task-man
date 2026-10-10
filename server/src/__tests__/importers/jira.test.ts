import { parseJiraCsv } from '../../utils/importers/jira.js';
import { jiraCsv } from './fixtures.js';

describe('parseJiraCsv', () => {
  const parsed = parseJiraCsv(jiraCsv());
  const byKey = (key: string) => parsed.items.find(item => item.externalId === key);

  it('reads every issue with its raw status and type', () => {
    expect(parsed.items.map(item => item.externalId)).toEqual(['PAY-1', 'PAY-2', 'PAY-3', 'PAY-4']);
    expect(parsed.columns).toEqual(['To Do', 'In Progress', 'Done']);
    expect(byKey('PAY-4')).toMatchObject({ type: 'Bug', status: 'Done', priority: 'high', storyPoints: 3, dueDate: '2024-03-18' });
  });

  it('merges repeated Labels and Sprint columns (the last sprint wins)', () => {
    expect(byKey('PAY-2')).toMatchObject({ labels: ['frontend', 'payments'], sprintName: 'Sprint 2', assigneeEmails: ['Dan Developer'] });
  });

  it('keeps multi-line quoted descriptions', () => {
    expect(byKey('PAY-2')?.description).toBe('Line one\nline two with "quotes"');
  });

  it('turns a parent that is an epic into an epic link and any other parent into a parent', () => {
    expect(byKey('PAY-2')).toMatchObject({ epicExternalId: 'PAY-1', parentExternalId: null });
    expect(byKey('PAY-3')).toMatchObject({ parentExternalId: 'PAY-2', epicExternalId: null });
  });

  it('reads comments, dropping opaque account ids', () => {
    expect(byKey('PAY-2')?.comments).toEqual([
      { authorEmail: '', text: 'Looks good; ship it', createdAt: '2024-03-14T14:15:00.000Z' },
    ]);
  });

  it('warns about parents that are missing and refuses other files', () => {
    const csv = 'Summary,Issue key,Issue id,Issue Type,Status,Parent\nA,X-1,1,Task,To Do,999\n';
    const result = parseJiraCsv(csv);
    expect(result.items[0].parentExternalId).toBeNull();
    expect(result.warnings.join(' ')).toMatch(/parent that is not in the file/);
    expect(() => parseJiraCsv('name,size\nx,1\n')).toThrow(/Jira CSV/);
  });
});
