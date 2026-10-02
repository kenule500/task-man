export type TaskStatus = 'pending' | 'in-progress' | 'completed';
export type TaskPriority = 'low' | 'medium' | 'high';

export interface TaskMember {
  _id: string;
  name: string;
  email: string;
  avatarUrl?: string;
}

export interface TaskDependency {
  _id: string;
  title: string;
  status: TaskStatus;
}

export interface TaskAttachment {
  _id: string;
  filename: string;
  originalName: string;
  url: string;
  mimetype: string;
  size: number;
  uploadedAt: string;
}

export interface TaskCoverImage {
  url: string;
  filename: string;
}

export interface TaskComment {
  _id: string;
  author: TaskMember;
  text: string;
  createdAt: string;
}

export interface Task {
  _id: string;
  workspace: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  labels: string[];
  startDate?: string;
  deadline?: string;
  order: number;
  assignees: TaskMember[];
  createdBy: string;
  dependencies: TaskDependency[];
  coverImage?: TaskCoverImage;
  attachments: TaskAttachment[];
  comments: TaskComment[];
  createdAt: string;
  updatedAt: string;
}

export interface TaskInput {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  labels?: string[];
  startDate?: string | null;
  deadline?: string | null;
  assignees?: string[];
  dependencies?: string[];
}

export const STATUS_COLUMNS: { key: TaskStatus; label: string }[] = [
  { key: 'pending', label: 'To Do' },
  { key: 'in-progress', label: 'In Progress' },
  { key: 'completed', label: 'Completed' },
];

export const PRIORITY_ORDER: Record<TaskPriority, number> = { high: 1, medium: 2, low: 3 };

export const SUGGESTED_LABELS = [
  'Website', 'Marketing', 'Management', 'System', 'HR', 'Product', 'Design', 'Bug', 'Feature', 'Other',
];

export const formatStatusLabel = (status: TaskStatus): string => {
  if (status === 'in-progress') return 'In Progress';
  if (status === 'completed') return 'Completed';
  return 'To Do';
};

// Dependency status is embedded on the task as a snapshot from whenever it
// was last fetched — if the dependency itself changes later, that snapshot
// goes stale. Looking the current status up in the live task list (rather
// than trusting dep.status) is what makes a task actually unlock.
const liveDependencyStatus = (dep: TaskDependency, allTasks: Task[]): TaskStatus =>
  allTasks.find(t => t._id === dep._id)?.status ?? dep.status;

export const isTaskBlocked = (task: Task, allTasks: Task[]): boolean =>
  task.dependencies.some(dep => liveDependencyStatus(dep, allTasks) !== 'completed');

export const blockingDependencies = (task: Task, allTasks: Task[]): TaskDependency[] =>
  task.dependencies.filter(dep => liveDependencyStatus(dep, allTasks) !== 'completed');

export type UrgencyColor = 'green' | 'amber' | 'red';

export interface TaskUrgency {
  percent: number;
  color: UrgencyColor;
  label: string;
}

// Visualizes how much of a task's time window has elapsed, for the
// "time remaining" bar on task cards. Returns null when there's no due
// date to measure against.
export const getTaskUrgency = (task: Task): TaskUrgency | null => {
  if (!task.deadline) return null;

  const end = new Date(task.deadline).getTime();
  const start = new Date(task.startDate || task.createdAt).getTime();
  const now = Date.now();

  if (task.status === 'completed') {
    const completedOn = new Date(task.updatedAt).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
    return { percent: 100, color: 'green', label: `Completed: ${completedOn}` };
  }

  if (now >= end) {
    const overdueDays = Math.max(1, Math.ceil((now - end) / (1000 * 60 * 60 * 24)));
    return { percent: 100, color: 'red', label: `Overdue by ${overdueDays} day${overdueDays > 1 ? 's' : ''}` };
  }

  const totalMs = Math.max(end - start, 1);
  const percent = Math.min(100, Math.max(0, ((now - start) / totalMs) * 100));
  const remainingDays = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
  const color: UrgencyColor = percent >= 85 ? 'red' : percent >= 60 ? 'amber' : 'green';
  const label = remainingDays <= 0 ? 'Due Today' : `${remainingDays} Day${remainingDays > 1 ? 's' : ''} Remaining`;

  return { percent, color, label };
};
