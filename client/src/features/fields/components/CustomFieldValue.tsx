import { Check, ExternalLink, X } from 'lucide-react';
import { UserAvatar } from '@/components/ds';
import { cn } from '@/lib/utils';
import { formatDate } from '@/features/tasks/lib/date';
import { FIELD_COLOR_META, isEmptyValue, optionLabel, safeHref } from '../lib/fields';
import type { CustomField, CustomValue } from '../types';

interface CustomFieldValueProps {
  field: CustomField;
  value: CustomValue | null | undefined;
  /** Name of a user id (for person fields). */
  userName?: (id: string) => string | undefined;
  /** What to show when there is no value; pass null to render nothing. */
  empty?: string | null;
  className?: string;
}

const CHIP = 'inline-flex max-w-full items-center gap-1.5 rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700';

/** One option as a neutral chip with its color dot (the label always carries the meaning). */
export const OptionChip = ({ field, id }: { field: Pick<CustomField, 'options'>; id: string }) => {
  const option = field.options.find(item => item.id === id);
  return (
    <span className={CHIP}>
      <span aria-hidden className={cn('size-2 shrink-0 rounded-full', FIELD_COLOR_META[option?.color ?? 'slate'].dot)} />
      <span className="truncate">{option?.label ?? optionLabel(field, id)}</span>
    </span>
  );
};

/** Read-only display of a field value: option chips, a link, a date, a person... */
const CustomFieldValue = ({ field, value, userName, empty = 'Not set', className }: CustomFieldValueProps) => {
  if (isEmptyValue(value) || value === undefined || value === null) {
    return empty === null ? null : <span className={cn('text-sm text-slate-500', className)}>{empty}</span>;
  }

  switch (field.type) {
    case 'select':
      return <span className={cn('inline-flex max-w-full', className)}><OptionChip field={field} id={String(value)} /></span>;
    case 'multiselect':
      return (
        <ul aria-label={field.name} className={cn('flex flex-wrap gap-1', className)}>
          {(Array.isArray(value) ? value : []).map(id => <li key={id} className="max-w-full"><OptionChip field={field} id={id} /></li>)}
        </ul>
      );
    case 'checkbox':
      return (
        <span className={cn('inline-flex items-center gap-1.5 text-sm text-slate-700', className)}>
          {value === true
            ? <Check aria-hidden className="size-4 text-success-fg" />
            : <X aria-hidden className="size-4 text-slate-500" />}
          {value === true ? 'Yes' : 'No'}
        </span>
      );
    case 'url': {
      const href = safeHref(String(value));
      return href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={cn('inline-flex max-w-full items-center gap-1 rounded text-sm text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary', className)}
        >
          <span className="truncate">{String(value)}</span>
          <ExternalLink aria-hidden className="size-3 shrink-0" />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      ) : <span className={cn('truncate text-sm text-slate-700', className)}>{String(value)}</span>;
    }
    case 'date':
      return <span className={cn('text-sm tabular-nums text-slate-700', className)}>{formatDate(String(value))}</span>;
    case 'number':
      return <span className={cn('text-sm tabular-nums text-slate-700', className)}>{String(value)}</span>;
    case 'user': {
      const name = userName?.(String(value)) ?? 'Member';
      return (
        <span className={cn('inline-flex min-w-0 items-center gap-2 text-sm text-slate-700', className)}>
          <UserAvatar name={name} size="sm" className="size-6 text-[10px]" />
          <span className="truncate">{name}</span>
        </span>
      );
    }
    default:
      return <span className={cn('text-sm text-slate-700 [overflow-wrap:anywhere]', className)}>{String(value)}</span>;
  }
};

export default CustomFieldValue;
