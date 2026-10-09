export type TaskStatus = 'pending' | 'in-progress' | 'completed';
export type TaskPriority = 'low' | 'medium' | 'high';
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
  title: string;
  description?: string;
  /** Free-text label used to group tasks on the Projects page. */
  project?: string;
  status: TaskStatus;
  priority: TaskPriority;
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
}

/** Max labels per task (mirrors the server). */
export const MAX_LABELS = 10;
export const MAX_LABEL_LENGTH = 30;
