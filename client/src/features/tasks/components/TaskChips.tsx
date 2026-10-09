import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { UserAvatar } from '@/components/ds';
import { getLabelStyle } from '../lib/labels';
import type { TaskUser } from '../types';

interface LabelChipProps {
  label: string;
  /** Shows a remove button (form inputs). */
  onRemove?: (label: string) => void;
  className?: string;
}

/** Label with a deterministic color; text is dark enough for AA contrast on its background. */
export const LabelChip = ({ label, onRemove, className }: LabelChipProps) => (
  <span
    className={cn(
      'inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-4',
      getLabelStyle(label).chip,
      className,
    )}
  >
    <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', getLabelStyle(label).dot)} />
    <span className="truncate">{label}</span>
    {onRemove && (
      <button
        type="button"
        onClick={() => onRemove(label)}
        aria-label={`Remove label ${label}`}
        className="-mr-0.5 flex size-4 shrink-0 items-center justify-center rounded hover:bg-black/10 focus-visible:outline-2 focus-visible:outline-primary"
      >
        <X className="size-3" aria-hidden />
      </button>
    )}
  </span>
);

interface LabelListProps {
  labels?: string[];
  /** Chips shown before collapsing the rest into "+N". */
  max?: number;
  className?: string;
}

export const LabelList = ({ labels = [], max = 3, className }: LabelListProps) => {
  if (labels.length === 0) return null;
  const visible = labels.slice(0, max);
  const hidden = labels.length - visible.length;

  return (
    <ul aria-label="Labels" className={cn('flex min-w-0 flex-wrap items-center gap-1', className)}>
      {visible.map(label => (
        <li key={label} className="min-w-0 max-w-full">
          <LabelChip label={label} className="max-w-28" />
        </li>
      ))}
      {hidden > 0 && (
        <li className="text-[11px] font-medium text-slate-500" title={labels.slice(max).join(', ')}>
          +{hidden}<span className="sr-only"> more labels</span>
        </li>
      )}
    </ul>
  );
};

interface AssigneeStackProps {
  users?: TaskUser[];
  /** Avatars shown before collapsing the rest into "+N". */
  max?: number;
  className?: string;
}

/** Overlapping avatars of the people a task is assigned to. */
export const AssigneeStack = ({ users = [], max = 3, className }: AssigneeStackProps) => {
  if (users.length === 0) return null;
  const visible = users.slice(0, max);
  const hidden = users.length - visible.length;
  const names = users.map(user => user.name).join(', ');

  return (
    <span className={cn('inline-flex shrink-0 items-center', className)} title={`Assigned to ${names}`}>
      <span className="sr-only">Assigned to {names}</span>
      <span aria-hidden className="flex -space-x-1.5">
        {visible.map(user => (
          <UserAvatar key={user._id} name={user.name} src={user.avatarUrl || undefined} className="size-6 text-[10px] ring-2 ring-white" />
        ))}
        {hidden > 0 && (
          <span className="z-10 flex size-6 items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-600 ring-2 ring-white">
            +{hidden}
          </span>
        )}
      </span>
    </span>
  );
};
