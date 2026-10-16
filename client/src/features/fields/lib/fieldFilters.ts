// Custom field filters of the task toolbar (`cf.<key>=<value>` in the URL): which fields can be filtered
// and the choices each one offers. Matching a task lives in `features/tasks/lib/filters.ts`.
import i18n from '@/i18n';
import type { SelectOption } from '@/features/tasks/constants';
import { MAX_CUSTOM_FILTERS } from '@/features/tasks/lib/filters';
import { FIELD_COLOR_META, appliesToProject } from './fields';
import type { CustomField, FieldType } from '../types';

/** Field types with a short, fixed list of values to pick from. */
const FILTERABLE_TYPES: readonly FieldType[] = ['select', 'multiselect', 'checkbox', 'user'];

/** Fields the toolbar offers: active, filterable by choice, and (with a project in scope) applying to it. */
export const filterableFields = (fields: readonly CustomField[], project?: string): CustomField[] =>
  fields.filter(field => !field.archived && FILTERABLE_TYPES.includes(field.type) && (!project || project === 'all' || appliesToProject(field, project)));

/** Choices of one field's filter; `all` leaves the field out of the filter. A value the field no longer has stays selectable. */
export const filterOptions = (field: CustomField, members: readonly { _id: string; name: string }[], current = 'all'): SelectOption<string>[] => {
  const name = field.name;
  const head: SelectOption<string>[] = [{ value: 'all', label: i18n.t('tasks:fields.filter.any', { name: name.toLowerCase() }) }];
  const none: SelectOption<string> = { value: 'none', label: i18n.t('tasks:fields.filter.none', { name: name.toLowerCase() }) };
  let choices: SelectOption<string>[];
  switch (field.type) {
    case 'checkbox':
      return [...head, { value: 'true', label: i18n.t('tasks:fields.filter.yes', { name }) }, { value: 'false', label: i18n.t('tasks:fields.filter.no', { name }) }, { value: 'none', label: i18n.t('tasks:fields.filter.notSet', { name }) }];
    case 'user':
      choices = members.map(member => ({ value: member._id, label: member.name }));
      break;
    default:
      choices = field.options.map(option => ({ value: option.id, label: option.label, dot: FIELD_COLOR_META[option.color].dot }));
  }
  const known = current === 'all' || current === 'none' || choices.some(choice => choice.value === current);
  return [...head, none, ...choices, ...(known ? [] : [{ value: current, label: field.type === 'user' ? i18n.t('tasks:fields.member') : i18n.t('tasks:fields.filter.unknownOption') }])];
};

/** `custom` with the filter of `key` set to `value` (`all` removes it). */
export const withCustomFilter = (custom: Record<string, string> | undefined, key: string, value: string): Record<string, string> => {
  const next = { ...(custom ?? {}) };
  if (value === 'all') delete next[key];
  else next[key] = value;
  return next;
};

/** True when one more field can be filtered (the URL and saved views keep at most 5). */
export const canAddCustomFilter = (custom: Record<string, string> | undefined, key: string): boolean =>
  key in (custom ?? {}) || Object.keys(custom ?? {}).length < MAX_CUSTOM_FILTERS;
