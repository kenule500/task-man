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

export interface Task {
  _id: string;
  /** Sequential number in the workspace; shown as a key like "WEB-12" (see lib/taskKey.ts). */
  number?: number;
  title: string;
  description?: string;
  /** Project name ('' = none); projects are listed by the projects API. */
  project?: string;
  status: TaskStatus;
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
  /** Short tags; deterministic color per label (see lib/labels.ts). */
  labels?: string[];
  /** Populated in responses; send ids (`TaskInput.assignees`) when writing. */
  assignees?: TaskUser[];
  comments?: TaskComment[];
  attachments?: TaskAttachment[];
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
}

/** Max labels per task (mirrors the server). */
export const MAX_LABELS = 10;
export const MAX_LABEL_LENGTH = 30;
