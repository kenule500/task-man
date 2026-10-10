export type TaskStatus = 'pending' | 'in-progress' | 'completed';
export type TaskPriority = 'low' | 'medium' | 'high';
/** Scrum work item type; an 'epic' is a container that groups items of its project across sprints. */
export type TaskType = 'story' | 'task' | 'bug' | 'spike' | 'epic';
export type TaskSort = 'createdAt' | 'deadline' | 'priority';
export type TaskView = 'list' | 'board' | 'calendar' | 'timeline';

/** Person shown on tasks (assignee, comment author). */
export interface TaskUser {
  _id: string;
  name: string;
  avatarUrl?: string;
}

export interface TaskComment {
  _id: string;
  author: TaskUser;
  text: string;
  createdAt: string;
}

export interface TaskAttachment {
  _id: string;
  originalName: string;
  mimetype: string;
  size: number;
  /** User id (or the populated user). */
  uploadedBy?: string | TaskUser;
  uploadedAt?: string;
}

/** One item of a task's checklist. */
export interface ChecklistItem {
  _id: string;
  text: string;
  done: boolean;
}

/** Checklist item as sent to the API. */
export interface ChecklistInput {
  _id?: string;
  text: string;
  done?: boolean;
}

export type RecurrenceUnit = 'day' | 'week' | 'month';
export type RecurrenceBasis = 'due' | 'completion';

/** Repeat rule: completing the task creates the next occurrence. */
export interface TaskRecurrence {
  /** 1 to 365 */
  every: number;
  unit: RecurrenceUnit;
  /** 'due': next dates follow the old due date; 'completion': they follow the day it was completed. */
  basis: RecurrenceBasis;
}

/** Stored link types; the other task of a link stores the inverse. */
export type TaskRelationType = 'relates' | 'duplicates' | 'duplicated_by' | 'clones' | 'cloned_by';
/** Every type the link API accepts: the stored ones plus the two that map onto dependencies. */
export type TaskLinkType = TaskRelationType | 'blocks' | 'blocked_by';

export interface TaskRelation {
  type: TaskRelationType;
  /** Id of the other task. */
  task: string;
}

export interface Task {
  _id: string;
  /** Sequential number in the workspace; shown as a key like "WEB-12" (see lib/taskKey.ts). */
  number?: number;
  title: string;
  description?: string;
  /** Project name ('' = none); projects are listed by the projects API. */
  project?: string;
  status: TaskStatus;
  /** Key of the workflow stage (a column of the board); its group is `status`. Unset or stale: the first stage of the status group. */
  stage?: string;
  priority: TaskPriority;
  /** Defaults to 'task' on the server. */
  type?: TaskType;
  /** Story points estimate; null = not estimated. */
  storyPoints?: number | null;
  /** Sprint id; null/unset = product backlog. */
  sprint?: string | null;
  /** Parent task id when this is a subtask. */
  parent?: string | null;
  /** Id of the epic (a task of type 'epic') this item belongs to; subtasks inherit their parent's. */
  epic?: string | null;
  /** ISO date string. Optional: tasks without a start are shown as one-day bars. */
  startDate?: string | null;
  /** ISO date string. */
  deadline: string;
  position: number;
  dependencies: string[];
  /** Typed links to other tasks (relates, duplicates, clones); "blocks" / "blocked by" are `dependencies`. */
  relations?: TaskRelation[];
  /** Short tags; deterministic color per label (see lib/labels.ts). */
  labels?: string[];
  /** Populated in responses; send ids (`TaskInput.assignees`) when writing. */
  assignees?: TaskUser[];
  /** Items to tick off inside the task, in display order. */
  checklist?: ChecklistItem[];
  /** User ids of the people following the task. */
  watchers?: string[];
  /** Repeat rule of a top-level task; null/unset = does not repeat. */
  recurrence?: TaskRecurrence | null;
  comments?: TaskComment[];
  attachments?: TaskAttachment[];
  /** Pull requests, commits and branches that mention the task key (GitHub integration). */
  links?: TaskLink[];
  owner?: string;
  workspace?: string;
  completedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** Payload accepted by the API when creating a task. Dates are `YYYY-MM-DD` keys. */
export interface TaskInput {
  title: string;
  description?: string;
  project?: string;
  status?: TaskStatus;
  /** Workflow stage key; wins over `status` (the API sets the status to the stage's group). */
  stage?: string;
  priority?: TaskPriority;
  type?: TaskType;
  storyPoints?: number | null;
  sprint?: string | null;
  parent?: string | null;
  epic?: string | null;
  startDate?: string | null;
  deadline: string;
  position?: number;
  dependencies?: string[];
  labels?: string[];
  /** User ids. */
  assignees?: string[];
  /** Whole checklist; items keep their `_id` (new ones may omit it or bring a fresh 24-hex id). */
  checklist?: ChecklistInput[];
  recurrence?: TaskRecurrence | null;
}

export type TaskPatch = Partial<TaskInput>;

export interface TaskFilters {
  search: string;
  status: TaskStatus | 'all';
  priority: TaskPriority | 'all';
  sort: TaskSort;
  /** Only tasks assigned to the current user. */
  assignedToMe?: boolean;
  /** Only tasks carrying this label (`'all'` or unset = any). */
  label?: string;
  /** Only this work item type (`'all'` or unset = any). */
  type?: TaskType | 'all';
  /** Only items of this epic id (`'all'` or unset = any, `'none'` = items outside any epic). */
  epic?: string;
  /** Only tasks of this project, by the name tasks store (`'all'` or unset = any). */
  project?: string;
  /** Only this sprint: an id, `'active'` (the project's running sprint) or `'backlog'` (no sprint); `'all'` or unset = any. */
  sprint?: string;
}

/** Max labels per task (mirrors the server). */
export const MAX_LABELS = 10;
export const MAX_LABEL_LENGTH = 30;

/** A GitHub pull request, commit or branch linked to a task by the webhook. */
export interface TaskLink {
  provider: 'github';
  kind: 'pull_request' | 'commit' | 'branch';
  /** https://github.com/... */
  url: string;
  title: string;
  number?: number;
  state?: 'open' | 'merged' | 'closed';
  /** owner/name */
  repo: string;
  sha?: string;
  author?: string;
  updatedAt: string;
}
