import { UserAvatar } from '@/components/ds';
import { actorName, describeEntry, formatTime, groupByDay } from '../lib/format';
import type { AuditEntry } from '../types';
import { ActionBadge } from './ActionBadge';

interface AuditListProps {
  entries: AuditEntry[];
  onSelect: (entry: AuditEntry) => void;
  /** Overridable for tests: decides the "Today" and "Yesterday" labels. */
  now?: Date;
}

/** Phone view: entries grouped by day; each is one tap target that opens the detail sheet. */
export const AuditList = ({ entries, onSelect, now }: AuditListProps) => (
  <div className="space-y-5">
    {groupByDay(entries, now).map(group => (
      <section key={group.key} aria-labelledby={`audit-day-${group.key}`}>
        <h2 id={`audit-day-${group.key}`} className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
          {group.label}
        </h2>
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {group.entries.map(entry => (
            <li key={entry._id}>
              <button
                type="button"
                onClick={() => onSelect(entry)}
                className="flex min-h-14 w-full items-start gap-3 px-3 py-3 text-left outline-none hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
              >
                <UserAvatar name={actorName(entry)} src={entry.actor?.avatarUrl} size="md" className="mt-0.5" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-slate-900 [overflow-wrap:anywhere]">{describeEntry(entry)}</span>
                  <span className="mt-1.5 flex"><ActionBadge action={entry.action} /></span>
                </span>
                <time dateTime={entry.createdAt} className="shrink-0 pt-0.5 text-xs tabular-nums text-slate-600">
                  {formatTime(entry.createdAt)}
                </time>
              </button>
            </li>
          ))}
        </ul>
      </section>
    ))}
  </div>
);
