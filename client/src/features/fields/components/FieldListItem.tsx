import { Archive, ArrowDown, ArrowUp, ArchiveRestore, Pencil, Trash2 } from 'lucide-react';
import { Tag } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { FIELD_COLOR_META, FIELD_TYPE_META, describeProjects } from '../lib/fields';
import type { CustomField } from '../types';

interface FieldListItemProps {
  field: CustomField;
  index: number;
  total: number;
  busy?: boolean;
  onMove: (direction: -1 | 1) => void;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
}

const ICON_BUTTON = 'size-11 text-slate-600 sm:size-8';

/** One row of the fields settings: what the field is, where it applies, and its actions. */
const FieldListItem = ({ field, index, total, busy = false, onMove, onEdit, onArchive, onDelete }: FieldListItemProps) => (
  <li
    aria-label={`${field.name}, field ${index + 1} of ${total}`}
    className={cn('rounded-xl border border-slate-200 bg-white p-3 sm:p-4', field.archived && 'bg-slate-50')}
  >
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn('text-sm font-semibold [overflow-wrap:anywhere]', field.archived ? 'text-slate-600' : 'text-slate-900')}>
            {field.name}
          </span>
          <Tag>{FIELD_TYPE_META[field.type].label}</Tag>
          {field.required && <Tag tone="warning">Required</Tag>}
          {field.archived && <Tag>Archived</Tag>}
        </div>
        <p className="text-xs text-slate-600">
          <span className="font-medium">Applies to:</span> {describeProjects(field.projects)}
          <span aria-hidden> · </span>
          <span className="font-mono text-[11px]">{field.key}</span>
        </p>
        {field.options.length > 0 && (
          <ul aria-label={`Options of ${field.name}`} className="flex flex-wrap gap-1 pt-1">
            {field.options.map(option => (
              <li
                key={option.id}
                className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700"
              >
                <span aria-hidden className={cn('size-2 shrink-0 rounded-full', FIELD_COLOR_META[option.color].dot)} />
                <span className="truncate">{option.label}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Move ${field.name} up`} disabled={busy || index === 0} onClick={() => onMove(-1)} className={ICON_BUTTON}>
          <ArrowUp aria-hidden />
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Move ${field.name} down`} disabled={busy || index === total - 1} onClick={() => onMove(1)} className={ICON_BUTTON}>
          <ArrowDown aria-hidden />
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Edit ${field.name}`} disabled={busy} onClick={onEdit} className={ICON_BUTTON}>
          <Pencil aria-hidden />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={field.archived ? `Restore ${field.name}` : `Archive ${field.name}`}
          title={field.archived ? 'Restore: show it on tasks again' : 'Archive: hide it, keep the values'}
          disabled={busy}
          onClick={onArchive}
          className={ICON_BUTTON}
        >
          {field.archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Delete ${field.name}`} disabled={busy} onClick={onDelete} className="size-11 text-danger-fg hover:bg-danger-bg sm:size-8">
          <Trash2 aria-hidden />
        </Button>
      </div>
    </div>
  </li>
);

export default FieldListItem;
