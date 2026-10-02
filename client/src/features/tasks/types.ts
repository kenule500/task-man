export type TaskStatus = 'pending' | 'in-progress' | 'completed';
export type TaskPriority = 'low' | 'medium' | 'high';
export type TaskSort = 'createdAt' | 'deadline' | 'priority';
export type TaskView = 'list' | 'board' | 'calendar' | 'timeline';

export interface Task {
  _id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  /** ISO date string. Optional: tasks without a start are shown as one-day bars. */
  startDate?: string | null;
  /** ISO date string. */
  deadline: string;
  position: number;
  dependencies: string[];
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
  status?: TaskStatus;
  priority?: TaskPriority;
  startDate?: string | null;
  deadline: string;
  position?: number;
  dependencies?: string[];
}

export type TaskPatch = Partial<TaskInput>;

export interface TaskFilters {
  search: string;
  status: TaskStatus | 'all';
  sort: TaskSort;
}
