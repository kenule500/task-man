import mongoose from 'mongoose';
import { TASK_PRIORITIES, TASK_STATUSES, TASK_TYPES } from '../../models/taskModel.js';
import {
  ACTION_TYPES,
  CONDITION_FIELDS,
  MAX_AUTOMATION_ACTIONS,
  MAX_AUTOMATION_COMMENT,
  MAX_AUTOMATION_CONDITIONS,
  MAX_AUTOMATION_VALUE,
  TRIGGER_TYPES,
  type ActionType,
  type ConditionField,
  type ConditionOp,
  type IAutomationAction,
  type IAutomationCondition,
  type IAutomationTrigger,
  type TriggerType,
} from '../../models/automationModel.js';

export type Parsed<T> = { value: T; error?: undefined } | { value?: undefined; error: string };

const fail = <T>(error: string): Parsed<T> => ({ error });
const ok = <T>(value: T): Parsed<T> => ({ value });

const isRecord = (input: unknown): input is Record<string, unknown> =>
  typeof input === 'object' && input !== null && !Array.isArray(input);

const text = (input: unknown): string | null => (typeof input === 'string' ? input.trim() : null);

const oneOf = <T extends string>(list: readonly T[], input: unknown): input is T =>
  typeof input === 'string' && (list as readonly string[]).includes(input);

/** Triggers that can be narrowed with `to`, and the values allowed. */
const TRIGGER_TO: Partial<Record<TriggerType, readonly string[] | 'label'>> = {
  'task.status_changed': TASK_STATUSES,
  'task.priority_changed': TASK_PRIORITIES,
  'task.labeled': 'label',
};

export const parseTrigger = (input: unknown): Parsed<IAutomationTrigger> => {
  if (!isRecord(input) || !oneOf(TRIGGER_TYPES, input.type)) return fail('Choose what starts the rule');
  const to = input.to === undefined || input.to === null ? '' : text(input.to);
  if (to === null) return fail('The trigger value must be text');
  const allowed = TRIGGER_TO[input.type];
  if (!to) return ok({ type: input.type, to: '' });
  if (!allowed) return fail('This trigger does not take a value');
  if (allowed === 'label') {
    if (to.length > MAX_AUTOMATION_VALUE) return fail(`A label can be at most ${MAX_AUTOMATION_VALUE} characters`);
  } else if (!allowed.includes(to)) {
    return fail('Invalid trigger value');
  }
  return ok({ type: input.type, to });
};

/** Which operators each condition field accepts, and the values allowed. */
const CONDITION_RULES: Record<ConditionField, { ops: readonly ConditionOp[]; values: readonly string[] | 'label' | 'none' }> = {
  type: { ops: ['is', 'is_not'], values: TASK_TYPES },
  priority: { ops: ['is', 'is_not'], values: TASK_PRIORITIES },
  status: { ops: ['is', 'is_not'], values: TASK_STATUSES },
  label: { ops: ['has', 'has_not'], values: 'label' },
  assignee: { ops: ['is_empty', 'is_not_empty'], values: 'none' },
  sprint: { ops: ['is_set', 'is_empty'], values: 'none' },
};

export const parseConditions = (input: unknown): Parsed<IAutomationCondition[]> => {
  if (input === undefined || input === null) return ok([]);
  if (!Array.isArray(input)) return fail('Conditions must be a list');
  if (input.length > MAX_AUTOMATION_CONDITIONS) return fail(`A rule can have at most ${MAX_AUTOMATION_CONDITIONS} conditions`);
  const parsed: IAutomationCondition[] = [];
  for (const raw of input) {
    if (!isRecord(raw) || !oneOf(CONDITION_FIELDS, raw.field)) return fail('Choose what each condition checks');
    const rule = CONDITION_RULES[raw.field];
    if (!oneOf(rule.ops, raw.op)) return fail('Invalid condition operator');
    const value = raw.value === undefined || raw.value === null ? '' : text(raw.value);
    if (value === null) return fail('The condition value must be text');
    if (rule.values === 'none') {
      parsed.push({ field: raw.field, op: raw.op, value: '' });
    } else if (rule.values === 'label') {
      if (!value || value.length > MAX_AUTOMATION_VALUE) return fail(`A label is required (up to ${MAX_AUTOMATION_VALUE} characters)`);
      parsed.push({ field: raw.field, op: raw.op, value });
    } else {
      if (!rule.values.includes(value)) return fail('Invalid condition value');
      parsed.push({ field: raw.field, op: raw.op, value });
    }
  }
  return ok(parsed);
};

const ACTION_VALUES: Record<ActionType, readonly string[] | 'label' | 'member' | 'comment' | 'none'> = {
  set_status: TASK_STATUSES,
  set_priority: TASK_PRIORITIES,
  add_label: 'label',
  remove_label: 'label',
  assign_to: 'member',
  assign_to_actor: 'none',
  unassign_all: 'none',
  add_comment: 'comment',
  move_to_backlog: 'none',
};

export const parseActions = (input: unknown): Parsed<IAutomationAction[]> => {
  if (!Array.isArray(input) || input.length === 0) return fail('Add at least one action');
  if (input.length > MAX_AUTOMATION_ACTIONS) return fail(`A rule can have at most ${MAX_AUTOMATION_ACTIONS} actions`);
  const parsed: IAutomationAction[] = [];
  for (const raw of input) {
    if (!isRecord(raw) || !oneOf(ACTION_TYPES, raw.type)) return fail('Choose what each action does');
    const allowed = ACTION_VALUES[raw.type];
    const value = raw.value === undefined || raw.value === null ? '' : text(raw.value);
    if (value === null) return fail('The action value must be text');
    if (allowed === 'none') {
      parsed.push({ type: raw.type, value: '' });
    } else if (allowed === 'label') {
      if (!value || value.length > MAX_AUTOMATION_VALUE) return fail(`A label is required (up to ${MAX_AUTOMATION_VALUE} characters)`);
      parsed.push({ type: raw.type, value });
    } else if (allowed === 'member') {
      if (!mongoose.isValidObjectId(value) || value.length !== 24) return fail('Choose a member to assign');
      parsed.push({ type: raw.type, value });
    } else if (allowed === 'comment') {
      if (!value || value.length > MAX_AUTOMATION_COMMENT) return fail(`A comment is required (up to ${MAX_AUTOMATION_COMMENT} characters)`);
      parsed.push({ type: raw.type, value });
    } else {
      if (!allowed.includes(value)) return fail('Invalid action value');
      parsed.push({ type: raw.type, value });
    }
  }
  return ok(parsed);
};
