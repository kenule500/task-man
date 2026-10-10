import { Link } from 'react-router-dom';
import { CalendarDays } from 'lucide-react';
import { ProgressBar, Tag } from '@/components/ds';
import { ProjectFolderIcon } from '@/features/projects';
import { HEALTH_LABEL, formatSpan, type EpicHealth, type RoadmapEpic, type RoadmapGroup } from '../lib/roadmap';

const HEALTH_TONE: Record<EpicHealth, 'neutral' | 'primary' | 'success' | 'danger'> = {
  done: 'success',
  overdue: 'danger',
  'in-progress': 'primary',
  upcoming: 'neutral',
};

interface RoadmapListProps {
  groups: RoadmapGroup[];
  slug: string;
}

/** Phone roadmap: a vertical list per project with the date range and progress of each epic. */
const RoadmapList = ({ groups, slug }: RoadmapListProps) => (
  <div aria-label="Roadmap list" role="region" className="space-y-5 md:hidden">
    {groups.map(group => (
      <section key={group.id} aria-label={group.name}>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
          {group.project && <ProjectFolderIcon size="xs" color={group.project.color} icon={group.project.icon} />}
          {group.name}
        </h2>
        <ul className="space-y-3">
          {group.epics.map((epic: RoadmapEpic) => (
            <li key={epic.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <Link
                  to={`/${slug}/tasks?task=${encodeURIComponent(epic.id)}`}
                  className="-my-2 flex min-h-11 min-w-0 items-center rounded-lg text-sm font-semibold text-slate-900 outline-none hover:underline focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <span className="min-w-0 break-words">{epic.title}</span>
                </Link>
                <Tag tone={HEALTH_TONE[epic.health]} size="sm" className="shrink-0">{HEALTH_LABEL[epic.health]}</Tag>
              </div>
              <p className="mt-1 flex items-center gap-1.5 text-xs tabular-nums text-slate-600">
                <CalendarDays aria-hidden className="size-3.5" />
                {formatSpan(epic.start, epic.end)}
              </p>
              <ProgressBar className="mt-3" value={epic.percent} label={`${epic.title} progress`} showValue />
              <p className="mt-1 text-xs tabular-nums text-slate-600">
                {epic.items === 0
                  ? 'No items yet'
                  : `${epic.doneItems} of ${epic.items} ${epic.items === 1 ? 'item' : 'items'} done${epic.points > 0 ? ` · ${epic.donePoints} of ${epic.points} pts` : ''}`}
              </p>
            </li>
          ))}
        </ul>
      </section>
    ))}
  </div>
);

export default RoadmapList;
