import crypto from 'crypto';
import mongoose from 'mongoose';
import {
  FIELD_KEY_PATTERN,
  type CustomFieldType,
  type ICustomFieldOption,
} from '../models/customFieldModel.js';
import type { IActivityChange } from '../models/activityModel.js';
import { formatChangeValue } from './activity.js';

export const MAX_TEXT_VALUE = 500;
export const MAX_URL_VALUE = 500;
export const MAX_MULTISELECT_VALUES = 20;
const MAX_ABS_NUMBER = 1e15;

/** What is stored under task.custom[key]. */
export type CustomValue = string | number | boolean | string[];

/** The parts of a field definition the validation needs (a Mongoose document or a plain object). */
export interface FieldDef {
  key: string;
  name: string;
  type: CustomFieldType;
  options: readonly Pick<ICustomFieldOption, 'id' | 'label'>[];
  projects: readonly string[];
  required: boolean;
  archived: boolean;
}

export interface ValueContext {
  // Ids of the workspace members (values of `user` fields)
  memberIds: ReadonlySet<string>;
}

export type ValueResult = { ok: true; value: CustomValue | null } | { ok: false; error: string };

const fail = (def: Pick<FieldDef, 'name'>, message: string): ValueResult => ({ ok: false, error: `${def.name}: ${message}` });

/** True for a key that is safe to use as a path segment under `custom.`. */
export const isFieldKey = (key: unknown): key is string => typeof key === 'string' && FIELD_KEY_PATTERN.test(key);

/** `custom.<key>` for update operators; throws on a key that does not match the slug pattern. */
export const fieldPath = (key: string): string => {
  if (!isFieldKey(key)) throw new Error('Invalid custom field key');
  return `custom.${key}`;
};

/** A field with no projects applies everywhere; otherwise only to tasks of the listed projects. */
export const fieldAppliesTo = (def: Pick<FieldDef, 'projects'>, project: string | undefined | null): boolean =>
  def.projects.length === 0 || def.projects.includes(project ?? '');

const isDateKey = (value: string): boolean => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

/**
 * Checks one value against its definition and returns the form to store.
 * `null` (and an empty text, empty list...) means "clear the value".
 */
export const coerceFieldValue = (def: FieldDef, raw: unknown, ctx: ValueContext): ValueResult => {
  if (raw === null) return { ok: true, value: null };

  switch (def.type) {
    case 'text': {
      if (typeof raw !== 'string') return fail(def, 'must be text');
      const text = raw.trim();
      if (text.length > MAX_TEXT_VALUE) return fail(def, `can be at most ${MAX_TEXT_VALUE} characters`);
      return { ok: true, value: text === '' ? null : text };
    }
    case 'number': {
      const num = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
      if (typeof num !== 'number' || !Number.isFinite(num) || Math.abs(num) > MAX_ABS_NUMBER) return fail(def, 'must be a number');
      return { ok: true, value: num };
    }
    case 'date': {
      if (typeof raw !== 'string' || !isDateKey(raw)) return fail(def, 'must be a date (YYYY-MM-DD)');
      return { ok: true, value: raw };
    }
    case 'select': {
      if (typeof raw !== 'string' || !def.options.some(option => option.id === raw)) return fail(def, 'is not one of the options');
      return { ok: true, value: raw };
    }
    case 'multiselect': {
      if (!Array.isArray(raw)) return fail(def, 'must be a list of options');
      if (raw.length > MAX_MULTISELECT_VALUES) return fail(def, `can have at most ${MAX_MULTISELECT_VALUES} choices`);
      const ids: string[] = [];
      for (const item of raw) {
        if (typeof item !== 'string' || !def.options.some(option => option.id === item)) return fail(def, 'has a choice that is not one of the options');
        if (!ids.includes(item)) ids.push(item);
      }
      return { ok: true, value: ids.length === 0 ? null : ids };
    }
    case 'checkbox': {
      if (typeof raw !== 'boolean') return fail(def, 'must be true or false');
      return { ok: true, value: raw };
    }
    case 'url': {
      if (typeof raw !== 'string') return fail(def, 'must be a link');
      const text = raw.trim();
      if (text === '') return { ok: true, value: null };
      if (text.length > MAX_URL_VALUE) return fail(def, `can be at most ${MAX_URL_VALUE} characters`);
      try {
        const url = new URL(text);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return fail(def, 'must start with http:// or https://');
      } catch {
        return fail(def, 'must be a valid link');
      }
      return { ok: true, value: text };
    }
    case 'user': {
      if (typeof raw !== 'string' || !mongoose.isValidObjectId(raw) || !ctx.memberIds.has(raw)) return fail(def, 'must be a member of this workspace');
      return { ok: true, value: raw };
    }
    default:
      return fail(def, 'has an unknown type');
  }
};

