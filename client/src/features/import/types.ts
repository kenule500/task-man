import type { TaskStatus, TaskType } from '@/features/tasks/types';

export const IMPORT_SOURCES = ['csv', 'trello', 'jira'] as const;
export type ImportSource = (typeof IMPORT_SOURCES)[number];

/** Mirrors the server limits (server/src/utils/importers/types.ts). */
export const MAX_IMPORT_ITEMS = 2000;
export const MAX_IMPORT_BYTES = 2_000_000;

export interface PreviewStatus {
  name: string;
  count: number;
  suggested: TaskStatus;
}

export interface PreviewType {
  name: string;
  count: number;
  suggested: TaskType;
}

export interface PreviewPerson {
  /** Email, or the name / username the source uses for the person. */
  identifier: string;
  count: number;
  isMember: boolean;
  memberId: string | null;
  memberName: string | null;
}

export interface PreviewItem {
  externalId: string;
  title: string;
  status: string;
  type: string;
  priority: 'low' | 'medium' | 'high' | null;
  labels: string[];
  assignees: string[];
  dueDate: string | null;
  startDate: string | null;
  storyPoints: number | null;
  parentExternalId: string | null;
  epicExternalId: string | null;
  sprint: string | null;
  comments: number;
  checklist: number;
}

export interface ImportPreview {
  source: ImportSource;
  total: number;
  limit: number;
  skipped: number;
  columns: string[];
  statuses: PreviewStatus[];
  types: PreviewType[];
  people: PreviewPerson[];
  labels: { name: string; count: number }[];
  sprints: { name: string; count: number }[];
  withParent: number;
  withEpic: number;
  comments: number;
  members: { id: string; name: string }[];
  stages: { key: string; name: string; group: TaskStatus }[];
  items: PreviewItem[];
  warnings: string[];
}

export type ProjectTarget = { existing: string } | { name: string; key: string };

/** What the user chose on the mapping step. */
export interface MappingDraft {
  mode: 'existing' | 'new';
  /** Name of the chosen existing project. */
  existingProject: string;
  newName: string;
  newKey: string;
  /** raw status -> stage key */
  statusMap: Record<string, string>;
  /** raw person -> member id, or null for unassigned */
  userMap: Record<string, string | null>;
  /** raw type -> task type */
  typeMap: Record<string, TaskType>;
  createSprints: boolean;
  includeComments: boolean;
}

/** Body of POST /import/commit `mapping`. */
export interface CommitMapping {
  project: string | { name: string; key?: string };
  statusMap: Record<string, string>;
  userMap: Record<string, string | null>;
  typeMap: Record<string, TaskType>;
  createSprints: boolean;
  includeComments: boolean;
}

export interface ImportResult {
  created: number;
  skipped: number;
  sprintsCreated: number;
  warnings: string[];
  project: { _id: string; name: string; key: string };
}
