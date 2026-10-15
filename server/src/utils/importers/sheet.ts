// Helpers for importers that read a table (generic CSV, Jira CSV): headers can repeat, so a field is a list of columns.
import { headerKey, parseCsv } from './csv.js';
import { ImportParseError } from './types.js';

export interface Sheet {
  headers: string[];
  keys: string[];
  rows: string[][];
}

/** Header row plus data rows. Throws a readable error when the file has no header or no data. */
export const readSheet = (text: string): Sheet => {
  const table = parseCsv(text);
  if (table.length === 0) throw new ImportParseError('The file is empty');
  const [headers, ...rows] = table;
  if (headers.every(header => header.trim() === '')) throw new ImportParseError('The first row must contain the column names');
  if (rows.length === 0) throw new ImportParseError('The file has a header row but no data rows');
  return { headers, keys: headers.map(headerKey), rows };
};

/** Indices of the columns whose header matches one of `aliases`, earlier aliases first. */
export const columnsOf = (sheet: Sheet, ...aliases: string[]): number[] => {
  const found: number[] = [];
  for (const alias of aliases) {
    sheet.keys.forEach((key, index) => {
      if (key === alias && !found.includes(index)) found.push(index);
    });
  }
  return found;
};

/** First non-empty cell among `columns`. */
export const firstCell = (row: string[], columns: number[]): string => {
  for (const index of columns) {
    const value = row[index]?.trim();
    if (value) return value;
  }
  return '';
};

/** Every non-empty cell among `columns`. */
export const allCells = (row: string[], columns: number[]): string[] =>
  columns.map(index => row[index]?.trim() ?? '').filter(Boolean);

/** Collects warnings that repeat per row into one line each ("4 rows have no title"). */
export class WarningBag {
  private readonly counts = new Map<string, { n: number; text: (n: number) => string }>();

  add(key: string, text: (n: number) => string): void {
    const entry = this.counts.get(key);
    if (entry) entry.n++;
    else this.counts.set(key, { n: 1, text });
  }

  /** A warning that is not about a count. */
  note(message: string): void {
    this.counts.set(`note:${message}`, { n: 1, text: () => message });
  }

  toArray(): string[] {
    return [...this.counts.values()].map(entry => entry.text(entry.n));
  }
}

export const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** Keeps the first occurrence of each external id; later duplicates get "#2", "#3"... so links stay unambiguous. */
export const uniqueExternalId = (wanted: string, seen: Set<string>, warnings: WarningBag): string => {
  let id = wanted;
  let suffix = 1;
  while (seen.has(id)) {
    suffix++;
    id = `${wanted}#${suffix}`;
  }
  if (id !== wanted) warnings.add('duplicate-id', n => `${plural(n, 'row')} repeat an id already used; links to that id point to its first row`);
  seen.add(id);
  return id;
};
