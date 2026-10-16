import i18n from '@/i18n';
import type { ActionType, ConditionField, ConditionOp, TriggerType } from '../types';

export interface Option<T extends string = string> {
  value: T;
  label: string;
}

// Labels are read when needed, so they follow the interface language.
export const STATUS_LABELS: Record<string, string> = {
  get pending() { return i18n.t('tasks:status.pending'); },
  get 'in-progress'() { return i18n.t('admin:automations.statusInProgress'); },
  get completed() { return i18n.t('tasks:status.completed'); },
};
export const PRIORITY_LABELS: Record<string, string> = {
  get high() { return i18n.t('tasks:priority.high'); },
  get medium() { return i18n.t('tasks:priority.medium'); },
  get low() { return i18n.t('tasks:priority.low'); },
};
export const TYPE_LABELS: Record<string, string> = {
  get story() { return i18n.t('tasks:type.story'); },
  get task() { return i18n.t('tasks:type.task'); },
  get bug() { return i18n.t('tasks:type.bug'); },
  get spike() { return i18n.t('tasks:type.spike'); },
  get epic() { return i18n.t('tasks:type.epic'); },
};

const toOptions = (labels: Record<string, string>): Option[] =>
  Object.keys(labels).map(value => ({ value, get label() { return labels[value]; } }));

export const STATUS_CHOICES = toOptions(STATUS_LABELS);
export const PRIORITY_CHOICES = toOptions(PRIORITY_LABELS);
export const TYPE_CHOICES = toOptions(TYPE_LABELS);

/** What kind of value a trigger, condition or action takes. */
export type ValueKind = 'status' | 'priority' | 'type' | 'label' | 'member' | 'comment' | null;

export const TRIGGER_OPTIONS: (Option<TriggerType> & { valueKind: ValueKind })[] = [
  { value: 'task.created', get label() { return i18n.t('admin:automations.triggers.task.created'); }, valueKind: null },
  { value: 'task.status_changed', get label() { return i18n.t('admin:automations.triggers.task.status_changed'); }, valueKind: 'status' },
  { value: 'task.assigned', get label() { return i18n.t('admin:automations.triggers.task.assigned'); }, valueKind: null },
  { value: 'task.priority_changed', get label() { return i18n.t('admin:automations.triggers.task.priority_changed'); }, valueKind: 'priority' },
  { value: 'task.commented', get label() { return i18n.t('admin:automations.triggers.task.commented'); }, valueKind: null },
  { value: 'task.labeled', get label() { return i18n.t('admin:automations.triggers.task.labeled'); }, valueKind: 'label' },
];

export const ANY_VALUE = 'any';

export const CONDITION_OPTIONS: Record<ConditionField, { label: string; valueKind: ValueKind; ops: Option<ConditionOp>[] }> = {
  type: { get label() { return i18n.t('admin:automations.conditionFields.type'); }, valueKind: 'type', ops: [{ value: 'is', get label() { return i18n.t('admin:automations.ops.is'); } }, { value: 'is_not', get label() { return i18n.t('admin:automations.ops.is_not'); } }] },
  priority: { get label() { return i18n.t('admin:automations.conditionFields.priority'); }, valueKind: 'priority', ops: [{ value: 'is', get label() { return i18n.t('admin:automations.ops.is'); } }, { value: 'is_not', get label() { return i18n.t('admin:automations.ops.is_not'); } }] },
  status: { get label() { return i18n.t('admin:automations.conditionFields.status'); }, valueKind: 'status', ops: [{ value: 'is', get label() { return i18n.t('admin:automations.ops.is'); } }, { value: 'is_not', get label() { return i18n.t('admin:automations.ops.is_not'); } }] },
  label: { get label() { return i18n.t('admin:automations.conditionFields.label'); }, valueKind: 'label', ops: [{ value: 'has', get label() { return i18n.t('admin:automations.ops.has'); } }, { value: 'has_not', get label() { return i18n.t('admin:automations.ops.has_not'); } }] },
  assignee: { get label() { return i18n.t('admin:automations.conditionFields.assignee'); }, valueKind: null, ops: [{ value: 'is_empty', get label() { return i18n.t('admin:automations.ops.is_empty'); } }, { value: 'is_not_empty', get label() { return i18n.t('admin:automations.ops.is_not_empty'); } }] },
  sprint: { get label() { return i18n.t('admin:automations.conditionFields.sprint'); }, valueKind: null, ops: [{ value: 'is_set', get label() { return i18n.t('admin:automations.ops.is_set'); } }, { value: 'is_empty', get label() { return i18n.t('admin:automations.ops.is_empty'); } }] },
};

export const ACTION_OPTIONS: (Option<ActionType> & { valueKind: ValueKind })[] = [
  { value: 'set_status', get label() { return i18n.t('admin:automations.actions.set_status'); }, valueKind: 'status' },
  { value: 'set_priority', get label() { return i18n.t('admin:automations.actions.set_priority'); }, valueKind: 'priority' },
  { value: 'add_label', get label() { return i18n.t('admin:automations.actions.add_label'); }, valueKind: 'label' },
  { value: 'remove_label', get label() { return i18n.t('admin:automations.actions.remove_label'); }, valueKind: 'label' },
  { value: 'assign_to', get label() { return i18n.t('admin:automations.actions.assign_to'); }, valueKind: 'member' },
  { value: 'assign_to_actor', get label() { return i18n.t('admin:automations.actions.assign_to_actor'); }, valueKind: null },
  { value: 'unassign_all', get label() { return i18n.t('admin:automations.actions.unassign_all'); }, valueKind: null },
  { value: 'add_comment', get label() { return i18n.t('admin:automations.actions.add_comment'); }, valueKind: 'comment' },
  { value: 'move_to_backlog', get label() { return i18n.t('admin:automations.actions.move_to_backlog'); }, valueKind: null },
];

export const triggerValueKind = (type: TriggerType): ValueKind =>
  TRIGGER_OPTIONS.find(option => option.value === type)?.valueKind ?? null;

export const actionValueKind = (type: ActionType): ValueKind =>
  ACTION_OPTIONS.find(option => option.value === type)?.valueKind ?? null;

/** The choices of a status, priority or type value. */
export const choicesFor = (kind: ValueKind): Option[] =>
  kind === 'status' ? STATUS_CHOICES : kind === 'priority' ? PRIORITY_CHOICES : kind === 'type' ? TYPE_CHOICES : [];
