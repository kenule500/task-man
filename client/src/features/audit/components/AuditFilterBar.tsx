import { FilterX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { OptionSelect } from '@/features/tasks';
import type { WorkspaceMember } from '@/features/workspace';
import { AREA_LABELS } from '../lib/format';
import { hasActiveFilters } from '../lib/filters';
import { AUDIT_AREAS, type AuditArea, type AuditFilters } from '../types';

interface AuditFilterBarProps {
  filters: AuditFilters;
  members: WorkspaceMember[];
  onChange: (filters: AuditFilters) => void;
}

const ALL_ACTORS = 'all';

const CHIP =
  'inline-flex h-10 items-center rounded-full border px-3.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 md:h-8 md:px-3';

/** Area chips and an actor select. The page keeps the values in the URL. */
export const AuditFilterBar = ({ filters, members, onChange }: AuditFilterBarProps) => {
  const areas: { value: AuditArea | ''; label: string }[] = [
    { value: '', label: 'All' },
    ...AUDIT_AREAS.map(area => ({ value: area, label: AREA_LABELS[area] })),
  ];

  const actorOptions = [
    { value: ALL_ACTORS, label: 'Everyone' },
    ...members.map(member => ({ value: member._id, label: member.name })),
  ];
  // A shared link can name someone who has since left the workspace
  if (filters.actor && !actorOptions.some(option => option.value === filters.actor)) {
    actorOptions.push({ value: filters.actor, label: 'Former member' });
  }

  return (
    <div className="space-y-4">
      <div role="group" aria-label="Filter by area" className="flex flex-wrap gap-2">
        {areas.map(area => {
          const active = filters.area === area.value;
          return (
            <button
              key={area.value || 'all'}
              type="button"
              aria-pressed={active}
              onClick={() => onChange({ ...filters, area: area.value })}
              className={cn(
                CHIP,
                active
                  ? 'border-primary bg-primary text-white'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
              )}
            >
              {area.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex flex-col gap-1.5 sm:w-64">
          <label htmlFor="audit-actor" className="text-xs font-semibold uppercase tracking-wide text-slate-600">Actor</label>
          <OptionSelect
            id="audit-actor"
            aria-label="Actor"
            value={filters.actor || ALL_ACTORS}
            options={actorOptions}
            onChange={value => onChange({ ...filters, actor: value === ALL_ACTORS ? '' : value })}
            className="h-10 md:h-9"
          />
        </div>
        {hasActiveFilters(filters) && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => onChange({ area: '', actor: '' })}
            className="h-10 gap-2 px-3 text-sm text-slate-700 md:h-9"
          >
            <FilterX aria-hidden />
            Clear filters
          </Button>
        )}
      </div>
    </div>
  );
};
