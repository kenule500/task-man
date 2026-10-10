import { Zap } from 'lucide-react';
import { EmptyState } from '@/components/ds';
import { cn } from '@/lib/utils';
import { StatusBadge, describeEpicProgress, epicProgress, type Task } from '@/features/tasks';
import { formatSprintRange } from '../lib/sprintStats';
import QuickAdd from './QuickAdd';

interface EpicsPanelProps {
  /** Epics of the project, in the order to show. */
  epics: Task[];
  /** Tasks of the project (the epics' items are found among them). */
  tasks: Task[];
  canWrite: boolean;
  /** Opens the epic (its details list the items). */
  onOpen: (epic: Task) => void;
  /** Quick-adds an epic by title; the quick-add is hidden without it. */
  onAdd?: (title: string) => Promise<unknown>;
}

const openButtonClass = 'text-left outline-none after:absolute after:inset-0 focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-primary';

/** Epics of a project with rolled-up progress (items and points done), the date span of their items and a click-through. */
const EpicsPanel = ({ epics, tasks, canWrite, onOpen, onAdd }: EpicsPanelProps) => (
  <div>
    {canWrite && onAdd && <QuickAdd label="Add an epic…" onAdd={onAdd} />}
    {epics.length === 0 ? (
      <EmptyState
        className="py-10"
        icon={<Zap />}
        title="No epics yet"
        description={canWrite
          ? 'An epic groups stories, tasks and bugs that belong together, across sprints. Add one above, then choose it on the items.'
          : 'Epics group stories, tasks and bugs that belong together, across sprints.'}
      />
    ) : (
      <ul aria-label="Epics">
        {epics.map(epic => {
          const progress = epicProgress(epic, tasks);
          const summary = describeEpicProgress(progress);
          const complete = progress.items > 0 && progress.percent === 100;
          return (
            <li key={epic._id} className="relative border-b border-slate-100 px-3 py-3 last:border-b-0 hover:bg-slate-50 sm:px-4">
              <div className="flex items-start gap-2">
                <Zap aria-hidden className="mt-0.5 size-4 shrink-0 text-fuchsia-700" />
                <button
                  type="button"
                  onClick={() => onOpen(epic)}
                  className={cn(openButtonClass, 'min-h-8 min-w-0 flex-1 text-sm font-semibold text-slate-900 [overflow-wrap:anywhere] md:min-h-0')}
                >
                  {epic.title}
                </button>
                <StatusBadge status={epic.status} className="shrink-0 px-2 py-0.5" />
              </div>
              <div className="mt-2 flex items-center gap-3 pl-6">
                <div
                  role="progressbar"
                  aria-label={`${epic.title} progress`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progress.percent}
                  aria-valuetext={summary}
                  className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100"
                >
                  <div
                    className={cn('h-full rounded-full', complete ? 'bg-emerald-500' : 'bg-fuchsia-600')}
                    style={{ width: `${progress.percent}%` }}
                  />
                </div>
                <span className="w-10 shrink-0 text-right text-xs font-semibold tabular-nums text-slate-700">{progress.percent}%</span>
              </div>
              <p className="mt-1.5 pl-6 text-xs text-slate-600">
                {progress.items === 0 ? 'No items yet' : summary}
                <span aria-hidden className="mx-1.5 text-slate-300">|</span>
                <span className="tabular-nums">{formatSprintRange({ startDate: progress.start, endDate: progress.end })}</span>
              </p>
            </li>
          );
        })}
      </ul>
    )}
  </div>
);

export default EpicsPanel;
