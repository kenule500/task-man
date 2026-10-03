import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PRIORITY_OPTIONS, STATUS_OPTIONS, type SelectOption } from '../constants';
import type { TaskPriority, TaskStatus } from '../types';

const OptionDot = ({ className }: { className?: string }) =>
  className ? <span aria-hidden className={cn('size-2 shrink-0 rounded-full', className)} /> : null;

interface OptionSelectProps<T extends string> {
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  'aria-label': string;
  /** `field` for forms and toolbars, `inline` for compact in-row editing */
  variant?: 'field' | 'inline';
  icon?: ReactNode;
  id?: string;
  disabled?: boolean;
  className?: string;
}

const TRIGGER_STYLES = {
  field: 'h-9 w-full bg-white border-slate-200 text-sm text-slate-700 shadow-none',
  inline: 'h-7 rounded-md border-transparent bg-transparent px-2 text-xs font-medium text-slate-700 hover:brightness-95 data-popup-open:ring-2 data-popup-open:ring-primary/20',
};

/** Generic single-value select built on the shadcn (Base UI) Select primitive. */
export function OptionSelect<T extends string>({
  value, options, onChange, variant = 'field', icon, id, disabled, className, ...rest
}: OptionSelectProps<T>) {
  const selected = options.find(option => option.value === value);

  return (
    <Select
      value={value}
      onValueChange={next => next && onChange(next as T)}
      items={options.map(({ value, label }) => ({ value, label }))}
      disabled={disabled}
    >
      <SelectTrigger id={id} aria-label={rest['aria-label']} className={cn(TRIGGER_STYLES[variant], variant === 'inline' && selected?.tone, className)}>
        {icon}
        <SelectValue>
          {() => (
            <>
              <OptionDot className={selected?.dot} />
              {selected?.label}
            </>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        {options.map(option => (
          <SelectItem key={option.value} value={option.value} className="text-slate-700">
            <OptionDot className={option.dot} />
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

type PresetSelectProps<T extends string> = Omit<OptionSelectProps<T>, 'options' | 'aria-label'> & { 'aria-label'?: string };

export const StatusSelect = ({ 'aria-label': label = 'Status', ...props }: PresetSelectProps<TaskStatus>) => (
  <OptionSelect options={STATUS_OPTIONS} aria-label={label} {...props} />
);

export const PrioritySelect = ({ 'aria-label': label = 'Priority', ...props }: PresetSelectProps<TaskPriority>) => (
  <OptionSelect options={PRIORITY_OPTIONS} aria-label={label} {...props} />
);
