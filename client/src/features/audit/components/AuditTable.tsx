import { useTranslation } from 'react-i18next';
import { UserAvatar } from '@/components/ds';
import { cn } from '@/lib/utils';
import { actorName, areaLabel, describeEntry, formatDateTime, summarizeChanges } from '../lib/format';
import type { AuditEntry } from '../types';
import { ActionBadge } from './ActionBadge';

interface AuditTableProps {
  entries: AuditEntry[];
  selectedId?: string;
  onSelect: (entry: AuditEntry) => void;
}

const HEAD = 'sticky top-0 z-(--z-sticky) border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-600';
const CELL = 'px-4 py-3 align-top';

/** Desktop view: one row per entry inside a scroll region with a sticky header. A row opens the detail sheet. */
export const AuditTable = ({ entries, selectedId, onSelect }: AuditTableProps) => {
  const { t } = useTranslation('settings');
  return (
  <div
    role="region"
    aria-label={t('audit.table.entries')}
    tabIndex={0}
    className="relative max-h-[65dvh] overflow-auto overscroll-contain rounded-xl border border-slate-200 bg-white outline-none [scrollbar-width:thin] focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
  >
    <table className="w-full min-w-[60rem] border-collapse text-start text-sm">
      <caption className="sr-only">{t('audit.table.caption')}</caption>
      <thead>
        <tr>
          <th scope="col" className={cn(HEAD, 'w-44')}>{t('audit.table.time')}</th>
          <th scope="col" className={cn(HEAD, 'w-48')}>{t('audit.sheet.actor')}</th>
          <th scope="col" className={cn(HEAD, 'w-48')}>{t('audit.sheet.action')}</th>
          <th scope="col" className={HEAD}>{t('audit.sheet.subject')}</th>
          <th scope="col" className={HEAD}>{t('audit.sheet.changes')}</th>
          <th scope="col" className={cn(HEAD, 'w-36')}>{t('audit.table.ip')}</th>
        </tr>
      </thead>
      <tbody>
        {entries.map(entry => {
          const name = actorName(entry);
          const changes = summarizeChanges(entry.changes);
          return (
            <tr
              key={entry._id}
              onClick={() => onSelect(entry)}
              aria-selected={selectedId === entry._id || undefined}
              className={cn(
                'cursor-pointer border-b border-slate-100 last:border-b-0 hover:bg-slate-50 focus-within:bg-slate-50',
                selectedId === entry._id && 'bg-primary/5',
              )}
            >
              <td className={cn(CELL, 'whitespace-nowrap tabular-nums text-slate-700')}>
                <button
                  type="button"
                  onClick={event => { event.stopPropagation(); onSelect(entry); }}
                  className="rounded text-start outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                >
                  <time dateTime={entry.createdAt}>{formatDateTime(entry.createdAt)}</time>
                  <span className="sr-only">. {t('audit.table.openDetails', { description: describeEntry(entry) })}</span>
                </button>
              </td>
              <td className={CELL}>
                <div className="flex min-w-0 items-center gap-2">
                  <UserAvatar name={name} src={entry.actor?.avatarUrl} size="sm" />
                  <span className={cn('truncate text-slate-900', !entry.actor && 'italic text-slate-600')} title={name}>{name}</span>
                </div>
              </td>
              <td className={CELL}><ActionBadge action={entry.action} /></td>
              <td className={cn(CELL, 'max-w-64')}>
                <p className="truncate font-medium text-slate-900" title={entry.summary || undefined}>{entry.summary || '–'}</p>
                <p className="text-xs text-slate-600">{areaLabel(entry.action)}</p>
              </td>
              <td className={cn(CELL, 'max-w-80 text-slate-700')}>
                {changes ? <span className="line-clamp-2 break-words" title={changes}>{changes}</span> : <span className="text-slate-500">–</span>}
              </td>
              <td className={cn(CELL, 'whitespace-nowrap font-mono text-xs tabular-nums text-slate-700')}>{entry.ip || '–'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
  );
};
