import { PRIORITY_META, STATUS_META, TASK_TYPE_META } from '../constants';
import type { Task } from '../types';
import { dateKeyOf, toDateKey } from './date';
import { taskKey } from './taskKey';
import { valueText } from '@/features/fields/lib/fields';
import type { CustomField } from '@/features/fields/types';

/** Lets Excel read the file as UTF-8. */
export const CSV_BOM = '﻿';

export const TASK_CSV_HEADER = [
  'Key', 'Title', 'Type', 'Status', 'Priority', 'Story points', 'Project', 'Sprint',
  'Assignees', 'Labels', 'Start', 'Due', 'Completed', 'Parent key',
] as const;

/**
 * One RFC 4180 field: always quoted, quotes doubled. Text starting with = + - @ (or a tab/CR) gets a
 * leading apostrophe so spreadsheets do not run it as a formula.
 */
export const csvCell = (value: unknown): string => {
  let text = value === undefined || value === null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};

/** Rows joined with CRLF and prefixed with a BOM. */
export const toCsv = (rows: unknown[][]): string =>
  CSV_BOM + rows.map(row => row.map(csvCell).join(',')).join('\r\n') + (rows.length ? '\r\n' : '');

export interface TaskCsvLookups {
  /** Project key for a task (from the project directory); falls back to the default prefix. */
  projectKeyOf?: (task: Task) => string | undefined;
  /** Sprint name for a sprint id; blank when unknown. */
  sprintName?: (sprintId: string) => string | undefined;
  /** Custom fields to add as columns after the built-in ones (archived fields are left out). */
  customFields?: readonly CustomField[];
  /** Name of a user id, for person fields. */
  userName?: (userId: string) => string | undefined;
}

const localDay = (iso: string | undefined): string => {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : toDateKey(date);
};

/** Spreadsheet rows (header first) for `tasks`. `allTasks` resolves each parent's key. */
export const taskCsvRows = (tasks: Task[], allTasks: Task[] = tasks, lookups: TaskCsvLookups = {}): string[][] => {
  const { projectKeyOf, sprintName, userName } = lookups;
  const customFields = (lookups.customFields ?? []).filter(field => !field.archived);
  const keyOf = (task: Task) => taskKey(task, projectKeyOf?.(task));
  const byId = new Map(allTasks.map(task => [task._id, task]));

  const rows = tasks.map(task => {
    const parent = task.parent ? byId.get(task.parent) : undefined;
    return [
      keyOf(task),
      task.title,
      TASK_TYPE_META[task.type ?? 'task'].label,
      STATUS_META[task.status].label,
      PRIORITY_META[task.priority].label,
      typeof task.storyPoints === 'number' ? String(task.storyPoints) : '',
      task.project ?? '',
      task.sprint ? sprintName?.(task.sprint) ?? '' : '',
      (task.assignees ?? []).map(user => user.name).join('; '),
      (task.labels ?? []).join('; '),
      task.startDate ? dateKeyOf(task.startDate) : '',
      task.deadline ? dateKeyOf(task.deadline) : '',
      localDay(task.completedAt),
      parent ? keyOf(parent) : '',
      ...customFields.map(field => valueText(field, task.custom?.[field.key], { userName })),
    ];
  });
  return [[...TASK_CSV_HEADER, ...customFields.map(field => field.name)], ...rows];
};

/** The whole CSV document for a list of tasks. */
export const tasksToCsv = (tasks: Task[], allTasks: Task[] = tasks, lookups: TaskCsvLookups = {}): string =>
  toCsv(taskCsvRows(tasks, allTasks, lookups));

/** "tasks-acme-2026-10-09.csv" */
export const tasksCsvFilename = (workspaceSlug: string, date: Date = new Date()): string =>
  `tasks-${workspaceSlug || 'workspace'}-${toDateKey(date)}.csv`;

/** Saves `content` as a file through a temporary download link. */
export const downloadCsv = (filename: string, content: string): void => {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoke after the browser has started the download
  setTimeout(() => URL.revokeObjectURL(url), 0);
};
