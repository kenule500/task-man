import { TASK_STATUSES, TaskStatus } from '../models/taskModel.js';

export const TASK_SORTS = ['createdAt', 'deadline', 'priority', 'position'] as const;
export type TaskSort = (typeof TASK_SORTS)[number];

export interface TaskListQuery {
  status?: TaskStatus;
  search?: string;
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

/** Turns untrusted query-string values into a typed, safe list query. */
export const parseTaskListQuery = (query: Record<string, unknown>): TaskListQuery => {
  const status = TASK_STATUSES.includes(query.status as TaskStatus)
    ? (query.status as TaskStatus)
    : undefined;
  const sort = TASK_SORTS.includes(query.sort as TaskSort) ? (query.sort as TaskSort) : 'createdAt';
  const search = typeof query.search === 'string' ? query.search.trim().slice(0, 100) : '';

  return {
    status,
    search: search || undefined,
    sort,
    from: parseDate(query.from),
    to: parseDate(query.to),
  };
};

/** Builds the MongoDB filter for a workspace's task list. */
export const buildTaskFilter = (workspaceId: unknown, query: TaskListQuery) => {
  const filter: Record<string, unknown> = { workspace: workspaceId };

  if (query.status) filter.status = query.status;

  if (query.search) {
    const pattern = new RegExp(escapeRegex(query.search), 'i');
    filter.$or = [{ title: pattern }, { description: pattern }];
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
