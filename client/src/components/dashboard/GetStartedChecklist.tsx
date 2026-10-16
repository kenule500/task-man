import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ProgressBar, SectionHeader, Stepper, Surface, type StepperStep } from '@/components/ds';
import { buttonVariants } from '@/components/ui/button';
import { markBoardTried, type ChecklistStep, type StepId } from './getStarted';

interface GetStartedChecklistProps {
  steps: ChecklistStep[];
  workspaceSlug: string;
}

const TARGETS: Record<StepId, (slug: string) => string> = {
  task: (slug) => `/${slug}/tasks?view=list`,
  invite: (slug) => `/${slug}/team`,
  board: (slug) => `/${slug}/tasks?view=board`,
};

/** Three-step onboarding card. Each step ticks from real workspace data (see getStarted.ts). */
const GetStartedChecklist = ({ steps, workspaceSlug }: GetStartedChecklistProps) => {
  const { t } = useTranslation('dashboard');
  const doneCount = steps.filter((step) => step.done).length;
  const firstOpen = steps.findIndex((step) => !step.done);
  const stepperSteps: StepperStep[] = steps.map(({ id, done }) => {
    return {
      id,
      title: t(`getStarted.${id}.title`),
      description: t(`getStarted.${id}.description`),
      complete: done,
      action: done ? undefined : (
        <Link
          to={TARGETS[id](workspaceSlug)}
          onClick={id === 'board' ? () => markBoardTried(workspaceSlug) : undefined}
          className={buttonVariants({
            variant: 'outline',
            className: 'h-10 shrink-0 rounded-lg border-slate-300 px-4 text-sm text-slate-800 shadow-none hover:bg-slate-50 max-sm:w-full sm:h-9',
          })}
        >
          {t(`getStarted.${id}.action`)}
        </Link>
      ),
    };
  });

  return (
    <Surface as="section" aria-labelledby="get-started-heading" className="sm:p-6">
      <SectionHeader
        className="mb-2"
        title={<span id="get-started-heading">{t('getStarted.title')}</span>}
        action={
          <span className="text-xs font-medium tabular-nums text-slate-600">
            {t('getStarted.done', { done: doneCount, total: steps.length })}
          </span>
        }
      />
      <ProgressBar
        value={(doneCount / steps.length) * 100}
        label={t('getStarted.progress', { done: doneCount, total: steps.length })}
        className="mb-4"
      />

      <Stepper steps={stepperSteps} current={firstOpen === -1 ? steps.length : firstOpen} orientation="vertical" label={t('getStarted.steps')} />
    </Surface>
  );
};

export default GetStartedChecklist;
