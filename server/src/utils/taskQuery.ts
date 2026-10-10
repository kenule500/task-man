import mongoose from 'mongoose';
import { TASK_STATUSES, TaskStatus } from '../models/taskModel.js';

export const TASK_SORTS = ['createdAt', 'deadline', 'priority', 'position'] as const;
export type TaskSort = (typeof TASK_SORTS)[number];

export interface TaskListQuery {
  status?: TaskStatus;
  search?: string;
  project?: string;
  // 'me' (the requesting user) or a validated user id
  assignee?: string;
  label?: string;
  // Epic id, or 'none' for items outside any epic
  epic?: string;
  sort: TaskSort;
  from?: Date;
  to?: Date;
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const parseDate = (value: unknown): Date | undefined => {
  if (typeof value !== 'string' || !value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

/** Task number in a search like "WEB-12", "#12" or "12"; null when the search is not a key. */
export const taskNumberFromSearch = (search: string): number | null => {
  const match = /^(?:[a-z0-9]{2,6}-|#)?(\d{1,9})$/i.exec(search.trim());
  return match ? Number(match[1]) : null;
};

/** Trims labels, drops blanks and case-insensitive duplicates while preserving order. */
export const normalizeLabels = (labels: unknown): string[] => {
  if (!Array.isArray(labels)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of labels) {
    if (typeof raw !== 'string') continue;
    const label = raw.trim().replace(/\s+/g, ' ');
    const key = label.toLowerCase();
    if (!label || seen.has(key)) continue;
    seen.add(key);
    result.push(label);
  }
  return result;
};

/** Turns untrusted query-string values into a typed, safe list query. */
export const parseTaskListQuery = (query: Record<string, unknown>): TaskListQuery => {
  const status = TASK_STATUSES.includes(query.status as TaskStatus)
    ? (query.status as TaskStatus)
    : undefined;
  const sort = TASK_SORTS.includes(query.sort as TaskSort) ? (query.sort as TaskSort) : 'createdAt';
  const search = typeof query.search === 'string' ? query.search.trim().slice(0, 100) : '';

  const project = typeof query.project === 'string' ? query.project.trim().slice(0, 60) : '';

  const label = typeof query.label === 'string' ? query.label.trim().slice(0, 40) : '';
  const assigneeRaw = typeof query.assignee === 'string' ? query.assignee.trim() : '';
  const assignee =
    assigneeRaw === 'me' || /^[a-f\d]{24}$/i.test(assigneeRaw) ? assigneeRaw : undefined;

  const epicRaw = typeof query.epic === 'string' ? query.epic.trim() : '';
  const epic = epicRaw === 'none' || /^[a-f\d]{24}$/i.test(epicRaw) ? epicRaw : undefined;

  return {
    status,
    search: search || undefined,
    project: project || undefined,
    assignee,
    label: label || undefined,
    epic,
    sort,
    from: parseDate(query.from),
    to: parseDate(query.to),
  };
};

/** Builds the MongoDB filter for a workspace's task list. */
export const buildTaskFilter = (workspaceId: unknown, query: TaskListQuery, currentUserId?: unknown) => {
  const filter: Record<string, unknown> = { workspace: workspaceId };

  if (query.status) filter.status = query.status;
  if (query.project) filter.project = query.project;

  if (query.label) filter.labels = query.label;

  // Aggregation pipelines do not cast, so build a real ObjectId here
  if (query.epic) filter.epic = query.epic === 'none' ? null : new mongoose.Types.ObjectId(query.epic);

  if (query.assignee) {
    const id = query.assignee === 'me' ? currentUserId : query.assignee;
    // Aggregation pipelines do not cast, so build a real ObjectId here
    if (id && mongoose.isValidObjectId(String(id))) {
      filter.assignees = new mongoose.Types.ObjectId(String(id));
    } else {
      // "me" without a user, never widen the result set
      filter.assignees = { $in: [] };
    }
  }

  if (query.search) {
    const pattern = new RegExp(escapeRegex(query.search), 'i');
    const matches: Record<string, unknown>[] = [{ title: pattern }, { description: pattern }];
    // "WEB-12", "#12" or "12" also find the task with that number
    const number = taskNumberFromSearch(query.search);
    if (number !== null) matches.push({ number });
    filter.$or = matches;
  }

  if (query.from || query.to) {
    filter.deadline = {
      ...(query.from && { $gte: query.from }),
      ...(query.to && { $lte: query.to }),
    };
  }

  return filter;
};

/** Ordering used by the aggregation pipeline for each sort option. */
export const buildTaskSort = (sort: TaskSort): Record<string, 1 | -1> => {
  switch (sort) {
    case 'deadline':
      return { deadline: 1, priorityRank: 1 };
    case 'priority':
      return { priorityRank: 1, deadline: 1 };
    case 'position':
      return { position: 1, deadline: 1 };
    default:
      return { createdAt: -1 };
  }
};

export const PRIORITY_RANK_EXPRESSION = {
  $switch: {
    branches: [
      { case: { $eq: ['$priority', 'high'] }, then: 1 },
      { case: { $eq: ['$priority', 'medium'] }, then: 2 },
    ],
    default: 3,
  },
};
