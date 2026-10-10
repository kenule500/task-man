import { useMemo, type ReactNode } from 'react';
import {
  Combobox, ComboboxChip, ComboboxChipRemove, ComboboxChips, ComboboxClear, ComboboxContent, ComboboxEmpty,
  ComboboxInput, ComboboxInputGroup, ComboboxItem, ComboboxList, ComboboxTrigger, ComboboxValue, createComboboxItems,
} from '@/components/ui/combobox';
import { cn } from '@/lib/utils';

export interface ComboboxOption {
  /** Stable id; this is what `value` and `onValueChange` carry. */
  value: string;
  /** Text shown in the list, in chips, and searched while typing. */
  label: string;
  /** Second line in the list (email, role). Not searched. */
  description?: string;
  /** Leading visual (avatar, dot). Decorative: the label already names the option. */
  leading?: ReactNode;
  disabled?: boolean;
}

interface CommonProps {
  options: ComboboxOption[];
  /** Accessible name of the input when there is no visible label. */
  label: string;
  placeholder?: string;
  /** Shown when nothing matches the search. */
  emptyText?: string;
  id?: string;
  name?: string;
  disabled?: boolean;
  invalid?: boolean;
  autoFocus?: boolean;
  /** Most options rendered at once (the rest stay reachable by typing). */
  limit?: number;
  /** Describes the field (hint or error id), forwarded to the input. */
  'aria-describedby'?: string;
  className?: string;
}

type SingleProps = CommonProps & {
  multiple?: false;
  value: string | null;
  onValueChange: (value: string | null) => void;
  /** Show a clear button while a value is selected. */
  clearable?: boolean;
};

type MultiProps = CommonProps & {
  multiple: true;
  value: string[];
  onValueChange: (value: string[]) => void;
  clearable?: never;
};

export type OptionComboboxProps = SingleProps | MultiProps;

/**
 * Searchable select with single or multiple selection (multiple shows removable chips).
 * Built on the Base UI combobox: type to filter, arrows move, Enter selects, Escape closes,
 * Backspace removes the last chip. Values are option ids, not objects.
 */
export const OptionCombobox = (props: OptionComboboxProps) => {
  const { options, label, placeholder, emptyText = 'No results.', id, name, disabled, invalid, autoFocus, limit = 100, className } = props;
  const items = useMemo(
    () => createComboboxItems(options, { getValue: option => option.value, getLabel: option => option.label }),
    [options],
  );
  const labelOf = (value: string) => options.find(option => option.value === value)?.label ?? value;

  const input = (
    <ComboboxInput
      id={id}
      name={name}
      aria-label={label}
      aria-invalid={invalid || undefined}
      aria-describedby={props['aria-describedby']}
      disabled={disabled}
      autoFocus={autoFocus}
      placeholder={placeholder}
    />
  );

  const list = (
    <ComboboxContent>
      <ComboboxEmpty>{emptyText}</ComboboxEmpty>
      <ComboboxList>
        {(option: ComboboxOption) => (
          <ComboboxItem key={option.value} value={option.value} disabled={option.disabled}>
            {option.leading}
            <span className="min-w-0 flex-1">
              <span className="block truncate">{option.label}</span>
              {option.description && <span className="block truncate text-xs text-muted-foreground">{option.description}</span>}
            </span>
          </ComboboxItem>
        )}
      </ComboboxList>
    </ComboboxContent>
  );

  if (props.multiple) {
    return (
      <Combobox items={items} limit={limit} multiple value={props.value} onValueChange={props.onValueChange} disabled={disabled}>
        <ComboboxInputGroup className={className}>
          <ComboboxValue>
            {(selected: string[]) => (
              <ComboboxChips aria-label={selected.length > 0 ? `Selected: ${label}` : undefined}>
                {selected.map(value => (
                  <ComboboxChip key={value} aria-label={labelOf(value)}>
                    <span className="truncate">{labelOf(value)}</span>
                    <ComboboxChipRemove aria-label={`Remove ${labelOf(value)}`} />
                  </ComboboxChip>
                ))}
                {input}
              </ComboboxChips>
            )}
          </ComboboxValue>
        </ComboboxInputGroup>
        {list}
      </Combobox>
    );
  }

  return (
    <Combobox items={items} limit={limit} value={props.value} onValueChange={props.onValueChange} disabled={disabled}>
      <ComboboxInputGroup className={cn('flex-nowrap', className)}>
        {input}
        {props.clearable && props.value && <ComboboxClear aria-label={`Clear ${label}`} />}
        <ComboboxTrigger aria-label={`Show ${label} options`} />
      </ComboboxInputGroup>
      {list}
    </Combobox>
  );
};
