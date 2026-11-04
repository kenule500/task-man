import { detectDelimiter, headerKey, parseCsv } from '../../utils/importers/csv.js';
import { csvTemplate, parseGenericCsv } from '../../utils/importers/genericCsv.js';
import { ImportParseError } from '../../utils/importers/types.js';
import { genericCsv } from './fixtures.js';

describe('parseCsv (RFC 4180)', () => {
  it('reads plain rows with LF, CRLF and CR line ends', () => {
    expect(parseCsv('a,b\n1,2\r\n3,4\r5,6')).toEqual([['a', 'b'], ['1', '2'], ['3', '4'], ['5', '6']]);
  });

  it('handles quotes, doubled quotes, commas and newlines inside quotes', () => {
    const rows = parseCsv('title,notes\r\n"Hello, ""world""","line1\nline2"\r\n');
    expect(rows).toEqual([['title', 'notes'], ['Hello, "world"', 'line1\nline2']]);
  });

  it('drops a leading byte order mark and blank lines but keeps empty cells', () => {
    expect(parseCsv('﻿a,b,c\n\n1,,3\n')).toEqual([['a', 'b', 'c'], ['1', '', '3']]);
  });

  it('keeps a row whose only cell is an empty quoted string', () => {
    expect(parseCsv('a\n""\n')).toEqual([['a'], ['']]);
  });

  it('detects semicolons and tabs from the header line', () => {
    expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';');
    expect(detectDelimiter('a\tb\n1\t2')).toBe('\t');
    expect(detectDelimiter('"a;b",c\n1,2')).toBe(',');
    expect(parseCsv('a;b\n1;2')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('throws a readable error when a quote is never closed', () => {
    expect(() => parseCsv('a,b\n"oops,2')).toThrow(ImportParseError);
  });

  it('normalises header names', () => {
    expect(headerKey('Due Date')).toBe('duedate');
    expect(headerKey('assignee_email')).toBe('assigneeemail');
  });
});

describe('parseGenericCsv', () => {
  it('maps the template columns to neutral items', () => {
    const parsed = parseGenericCsv(genericCsv());
    expect(parsed.items).toHaveLength(3);
    expect(parsed.columns).toEqual(['In progress', 'To do', 'Done']);
    expect(parsed.skipped).toBe(0);
    expect(parsed.items[0]).toMatchObject({
      externalId: 'T-1',
      title: 'Design login',
      description: 'Wireframes, prototype',
      status: 'In progress',
      priority: 'high',
      type: 'story',
      labels: ['design', 'ux'],
      assigneeEmails: ['DAN@example.com'],
      dueDate: '2030-06-15',
      startDate: '2030-06-01',
      storyPoints: 5,
      parentExternalId: null,
    });
    expect(parsed.items[1]).toMatchObject({ parentExternalId: 'T-1', priority: 'medium', dueDate: '2030-06-20' });
  });

  it('accepts the downloadable template and spreadsheet style headers', () => {
    expect(parseGenericCsv(csvTemplate()).items).toHaveLength(2);
    const parsed = parseGenericCsv('Name;Due Date;State\nA task;25/12/2030;Open\n');
    expect(parsed.items[0]).toMatchObject({ title: 'A task', dueDate: '2030-12-25', status: 'Open', externalId: 'row-2' });
  });

  it('skips rows without a title and reports bad values once each', () => {
    const parsed = parseGenericCsv('title,due_date,story_points,priority\n,2030-01-01,,\nOk,not-a-date,lots,urgent-ish\nOk 2,2030-02-30,,\n');
    expect(parsed.items.map(item => item.title)).toEqual(['Ok', 'Ok 2']);
    expect(parsed.skipped).toBe(1);
    expect(parsed.items[0]).toMatchObject({ dueDate: null, storyPoints: null, priority: null, status: 'No status' });
    expect(parsed.warnings.join(' ')).toMatch(/without a title/);
    expect(parsed.warnings.join(' ')).toMatch(/2 dates could not be read/);
  });

  it('keeps repeated ids unique and cuts text to the task limits', () => {
    const long = 'x'.repeat(300);
    const parsed = parseGenericCsv(`id,title,description\nA,${long},${'d'.repeat(2500)}\nA,Second,\n`);
    expect(parsed.items.map(item => item.externalId)).toEqual(['A', 'A#2']);
    expect(parsed.items[0].title).toHaveLength(140);
    expect(parsed.items[0].description).toHaveLength(2000);
    expect(parsed.warnings.length).toBeGreaterThanOrEqual(3);
  });

  it('strips control characters', () => {
    const parsed = parseGenericCsv('title\n"Bad\u0000 title\u0007"\n');
    expect(parsed.items[0].title).toBe('Bad title');
  });

  it('explains what is missing', () => {
    expect(() => parseGenericCsv('colour,size\nred,big\n')).toThrow(/No title column/);
    expect(() => parseGenericCsv('title\n')).toThrow(/no data rows/);
    expect(() => parseGenericCsv('')).toThrow(/empty/);
  });
});
