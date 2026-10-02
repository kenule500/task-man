import type { TaskFormValues } from '../lib/taskForm';
import type { Task, TaskPatch } from '../types';

/** Contract shared by every task view, so views are interchangeable. */
export interface TaskViewProps {
  /** Tasks to display (already filtered by the page). */
  tasks: Task[];
  onUpdate: (id: string, patch: TaskPatch) => Promise<Task | null>;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  /** Opens the create form, optionally prefilled (day, column...). */
  onCreate: (defaults?: Partial<TaskFormValues>) => void;
}
