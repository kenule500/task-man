import { parseGenericCsv } from './genericCsv.js';
import { parseJiraCsv } from './jira.js';
import { parseTrelloJson } from './trello.js';
import { ImportParseError, type ImportSource, type ParsedImport } from './types.js';

export * from './types.js';
export { csvTemplate, CSV_TEMPLATE_HEADERS } from './genericCsv.js';
export { parseCsv } from './csv.js';
export { suggestStatus, suggestType } from './text.js';

/** Runs the importer for `source` over the file text; throws ImportParseError with a readable message. */
export const parseImport = (source: ImportSource, content: string): ParsedImport => {
  const text = content.replace(/^﻿/, '');
  if (!text.trim()) throw new ImportParseError('The file is empty');
  switch (source) {
    case 'trello': return parseTrelloJson(text);
    case 'jira': return parseJiraCsv(text);
    case 'csv': return parseGenericCsv(text);
  }
};
