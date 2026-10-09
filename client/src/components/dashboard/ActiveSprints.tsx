import { Link } from 'react-router-dom';
import { Timer } from 'lucide-react';
import { ProgressBar, SectionHeader, Surface, Tag } from '@/components/ds';
import { cn } from '@/lib/utils';
import type { Project } from '@/features/projects';
import type { Task } from '@/features/tasks';
import { daysLeftLabel, summarizeActiveSprints } from './sprintSummary';

// Dot color of each project palette entry (see features/projects PROJECT_COLORS)
const PROJECT_DOT: Record<Project['color'], string> = {
  blue: 'bg-blue-600', violet: 'bg-violet-600', rose: 'bg-rose-600', orange: 'bg-orange-600',
  amber: 'bg-amber-500', emerald: 'bg-emerald-600', teal: 'bg-teal-600', slate: 'bg-slate-600',
};

interface ActiveSprintsProps {
  projects: Project[];
  tasks: Task[];
  slug: string;
}

/** Dashboard panel: every running sprint with its progress and time left. Renders nothing when no sprint is active. */
const ActiveSprints = ({ projects, tasks, slug }: ActiveSprintsProps) => {
  const sprints = summarizeActiveSprints(projects, tasks);
  if (sprints.length === 0) return null;

  return (
    <Surface as="section" padding="sm" className="sm:p-5" aria-labelledby="active-sprints-heading">
      <SectionHeader
        title={<span id="active-sprints-heading">Active sprints</span>}
        count={sprints.length}
        icon={<Timer className="size-4 text-primary" aria-hidden />}
      />
      <ul className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
        {sprints.map(({ project, sprint, total, completed, points, completedPoints, progress, daysLeft }) => (
          <li key={sprint._id}>
            <Link
              to={`/${slug}/projects/${project._id}`}
              className="block rounded-xl border border-slate-100 p-4 transition-colors hover:border-slate-200 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-primary"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-xs font-medium text-slate-600">
                    <span aria-hidden className={cn('size-2 shrink-0 rounded-full', PROJECT_DOT[project.color] ?? PROJECT_DOT.blue)} />
                    <span className="truncate">{project.name}</span>
                  </p>
                  <p className="mt-1 truncate text-sm font-semibold text-slate-900">{sprint.name}</p>
                </div>
                <Tag tone={daysLeft < 0 ? 'danger' : daysLeft <= 2 ? 'warning' : 'neutral'} size="sm" className="shrink-0">
                  {daysLeftLabel(daysLeft)}
                </Tag>
              </div>
              {sprint.goal && <p className="mt-1 line-clamp-2 text-xs text-slate-600">{sprint.goal}</p>}
              <ProgressBar value={progress} label={`${sprint.name} progress`} className="mt-3" />
              <p className="mt-2 text-xs tabular-nums text-slate-600">
                {completed}/{total} items done
                {points > 0 && <> · {completedPoints}/{points} points</>}
                {' · '}
                <span className="font-semibold text-slate-900">{progress}%</span>
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </Surface>
  );
};

export default ActiveSprints;
