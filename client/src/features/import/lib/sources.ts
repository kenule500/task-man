import { MAX_IMPORT_BYTES, type ImportSource } from '../types';

export interface SourceInfo {
  id: ImportSource;
  label: string;
  /** What the person uploads, in a few words. */
  fileKind: string;
  /** File extensions the picker offers. */
  extensions: string[];
  summary: string;
  /** How to get the file out of the other tool. */
  steps: string[];
  /** What carries over. */
  carries: string;
}

export const SOURCES: SourceInfo[] = [
  {
    id: 'trello',
    label: 'Trello',
    fileKind: 'JSON export of a board',
    extensions: ['.json'],
    summary: 'A board with its lists, cards, labels, checklists and comments.',
    steps: [
      'Open the board in Trello.',
      'Choose Menu, then Print, export and share, then Export as JSON.',
      'Save the file and upload it here. Archived cards are left out.',
    ],
    carries: 'Lists become statuses. Cards, descriptions, due dates, labels, members, checklists and comments carry over.',
  },
  {
    id: 'jira',
    label: 'Jira',
    fileKind: 'CSV export of issues',
    extensions: ['.csv'],
    summary: 'Issues with their type, status, assignee, sprint, story points and parent.',
    steps: [
      'In Jira, open Filters and search for the issues you want (or open a project backlog).',
      'Choose Export, then Export Excel CSV (all fields).',
      'Upload the downloaded file here. Up to 2,000 issues fit in one import, so split bigger projects.',
    ],
    carries: 'Epics, sub-tasks, sprints, labels, priority, story points, due dates and comments carry over.',
  },
  {
    id: 'csv',
    label: 'CSV file',
    fileKind: 'CSV spreadsheet',
    extensions: ['.csv', '.tsv', '.txt'],
    summary: 'Any spreadsheet saved as CSV, one task per row.',
    steps: [
      'Download the template and fill in one row per task, or use your own file with a title column.',
      'Save it as CSV (comma or semicolon separated, UTF-8).',
      'Upload it here. Dates use YYYY-MM-DD.',
    ],
    carries: 'Columns are found by name: title, description, status, priority, type, labels, assignee_email, due_date, start_date, story_points, parent_id and id.',
  },
];

export const sourceInfo = (source: ImportSource): SourceInfo => SOURCES.find(item => item.id === source) ?? SOURCES[2];

export const formatBytes = (bytes: number): string => {
  if (bytes < 1000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${(bytes / 1000).toFixed(bytes < 10_000 ? 1 : 0)} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
};

/** Why a file cannot be used, or null when it can. */
export const checkImportFile = (file: { name: string; size: number }, source: ImportSource): string | null => {
  if (file.size === 0) return 'This file is empty.';
  if (file.size > MAX_IMPORT_BYTES) return `This file is ${formatBytes(file.size)}. The limit is 2 MB; split it into smaller files.`;
  const extensions = sourceInfo(source).extensions;
  const name = file.name.toLowerCase();
  if (!extensions.some(extension => name.endsWith(extension))) {
    return `Choose a ${extensions.join(' or ')} file for ${sourceInfo(source).label}.`;
  }
  return null;
};

/** The text of a file; falls back to FileReader where Blob.text is missing (older browsers, jsdom). */
export const readFileText = (file: Blob): Promise<string> => {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('The file could not be read'));
    reader.readAsText(file);
  });
};
