import { useMemo, useState, type KeyboardEvent } from 'react';
import { OptionCombobox, UserAvatar, type ComboboxOption } from '@/components/ds';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { FIELD_COLOR_META, MAX_TEXT_VALUE, parseNumberInput } from '../lib/fields';
import type { CustomField, CustomValue } from '../types';
import type { FieldMember } from '../hooks/useFieldMembers';

export interface CustomFieldInputProps {
  field: CustomField;
  value: CustomValue | null | undefined;
  /** Every change (typing, picking). `null` = cleared. */
  onChange: (value: CustomValue | null) => void;
  /**
   * The value is final: right away for switches and pickers, on blur or Enter for typed values.
   * Inline editors save here; forms ignore it and read `onChange`.
   */
  onCommit?: (value: CustomValue | null) => void;
  /** Members to pick for person fields (empty when the list cannot be read). */
  members?: FieldMember[];
  membersLoading?: boolean;
  id?: string;
  disabled?: boolean;
  invalid?: boolean;
  'aria-describedby'?: string;
  className?: string;
}

export const FIELD_INPUT_CLASS = 'h-11 w-full bg-white border border-slate-300 rounded-lg text-base sm:h-10 sm:text-sm text-slate-900 placeholder:text-slate-500 focus-visible:border-slate-400 focus-visible:ring-0 shadow-none';

const textOf = (value: CustomValue | null | undefined): string => (value === undefined || value === null ? '' : String(value));

/** Text-like input (text, number, date, link) with a local draft: committed on blur or Enter. */
const TypedInput = ({
  field, value, onChange, onCommit, id, disabled, invalid, className, ...rest
}: CustomFieldInputProps) => {
  const [draft, setDraft] = useState(textOf(value));
  const [seen, setSeen] = useState(value);
  const toValue = (text: string): CustomValue | null => {
    if (field.type === 'number') return parseNumberInput(text);
    const trimmed = text.trim();
    return trimmed === '' ? null : trimmed;
  };

  // Follow the saved value when it changes from outside (a refetch, a bulk edit), but not our own typing
  if (seen !== value) {
    setSeen(value);
    if (toValue(draft) !== (value ?? null)) setDraft(textOf(value));
  }

  const commit = () => {
    const next = toValue(draft);
    if (next === (value ?? null)) return;
    onCommit?.(next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit();
    }
  };

  const type = field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : field.type === 'url' ? 'url' : 'text';
  return (
    <Input
      id={id}
      type={type}
      step={field.type === 'number' ? 'any' : undefined}
      inputMode={field.type === 'number' ? 'decimal' : undefined}
      maxLength={field.type === 'text' || field.type === 'url' ? MAX_TEXT_VALUE : undefined}
      value={draft}
      disabled={disabled}
      placeholder={field.type === 'url' ? 'https://' : undefined}
      aria-invalid={invalid || undefined}
      aria-describedby={rest['aria-describedby']}
      onChange={event => {
        setDraft(event.target.value);
        onChange(toValue(event.target.value));
      }}
      onBlur={commit}
      onKeyDown={onKeyDown}
      className={cn(FIELD_INPUT_CLASS, className)}
    />
  );
};

/** The right control for a field type: input, date, switch, or a searchable picker. */
const CustomFieldInput = (props: CustomFieldInputProps) => {
  const { field, value, onChange, onCommit, members = [], membersLoading = false, id, disabled, invalid, className } = props;

  const choose = (next: CustomValue | null) => {
    onChange(next);
    onCommit?.(next);
  };

  const options = useMemo<ComboboxOption[]>(() => {
    if (field.type === 'user') {
      const list = members.map(member => ({
        value: member._id,
        label: member.name,
        leading: <UserAvatar name={member.name} src={member.avatarUrl} size="sm" className="size-6 text-[10px]" />,
      }));
      // A saved person who is not in the list (no permission to list, or left the workspace) stays visible
      const current = typeof value === 'string' ? value : '';
      return current && !list.some(item => item.value === current)
        ? [...list, { value: current, label: 'Member', leading: undefined }]
        : list;
    }
    return field.options.map(option => ({
      value: option.id,
      label: option.label,
      leading: <span aria-hidden className={cn('size-2 shrink-0 rounded-full', FIELD_COLOR_META[option.color].dot)} />,
    }));
  }, [field.options, field.type, members, value]);

  switch (field.type) {
    case 'checkbox':
      return (
        <div className={cn('inline-flex min-h-11 items-center gap-3 text-sm text-slate-700 sm:min-h-10', className)}>
          <Switch
            id={id}
            checked={value === true}
            disabled={disabled}
            aria-label={field.name}
            aria-invalid={invalid || undefined}
            onCheckedChange={checked => choose(checked)}
          />
          <span aria-hidden>{value === true ? 'Yes' : 'No'}</span>
        </div>
      );
    case 'select':
      return (
        <OptionCombobox
          id={id}
          label={field.name}
          options={options}
          value={typeof value === 'string' ? value : null}
          onValueChange={next => choose(next)}
          clearable
          disabled={disabled}
          invalid={invalid}
          placeholder="Choose an option"
          aria-describedby={props['aria-describedby']}
          className={className}
        />
      );
    case 'multiselect':
      return (
        <OptionCombobox
          multiple
          id={id}
          label={field.name}
          options={options}
          value={Array.isArray(value) ? value : []}
          onValueChange={next => choose(next.length === 0 ? null : next)}
          disabled={disabled}
          invalid={invalid}
          placeholder={Array.isArray(value) && value.length > 0 ? 'Add another' : 'Choose options'}
          aria-describedby={props['aria-describedby']}
          className={className}
        />
      );
    case 'user':
      if (membersLoading) return <p className="text-xs italic text-slate-500">Loading members...</p>;
      if (members.length === 0 && !value) {
        return <p className="text-xs italic text-slate-500">You cannot see the member list, so this field cannot be changed.</p>;
      }
      return (
        <OptionCombobox
          id={id}
          label={field.name}
          options={options}
          value={typeof value === 'string' ? value : null}
          onValueChange={next => choose(next)}
          clearable
          disabled={disabled || members.length === 0}
          invalid={invalid}
          placeholder="Search people"
          emptyText="No one matches that name."
          aria-describedby={props['aria-describedby']}
          className={className}
        />
      );
    default:
      return <TypedInput {...props} />;
  }
};

export default CustomFieldInput;
