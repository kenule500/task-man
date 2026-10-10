// RFC 4180 CSV reader: quoted fields, doubled quotes, newlines inside quotes, CRLF / LF / CR rows, a leading BOM.
import { ImportParseError } from './types.js';

export type CsvDelimiter = ',' | ';' | '\t';

/** Picks the separator the header line uses most (Excel in many locales writes semicolons). */
export const detectDelimiter = (text: string): CsvDelimiter => {
  const firstLine = text.replace(/^﻿/, '').split(/\r\n|\n|\r/, 1)[0] ?? '';
  let best: CsvDelimiter = ',';
  let bestCount = 0;
  for (const candidate of [',', ';', '\t'] as const) {
    let count = 0;
    let quoted = false;
    for (const char of firstLine) {
      if (char === '"') quoted = !quoted;
      else if (char === candidate && !quoted) count++;
    }
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
};

/** Rows of cells. Rows with no content at all are dropped. Throws on a quote that is never closed. */
export const parseCsv = (input: string, delimiter: CsvDelimiter = detectDelimiter(input)): string[][] => {
  const text = input.charCodeAt(0) === 0xFEFF ? input.slice(1) : input;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let fieldWasQuoted = false;
  let rowHasQuoted = false;

  const endField = () => {
    row.push(field);
    field = '';
    fieldWasQuoted = false;
  };
  const endRow = () => {
    endField();
    if (row.length > 1 || row[0] !== '' || rowHasQuoted) rows.push(row);
    row = [];
    rowHasQuoted = false;
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"' && field === '' && !fieldWasQuoted) {
      quoted = true;
      fieldWasQuoted = true;
      rowHasQuoted = true;
    } else if (char === delimiter) {
      endField();
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      endRow();
    } else {
      field += char;
    }
  }
  if (quoted) throw new ImportParseError('The file has a quoted value that is never closed');
  if (field !== '' || row.length > 0 || fieldWasQuoted) endRow();
  return rows;
};

/** Lower-case header without spaces and punctuation, so "Due Date", "due_date" and "due-date" all match. */
export const headerKey = (header: string): string => header.toLowerCase().replace(/[^a-z0-9]/g, '');
