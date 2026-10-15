import type { ActionType, ConditionField, ConditionOp, TriggerType } from '../types';

export interface Option<T extends string = string> {
  value: T;
  label: string;
}

export const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  'in-progress': 'In progress',
  completed: 'Completed',
};
export const PRIORITY_LABELS: Record<string, string> = { high: 'High', medium: 'Medium', low: 'Low' };
export const TYPE_LABELS: Record<string, string> = { story: 'Story', task: 'Task', bug: 'Bug', spike: 'Spike', epic: 'Epic' };

const toOptions = (labels: Record<string, string>): Option[] =>
  Object.entries(labels).map(([value, label]) => ({ value, label }));

export const STATUS_CHOICES = toOptions(STATUS_LABELS);
export const PRIORITY_CHOICES = toOptions(PRIORITY_LABELS);
export const TYPE_CHOICES = toOptions(TYPE_LABELS);

/** What kind of value a trigger, condition or action takes. */
export type ValueKind = 'status' | 'priority' | 'type' | 'label' | 'member' | 'comment' | null;

export const TRIGGER_OPTIONS: (Option<TriggerType> & { valueKind: ValueKind })[] = [
  { value: 'task.created', label: 'A task is created', valueKind: null },
  { value: 'task.status_changed', label: 'A task changes status', valueKind: 'status' },
  { value: 'task.assigned', label: 'Someone is assigned to a task', valueKind: null },
  { value: 'task.priority_changed', label: 'A task changes priority', valueKind: 'priority' },
  { value: 'task.commented', label: 'A comment is added', valueKind: null },
  { value: 'task.labeled', label: 'A label is added to a task', valueKind: 'label' },
];

export const ANY_VALUE = 'any';

export const CONDITION_OPTIONS: Record<ConditionField, { label: string; valueKind: ValueKind; ops: Option<ConditionOp>[] }> = {
  type: { label: 'Type', valueKind: 'type', ops: [{ value: 'is', label: 'is' }, { value: 'is_not', label: 'is not' }] },
  priority: { label: 'Priority', valueKind: 'priority', ops: [{ value: 'is', label: 'is' }, { value: 'is_not', label: 'is not' }] },
  status: { label: 'Status', valueKind: 'status', ops: [{ value: 'is', label: 'is' }, { value: 'is_not', label: 'is not' }] },
  label: { label: 'Label', valueKind: 'label', ops: [{ value: 'has', label: 'has' }, { value: 'has_not', label: 'does not have' }] },
  assignee: { label: 'Assignee', valueKind: null, ops: [{ value: 'is_empty', label: 'is empty' }, { value: 'is_not_empty', label: 'is not empty' }] },
  sprint: { label: 'Sprint', valueKind: null, ops: [{ value: 'is_set', label: 'is set' }, { value: 'is_empty', label: 'is empty' }] },
};

export const ACTION_OPTIONS: (Option<ActionType> & { valueKind: ValueKind })[] = [
  { value: 'set_status', label: 'Set status', valueKind: 'status' },
  { value: 'set_priority', label: 'Set priority', valueKind: 'priority' },
  { value: 'add_label', label: 'Add label', valueKind: 'label' },
  { value: 'remove_label', label: 'Remove label', valueKind: 'label' },
  { value: 'assign_to', label: 'Assign to a member', valueKind: 'member' },
  { value: 'assign_to_actor', label: 'Assign to the person who triggered it', valueKind: null },
  { value: 'unassign_all', label: 'Remove all assignees', valueKind: null },
  { value: 'add_comment', label: 'Add a comment', valueKind: 'comment' },
  { value: 'move_to_backlog', label: 'Move to the backlog', valueKind: null },
];

export const triggerValueKind = (type: TriggerType): ValueKind =>
  TRIGGER_OPTIONS.find(option => option.value === type)?.valueKind ?? null;

export const actionValueKind = (type: ActionType): ValueKind =>
  ACTION_OPTIONS.find(option => option.value === type)?.valueKind ?? null;

/** The choices of a status, priority or type value. */
export const choicesFor = (kind: ValueKind): Option[] =>
  kind === 'status' ? STATUS_CHOICES : kind === 'priority' ? PRIORITY_CHOICES : kind === 'type' ? TYPE_CHOICES : [];
