import { Link } from 'react-router-dom';
import { ProgressBar, SectionHeader, Stepper, Surface, type StepperStep } from '@/components/ds';
import { buttonVariants } from '@/components/ui/button';
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
  const firstOpen = steps.findIndex((step) => !step.done);
  const stepperSteps: StepperStep[] = steps.map(({ id, done }) => {
    const copy = COPY[id];
    return {
      id,
      title: copy.title,
      description: copy.description,
      complete: done,
      action: done ? undefined : (
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
      ),
    };
  });

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

      <Stepper steps={stepperSteps} current={firstOpen === -1 ? steps.length : firstOpen} orientation="vertical" label="Setup steps" />
    </Surface>
  );
};

export default GetStartedChecklist;
