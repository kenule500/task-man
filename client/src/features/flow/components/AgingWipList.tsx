import { AvatarStack, Tag } from '@/components/ds';
import { AGING_META, agingLevel, formatDays } from '../lib/flow';
import type { AgingItem } from '../types';

interface AgingWipListProps {
  items: AgingItem[];
  /** 85th percentile of cycle time: the baseline each task is judged against. */
  p85: number | null;
}

/** Work in progress, oldest first. The tag spells out what the color means. */
const AgingWipList = ({ items, p85 }: AgingWipListProps) => {
  if (items.length === 0) return <p className="text-sm text-slate-600">Nothing is in progress right now.</p>;

  return (
    <div>
      <p className="mb-2 text-xs text-slate-600">
        {p85 === null
          ? 'Complete a few tasks to get a baseline: tasks are judged against the 85th percentile of cycle time.'
          : `Judged against the 85th percentile of cycle time (${formatDays(p85)}): watch from ${formatDays(p85 / 2)}, over it beyond ${formatDays(p85)}.`}
      </p>
      <ul className="divide-y divide-slate-100">
        {items.map(item => {
          const level = agingLevel(item.days, p85);
          const meta = AGING_META[level];
          return (
            <li key={item.taskId} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:gap-3">
              <div className="flex min-w-0 flex-1 items-start gap-2">
                {item.key && <span className="shrink-0 pt-px font-mono text-xs font-medium text-slate-600">{item.key}</span>}
                <span className="min-w-0 break-words text-sm text-slate-800">{item.title}</span>
              </div>
              <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
                <AvatarStack people={item.assignees.map(person => ({ name: person.name, src: person.avatarUrl }))} max={3} />
                <span className="inline-flex items-center gap-2">
                  <span className="text-sm font-semibold tabular-nums text-slate-900">{formatDays(item.days)}</span>
                  <Tag tone={meta.tone} size="sm">{meta.label}</Tag>
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default AgingWipList;
