import { CSV_BOM, TASK_CSV_HEADER, csvCell, taskCsvRows, tasksCsvFilename, tasksToCsv, toCsv } from '../lib/csv';
import { makeTask } from './fixtures';

describe('csvCell', () => {
  it('quotes every cell and doubles inner quotes', () => {
    expect(csvCell('plain')).toBe('"plain"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('a,b\nc')).toBe('"a,b\nc"');
    expect(csvCell(5)).toBe('"5"');
    expect(csvCell(null)).toBe('""');
    expect(csvCell(undefined)).toBe('""');
  });

  it('neutralises spreadsheet formulas with a leading apostrophe', () => {
    for (const text of ['=SUM(A1)', '+1', '-2', '@cmd', '\tx']) expect(csvCell(text)).toBe(`"'${text}"`);
    expect(csvCell('a=b')).toBe('"a=b"');
  });
});

describe('toCsv', () => {
  it('starts with a BOM and separates rows with CRLF', () => {
    const csv = toCsv([['a', 'b'], ['c', 'd']]);
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    expect(csv.slice(1)).toBe('"a","b"\r\n"c","d"\r\n');
  });

  it('is only the BOM for no rows', () => {
    expect(toCsv([])).toBe(CSV_BOM);
  });
});

describe('taskCsvRows', () => {
  const parent = makeTask({ _id: 'p', number: 1, title: 'Parent', project: 'Website' });
  const task = makeTask({
    _id: 't',
    number: 2,
    title: '=HYPERLINK("x")',
    type: 'bug',
    status: 'in-progress',
    priority: 'high',
    storyPoints: 5,
    project: 'Website',
    sprint: 's1',
    parent: 'p',
    assignees: [{ _id: 'u1', name: 'Ada' }, { _id: 'u2', name: 'Grace' }],
    labels: ['ui', 'api'],
    startDate: '2026-10-01T00:00:00.000Z',
    deadline: '2026-10-09T00:00:00.000Z',
  });
  const lookups = {
    projectKeyOf: (item: { project?: string }) => (item.project === 'Website' ? 'WEB' : undefined),
    sprintName: (id: string) => (id === 's1' ? 'Sprint 1' : undefined),
  };

  it('has the documented header and one row per task', () => {
    const rows = taskCsvRows([task], [parent, task], lookups);
    expect(rows[0]).toEqual([...TASK_CSV_HEADER]);
    expect(rows[0]).toHaveLength(14);
    expect(rows).toHaveLength(2);
  });

  it('writes labels instead of codes, names, dates and the parent key', () => {
    const [, row] = taskCsvRows([task], [parent, task], lookups);
    expect(row).toEqual([
      'WEB-2', '=HYPERLINK("x")', 'Bug', 'In Progress', 'High', '5', 'Website', 'Sprint 1',
      'Ada; Grace', 'ui; api', '2026-10-01', '2026-10-09', '', 'WEB-1',
    ]);
  });

  it('leaves optional columns blank and defaults the type to Task', () => {
    const [, row] = taskCsvRows([makeTask({ sprint: 'unknown', completedAt: '2026-10-05T12:00:00.000Z' })]);
    expect(row[0]).toBe('');
    expect(row[2]).toBe('Task');
    expect(row[5]).toBe('');
    expect(row[7]).toBe('');
    expect(row[12]).toMatch(/^2026-10-0[45]$/);
    expect(row[13]).toBe('');
  });
});

describe('tasksToCsv and tasksCsvFilename', () => {
  it('neutralises the formula in the title cell of the document', () => {
    const csv = tasksToCsv([makeTask({ number: 3, title: '=1+1' })]);
    expect(csv).toContain('"\'=1+1"');
    expect(csv).toContain('"TM-3"');
    expect(csv.split('\r\n')[0]).toContain('"Key","Title"');
  });

  it('names the file after the workspace and the day', () => {
    expect(tasksCsvFilename('acme', new Date(2026, 9, 9))).toBe('tasks-acme-2026-10-09.csv');
    expect(tasksCsvFilename('')).toMatch(/^tasks-workspace-\d{4}-\d{2}-\d{2}\.csv$/);
  });
});
