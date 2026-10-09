import { Link } from 'react-router-dom';
import { CheckCircle2, Circle } from 'lucide-react';
import { ProgressBar, SectionHeader, Surface } from '@/components/ds';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { markBoardTried, type ChecklistStep, type StepId } from './getStarted';

interface GetStartedChecklistProps {
  steps: ChecklistStep[];
  workspaceSlug: string;
}

const COPY: Record<StepId, { title: string; description: string; action: string; to: (slug: string) => string }> = {
  task: {
    title: 'Create your first task',
    description: 'Add a title and a due date. Everything else is optional.',
    action: 'Create task',
    to: (slug) => `/${slug}/tasks?view=list`,
  },
  invite: {
    title: 'Invite a teammate',
    description: 'Send an invitation by email and choose what they can do.',
    action: 'Invite teammate',
    to: (slug) => `/${slug}/team`,
  },
  board: {
    title: 'Try the board view',
    description: 'See your tasks as columns and drag them between statuses.',
    action: 'Open board',
    to: (slug) => `/${slug}/tasks?view=board`,
  },
};

/** Three-step onboarding card. Each step ticks from real workspace data (see getStarted.ts). */
const GetStartedChecklist = ({ steps, workspaceSlug }: GetStartedChecklistProps) => {
  const doneCount = steps.filter((step) => step.done).length;

  return (
    <Surface as="section" aria-labelledby="get-started-heading" className="sm:p-6">
      <SectionHeader
        className="mb-2"
        title={<span id="get-started-heading">Get started with TaskMan</span>}
        action={
          <span className="text-xs font-medium tabular-nums text-slate-600">
            {doneCount} of {steps.length} done
          </span>
        }
      />
      <ProgressBar
        value={(doneCount / steps.length) * 100}
        label={`Setup progress: ${doneCount} of ${steps.length} steps done`}
        className="mb-4"
      />

      <ol className="divide-y divide-slate-100">
        {steps.map(({ id, done }) => {
          const copy = COPY[id];
          return (
            <li key={id} className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div className="flex min-w-0 items-start gap-3">
                {done ? (
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden />
                ) : (
                  <Circle className="mt-0.5 size-5 shrink-0 text-slate-400" aria-hidden />
                )}
                <div className="min-w-0">
                  <p className={cn('text-sm font-semibold', done ? 'text-slate-600' : 'text-slate-900')}>
                    {copy.title}
                    <span className="sr-only">{done ? ' (done)' : ' (not done yet)'}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-slate-600">{copy.description}</p>
                </div>
              </div>
              {!done && (
                <Link
                  to={copy.to(workspaceSlug)}
                  onClick={id === 'board' ? () => markBoardTried(workspaceSlug) : undefined}
                  className={buttonVariants({
                    variant: 'outline',
                    className: 'h-10 shrink-0 rounded-lg border-slate-300 px-4 text-sm text-slate-800 shadow-none hover:bg-slate-50 max-sm:w-full sm:h-9',
                  })}
                >
                  {copy.action}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </Surface>
  );
};

export default GetStartedChecklist;
