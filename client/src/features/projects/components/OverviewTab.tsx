import type { ReactNode } from 'react';
import { BarChart3, CalendarClock } from 'lucide-react';
import { EmptyState, SectionHeader, Surface } from '@/components/ds';
import {
  DueDate, STATUS_META, StatusBadge, TASK_STATUSES, type Task,
} from '@/features/tasks';
import type { Sprint } from '../types';
import { TASK_TYPE_META } from '../lib/icons';
import { TASK_TYPES, countByStatus, countByType, upcomingDeadlines } from '../lib/summary';
import { averageVelocity, sprintVelocities } from '../lib/velocity';
import VelocityChart from './VelocityChart';

interface OverviewTabProps {
  tasks: Task[];
  sprints: Sprint[];
  onOpenTask: (task: Task) => void;
}

interface BarRowProps {
  label: ReactNode;
  count: number;
  total: number;
  barClass: string;
}

/** Label, count and a proportional bar. The number carries the meaning; the bar is decoration. */
const BarRow = ({ label, count, total, barClass }: BarRowProps) => (
  <li className="grid grid-cols-[6.5rem_1fr_2rem] items-center gap-3 text-sm sm:grid-cols-[8rem_1fr_2.5rem]">
    <span className="truncate text-slate-700">{label}</span>
    <span aria-hidden className="h-2 overflow-hidden rounded-full bg-slate-100">
      <span className={`block h-full rounded-full ${barClass}`} style={{ width: `${total === 0 ? 0 : Math.round((count / total) * 100)}%` }} />
    </span>
    <span className="text-right font-semibold tabular-nums text-slate-900">{count}</span>
  </li>
);

/** Velocity per sprint, how work splits by status and type, and what is due next. */
const OverviewTab = ({ tasks, sprints, onOpenTask }: OverviewTabProps) => {
  const topLevel = tasks.filter(task => !task.parent);
  const velocities = sprintVelocities(sprints);
  const average = averageVelocity(sprints);
  const byStatus = countByStatus(tasks);
  const byType = countByType(tasks);
  const upcoming = upcomingDeadlines(tasks);

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <Surface as="section" aria-labelledby="overview-velocity" className="lg:col-span-2">
        <SectionHeader title={<span id="overview-velocity">Velocity</span>} icon={<BarChart3 aria-hidden className="size-4 text-slate-500" />} />
        {velocities.length === 0 ? (
          <EmptyState
            className="py-8"
            icon={<BarChart3 />}
            title="No completed sprints yet"
            description="Velocity shows the story points each sprint delivered. Complete a sprint to start the chart."
          />
        ) : (
          <VelocityChart velocities={velocities} average={average} />
        )}
      </Surface>

      <Surface as="section" aria-labelledby="overview-status">
        <SectionHeader title={<span id="overview-status">By status</span>} count={topLevel.length} />
        <ul className="space-y-3">
          {TASK_STATUSES.map(status => (
            <BarRow key={status} label={STATUS_META[status].label} count={byStatus[status]} total={topLevel.length} barClass={STATUS_META[status].dot} />
          ))}
        </ul>
      </Surface>

      <Surface as="section" aria-labelledby="overview-type">
        <SectionHeader title={<span id="overview-type">By type</span>} count={topLevel.length} />
        <ul className="space-y-3">
          {TASK_TYPES.map(type => {
            const meta = TASK_TYPE_META[type];
            const Icon = meta.icon;
            return (
              <BarRow
                key={type}
                label={<span className="inline-flex items-center gap-1.5"><Icon aria-hidden className={`size-4 ${meta.color}`} />{meta.label}</span>}
                count={byType[type]}
                total={topLevel.length}
                barClass={meta.bar}
              />
            );
          })}
        </ul>
      </Surface>

      <Surface as="section" aria-labelledby="overview-deadlines" className="lg:col-span-2">
        <SectionHeader title={<span id="overview-deadlines">Upcoming deadlines</span>} icon={<CalendarClock aria-hidden className="size-4 text-slate-500" />} />
        {upcoming.length === 0 ? (
          <p className="text-sm text-slate-600">Nothing is waiting. Every task in this project is done.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {upcoming.map(task => (
              <li key={task._id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2.5">
                <button
                  type="button"
                  onClick={() => onOpenTask(task)}
                  className="min-h-11 min-w-0 flex-1 truncate rounded text-left text-sm font-medium text-slate-900 hover:underline focus-visible:outline-2 focus-visible:outline-primary md:min-h-0"
                >
                  {task.title}
                </button>
                <span className="flex shrink-0 items-center gap-3">
                  <StatusBadge status={task.status} className="px-2 py-0.5" />
                  <DueDate deadline={task.deadline} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Surface>
    </div>
  );
};

export default OverviewTab;
