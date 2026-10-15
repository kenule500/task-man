// Pure helpers for custom fields: which fields apply, how values are shown, compared and validated.
// The server enforces the same rules (server/src/utils/customFields.ts).
import { STAGE_COLOR_META } from '@/features/workflow/lib/stages';
import type { CustomField, CustomValue, CustomValues, CustomValuesInput, FieldColor, FieldOption, FieldType } from '../types';

export const MAX_FIELDS = 30;
export const MAX_FIELD_NAME = 40;
export const MAX_OPTIONS = 30;
export const MAX_OPTION_LABEL = 40;
export const MAX_TEXT_VALUE = 500;
export const MAX_MULTISELECT_VALUES = 20;

export const FIELD_TYPE_META: Record<FieldType, { label: string; description: string }> = {
  text: { label: 'Text', description: 'A short note, up to 500 characters' },
  number: { label: 'Number', description: 'Any number, such as a budget or a score' },
  date: { label: 'Date', description: 'A calendar day' },
  select: { label: 'Select', description: 'One choice from a list' },
  multiselect: { label: 'Multi-select', description: 'Several choices from a list' },
  checkbox: { label: 'Checkbox', description: 'Yes or no' },
  url: { label: 'Link', description: 'A web address (http or https)' },
  user: { label: 'Person', description: 'A member of the workspace' },
};

export const FIELD_COLOR_META: Record<FieldColor, { label: string; dot: string }> = STAGE_COLOR_META;

export const hasOptions = (type: FieldType): boolean => type === 'select' || type === 'multiselect';

/** A field without projects applies to every project. */
export const appliesToProject = (field: Pick<CustomField, 'projects'>, project: string | undefined): boolean =>
  field.projects.length === 0 || field.projects.includes(project ?? '');

/** Fields to fill in for a task of `project`: not archived and applicable. */
export const fieldsForProject = (fields: readonly CustomField[], project: string | undefined): CustomField[] =>
  fields.filter(field => !field.archived && appliesToProject(field, project));

export const isEmptyValue = (value: CustomValue | null | undefined): boolean =>
  value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);

export const optionLabel = (field: Pick<CustomField, 'options'>, id: string): string =>
  field.options.find(option => option.id === id)?.label ?? id;

export interface ValueLookups {
  /** Name of a user id; unknown ids show as "Member". */
  userName?: (id: string) => string | undefined;
}

/** Plain text for a value (CSV, tooltips, search). Empty string when there is no value. */
export const valueText = (field: CustomField, value: CustomValue | null | undefined, lookups: ValueLookups = {}): string => {
  if (value === undefined || value === null || isEmptyValue(value)) return '';
  switch (field.type) {
    case 'select': return optionLabel(field, String(value));
    case 'multiselect': return (Array.isArray(value) ? value : []).map(id => optionLabel(field, id)).join('; ');
    case 'checkbox': return value === true ? 'Yes' : 'No';
    case 'user': return lookups.userName?.(String(value)) ?? 'Member';
    default: return String(value);
  }
};

/** Values of fields this workspace still has (stale keys are dropped). */
export const knownValues = (fields: readonly CustomField[], custom: CustomValues | undefined): CustomValues => {
  const result: CustomValues = {};
  for (const field of fields) {
    const value = custom?.[field.key];
    if (value !== undefined && !isEmptyValue(value)) result[field.key] = value;
  }
  return result;
};

const sameValue = (a: CustomValue | null | undefined, b: CustomValue | null | undefined): boolean =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * The `custom` payload for an edit: only the keys whose value changed, `null` for a cleared one.
 * Returns undefined when nothing changed, so the request can leave `custom` out.
 */
export const diffCustom = (before: CustomValues | undefined, after: CustomValues): CustomValuesInput | undefined => {
  const patch: CustomValuesInput = {};
  for (const key of new Set([...Object.keys(before ?? {}), ...Object.keys(after)])) {
    const next = isEmptyValue(after[key]) ? null : after[key];
    const prev = isEmptyValue(before?.[key]) ? null : before?.[key];
    if (!sameValue(prev, next)) patch[key] = next;
  }
  return Object.keys(patch).length > 0 ? patch : undefined;
};

/** The `custom` payload for a new task: filled values only. */
export const createCustom = (fields: readonly CustomField[], values: CustomValues): CustomValues | undefined => {
  const result = knownValues(fields, values);
  return Object.keys(result).length > 0 ? result : undefined;
};

/** Required fields (of this project) that have no value yet; checkboxes are never missing. */
export const missingRequired = (fields: readonly CustomField[], project: string | undefined, values: CustomValues): CustomField[] =>
  fieldsForProject(fields, project).filter(field => field.required && field.type !== 'checkbox' && isEmptyValue(values[field.key]));

/** Moves one item to another index (returns a new list). */
export const moveItem = <T,>(items: readonly T[], from: number, to: number): T[] => {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return [...items];
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
};

export interface FieldDraft {
  name: string;
  type: FieldType;
  options: FieldOption[];
  projects: string[];
  required: boolean;
}

export interface FieldDraftErrors {
  name?: string;
  options?: string;
}

/** Same rules as the API, checked before saving. */
export const validateFieldDraft = (draft: FieldDraft): FieldDraftErrors => {
  const errors: FieldDraftErrors = {};
  const name = draft.name.trim();
  if (!name) errors.name = 'Give the field a name.';
  else if (name.length > MAX_FIELD_NAME) errors.name = `Use at most ${MAX_FIELD_NAME} characters.`;
  if (hasOptions(draft.type)) {
    const labels = draft.options.map(option => option.label.trim());
    if (labels.length === 0) errors.options = 'Add at least one option.';
    else if (labels.some(label => !label)) errors.options = 'Every option needs a name.';
    else if (labels.some(label => label.length > MAX_OPTION_LABEL)) errors.options = `Option names can have at most ${MAX_OPTION_LABEL} characters.`;
    else if (new Set(labels.map(label => label.toLowerCase())).size !== labels.length) errors.options = 'Option names must be different.';
    else if (labels.length > MAX_OPTIONS) errors.options = `A field can have at most ${MAX_OPTIONS} options.`;
  }
  return errors;
};

/** Trimmed options; new ones carry no id (the server assigns it). */
export const optionsPayload = (options: readonly FieldOption[]): FieldOption[] =>
  options.map(option => ({ ...(option.id ? { id: option.id } : {}), label: option.label.trim(), color: option.color }));

/** Draft from a saved field (for the edit dialog). */
export const draftOf = (field?: CustomField | null): FieldDraft => ({
  name: field?.name ?? '',
  type: field?.type ?? 'text',
  options: field?.options.map(option => ({ ...option })) ?? [],
  projects: field ? [...field.projects] : [],
  required: field?.required ?? false,
});

/** "Every project" or "Web, Mobile". */
export const describeProjects = (projects: readonly string[]): string =>
  projects.length === 0 ? 'Every project' : projects.join(', ');

/** The address when a link value is http or https, otherwise null (never render other schemes as links). */
export const safeHref = (value: string): string | null => {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
};

/** Draft text of a number field -> value (null = empty or not a finite number). */
export const parseNumberInput = (text: string): number | null => {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

/** `custom` after applying a patch the way the server merges it: given keys replace, `null` removes. */
export const mergeCustom = (current: CustomValues | undefined, patch: CustomValuesInput): CustomValues => {
  const next: CustomValues = { ...(current ?? {}) };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || isEmptyValue(value)) delete next[key];
    else next[key] = value;
  }
  return next;
};
