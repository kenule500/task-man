// Public surface of the tasks feature. Import from '@/features/tasks'.
export * from './types';
export * from './constants';
export { tasksApi, getApiErrorMessage } from './api';
export { useTasks } from './hooks/useTasks';
export * from './lib/date';
export * from './lib/filters';
export * from './lib/schedule';
export * from './lib/dependencies';
export * from './lib/taskForm';

export { StatusBadge, StatusDot, PriorityIndicator, DueDate } from './components/TaskBadges';
export { OptionSelect, StatusSelect, PrioritySelect } from './components/TaskSelects';
export { InlineText, InlineDate } from './components/InlineEdit';
export { default as TaskActionsMenu } from './components/TaskActionsMenu';
export { default as TaskFormDialog } from './components/TaskFormDialog';
export { default as ConfirmDeleteDialog } from './components/ConfirmDeleteDialog';
export { default as EmptyState } from './components/EmptyState';
export { default as TaskToolbar } from './components/TaskToolbar';
export { default as ViewSwitcher } from './components/ViewSwitcher';

export { default as ListView } from './views/ListView';
export { default as BoardView } from './views/BoardView';
export { default as CalendarView } from './views/CalendarView';
export { default as TimelineView } from './views/TimelineView';
export type { TaskViewProps } from './views/types';
