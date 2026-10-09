import type { Task, TaskInput, TaskPriority, TaskStatus } from '../types';
import { dateKeyOf, todayKey } from './date';

export interface TaskFormValues {
  title: string;
  description: string;
  project: string;
  status: TaskStatus;
  priority: TaskPriority;
  /** `YYYY-MM-DD` or empty */
  startDate: string;
  /** `YYYY-MM-DD` */
  deadline: string;
  dependencies: string[];
  labels: string[];
  /** Assignee user ids */
  assignees: string[];
}

export type TaskFormErrors = Partial<Record<'title' | 'deadline' | 'startDate', string>>;

/** Initial form values from an existing task, or blank ones merged with `defaults`. */
export const toFormValues = (task?: Task | null, defaults: Partial<TaskFormValues> = {}): TaskFormValues => ({
  title: task?.title ?? '',
  description: task?.description ?? '',
  project: task?.project ?? '',
  status: task?.status ?? 'pending',
  priority: task?.priority ?? 'medium',
  startDate: task?.startDate ? dateKeyOf(task.startDate) : '',
  deadline: task ? dateKeyOf(task.deadline) : todayKey(),
  dependencies: task?.dependencies ?? [],
  labels: task?.labels ?? [],
  assignees: task?.assignees?.map(user => user._id) ?? [],
  ...defaults,
});

/** Same rules as the API, checked before submitting. */
export const validateTaskForm = (values: TaskFormValues): TaskFormErrors => {
  const errors: TaskFormErrors = {};
  if (!values.title.trim()) errors.title = 'Give the task a title.';
  if (!values.deadline) errors.deadline = 'Pick a due date.';
  if (values.startDate && values.deadline && values.startDate > values.deadline) {
    errors.startDate = 'Start date must be on or before the due date.';
  }
  return errors;
};

export const toTaskInput = (values: TaskFormValues): TaskInput => ({
  title: values.title.trim(),
  description: values.description.trim(),
  project: values.project.trim(),
  status: values.status,
  priority: values.priority,
  startDate: values.startDate || null,
  deadline: values.deadline,
  dependencies: values.dependencies,
  labels: values.labels,
  assignees: values.assignees,
});
