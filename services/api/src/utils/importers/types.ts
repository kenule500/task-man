// Neutral shape every importer produces, whatever the source tool looked like.
export const IMPORT_SOURCES = ['csv', 'trello', 'jira'] as const;
export type ImportSource = (typeof IMPORT_SOURCES)[number];

export const MAX_IMPORT_ITEMS = 2000;
// Characters of file content accepted per request (about 2 MB of text)
export const MAX_IMPORT_CONTENT = 2_000_000;

// Same caps as the task model; texts are cut to these so a long export never fails validation
export const IMPORT_LIMITS = {
  title: 140,
  description: 2000,
  label: 40,
  labels: 10,
  comment: 2000,
  comments: 50,
  checklistText: 200,
  checklistItems: 50,
  assignees: 50,
  status: 80,
  type: 60,
  person: 120,
  sprint: 60,
  externalId: 120,
} as const;

export type ImportPriority= 'low' | 'medium' | 'high';

export interface ImportComment {
  // Email, or the username / display name when the source has no email
  authorEmail: string;
  text: string;
  // ISO date-time, null when unknown
  createdAt: string | null;
}

export interface ImportChecklistItem {
  text: string;
  done: boolean;
}

export interface ImportItem {
  // Id inside the source (Jira key, Trello card id, CSV id column); unique inside one import
  externalId: string;
  title: string;
  description: string;
  // Raw column / list / status name exactly as the source calls it
  status: string;
  priority: ImportPriority | null;
  // Raw issue type ('' when the source has none)
  type: string;
  labels: string[];
  // People as the source identifies them: an email, or a username / display name when there is none
  assigneeEmails: string[];
  // Calendar days, YYYY-MM-DD
  dueDate: string | null;
  startDate: string | null;
  storyPoints: number | null;
  parentExternalId: string | null;
  epicExternalId: string | null;
  sprintName: string | null;
  checklist: ImportChecklistItem[];
  comments: ImportComment[];
}

export interface ParsedImport {
  items: ImportItem[];
  // Distinct statuses / lists in the order the source shows them
  columns: string[];
  warnings: string[];
  // Rows or cards the parser had to leave out (no title, archived...)
  skipped: number;
}

export class ImportParseError extends Error {}