export interface CustomPlan {
  // Values to store, by key
  set: Record<string, CustomValue>;
  // Keys whose value is removed
  clear: string[];
}

export type PlanResult = { ok: true; plan: CustomPlan } | { ok: false; error: string };

export interface PlanOptions extends ValueContext {
  // 'create' enforces required fields of the task's project; 'update' only checks the given keys
  mode: 'create' | 'update';
  project?: string | null;
}

/**
 * Turns a request's `custom` object into the changes to apply (merge semantics: keys that are not
 * mentioned stay as they are, `null` clears). Unknown and archived fields are rejected.
 */
export const planCustomValues = (defs: readonly FieldDef[], input: unknown, options: PlanOptions): PlanResult => {
  if (input !== undefined && (typeof input !== 'object' || input === null || Array.isArray(input))) {
    return { ok: false, error: 'Custom fields must be an object of key and value' };
  }
  const given = (input ?? {}) as Record<string, unknown>;
  const byKey = new Map(defs.map(def => [def.key, def]));
  const plan: CustomPlan = { set: {}, clear: [] };

  for (const key of Object.keys(given)) {
    const def = isFieldKey(key) ? byKey.get(key) : undefined;
    if (!def) return { ok: false, error: `Unknown custom field "${key.slice(0, 40)}"` };
    const raw = given[key];
    if (def.archived && raw !== null) return { ok: false, error: `${def.name}: this field is archived` };
    const result = coerceFieldValue(def, raw, options);
    if (!result.ok) return result;
    // Write under the stored definition's key (validated when the field was created), never the request's string
    if (result.value === null) plan.clear.push(def.key);
    else plan.set[def.key] = result.value;
  }

  if (options.mode === 'create') {
    for (const def of defs) {
      // A checkbox always has a value (unchecked), so "required" cannot be missing
      if (!def.required || def.archived || def.type === 'checkbox' || !fieldAppliesTo(def, options.project)) continue;
      if (!(def.key in plan.set)) return { ok: false, error: `${def.name} is required` };
    }
  }
  return { ok: true, plan };
};

/** Values under task.custom as a plain object (reads Mongoose maps, plain objects and nothing). */
export const plainCustom = (value: unknown): Record<string, CustomValue> => {
  if (!value) return {};
  const entries: [string, unknown][] = value instanceof Map ? [...value.entries()] : Object.entries(value as object);
  const result: Record<string, CustomValue> = {};
  for (const [key, item] of entries) {
    if (isFieldKey(key) && item !== null && item !== undefined) result[key] = item as CustomValue;
  }
  return result;
};

const displayValue = (def: FieldDef | undefined, value: CustomValue | undefined): string | undefined => {
  if (value === undefined) return undefined;
  if (def && (def.type === 'select' || def.type === 'multiselect')) {
    const label = (id: string) => def.options.find(option => option.id === id)?.label ?? id;
    return formatChangeValue(Array.isArray(value) ? value.map(label) : label(String(value)));
  }
  return formatChangeValue(value);
};

/** Audit entries (`custom.<key>`) for the difference between two snapshots of task.custom. */
export const describeCustomChanges = (before: unknown, after: unknown, defs: readonly FieldDef[] = []): IActivityChange[] => {
  const was = plainCustom(before);
  const now = plainCustom(after);
  const changes: IActivityChange[] = [];
  for (const key of [...new Set([...Object.keys(was), ...Object.keys(now)])].sort()) {
    const def = defs.find(item => item.key === key);
    const from = displayValue(def, was[key]);
    const to = displayValue(def, now[key]);
    if (from !== to) changes.push({ field: `custom.${key}`, from, to });
  }
  return changes;
};

/** "Story size" -> "story_size"; unique among `taken`, always a valid key. */
export const slugFromName = (name: string, taken: ReadonlySet<string>): string => {
  let base = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (!/^[a-z]/.test(base)) base = `f_${base}`.replace(/_+$/, '');
  base = base.slice(0, 26).replace(/_+$/, '') || 'field';
  if (!taken.has(base)) return base;
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${base}_${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base.slice(0, 20)}_${crypto.randomBytes(3).toString('hex')}`;
};

/** A fresh option id (lower-case letters and digits). */
export const newOptionId = (): string => crypto.randomBytes(4).toString('hex');
