import { useId, useMemo, useState } from 'react';
import { FolderKanban, FolderPlus, RefreshCw, Rocket, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import ConfirmActionDialog from '@/components/ConfirmActionDialog';
import { Alert, Banner, IconTile, Surface, toast } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatNumber } from '@/i18n/format';
import type { Project } from '@/features/projects';
import { countCriteria, countSubtasks, planProblems, type PlanProblem } from '../lib/plan';
import { destinationTarget, targetLabel, targetProblem } from '../lib/destination';
import { describeApiError } from '../lib/errors';
import type { AiPlan, PlanApiError, PlanContent, PlanDestination, PlanItem } from '../types';
import type { PlanActions } from './actions';
import { DestinationPicker } from './DestinationPicker';
import { CriteriaPanel, SubtasksPanel, TasksPanel } from './ListPanels';
import { NotesPanel } from './NotesPanel';
import { PlanHeader } from './PlanHeader';
import { SprintsPanel } from './SprintsPanel';

type TabValue = 'sprints' | 'tasks' | 'subtasks' | 'criteria';

interface ReviewStepProps {
  plan: AiPlan;
  draft: PlanContent;
  dirty: boolean;
  actions: PlanActions;
  creating: boolean;
  createError: PlanApiError | null;
  /** The document is still held in this tab, so the plan can be generated again. */
  canRegenerate: boolean;
  slug?: string;
  projects?: Project[];
  projectsLoading?: boolean;
  destination?: PlanDestination;
  targetProjectId?: string | null;
  onDestinationChange?: (destination: PlanDestination, targetProjectId: string | null) => void;
  onCreate: () => void;
  onRegenerate: () => void;
  onDiscard: () => void;
  onDismissError: () => void;
}

const problemText = (problem: PlanProblem, t: (key: string, options?: Record<string, unknown>) => string): string => {
  switch (problem.kind) {
    case 'projectName': return t('review.problems.projectName');
    case 'projectKey': return t('review.problems.projectKey');
    case 'noItems': return t('review.problems.noItems');
    case 'sprintName': return t('review.problems.sprintName', { number: problem.index + 1 });
    case 'itemTitle': return t('review.problems.itemTitle');
    case 'subtaskTitle': return t('review.problems.subtaskTitle');
    default: return t('review.problems.criterion');
  }
};

/** Step 3 (and 4 while the project is being created): look the generated project over, change it, then create it. */
export const ReviewStep = ({
  plan, draft, dirty, actions, creating, createError, canRegenerate, slug = '', projects = [], projectsLoading = false,
  destination: destinationProp, targetProjectId: targetProjectIdProp, onDestinationChange = () => undefined,
  onCreate, onRegenerate, onDiscard, onDismissError,
}: ReviewStepProps) => {
  const { t } = useTranslation('aiPlan');
  const [tab, setTab] = useState<TabValue>('sprints');
  const [confirm, setConfirm] = useState<'regenerate' | 'discard' | 'add' | null>(null);
  const [changingDestination, setChangingDestination] = useState(false);
  const destinationPanelId = useId();
  const targetProjectId = targetProjectIdProp ?? plan.options.targetProjectId ?? null;
  const destination = destinationProp ?? (targetProjectId ? 'existing' : 'new');
  const existing = destination === 'existing';
  // Only the target stored on the plan has a server-resolved record; a newly picked one comes from the directory.
  const storedTargetId = plan.options.targetProjectId ?? null;
  const serverTarget = targetProjectId === storedTargetId ? plan.targetProject : undefined;
  const target = destinationTarget(projects, targetProjectId, serverTarget);
  const targetIssue = targetProblem(destination, targetProjectId, projects, serverTarget);
  const targetIssueText = targetIssue ? t(`destination.problems.${targetIssue}`) : undefined;
  const targetName = target?.name ?? t('review.unknownTarget');
  const problems = useMemo(() => planProblems(draft, { existingProject: existing }), [draft, existing]);
  const subtasks = countSubtasks(draft);
  const criteria = countCriteria(draft);
  const taskCount = draft.epics.length + draft.items.length;
  const itemCount = draft.items.length + subtasks;

  const remove = (item: PlanItem) => {
    const before = draft;
    actions.removeItem(item.ref);
    toast({
      title: t('review.removed', { title: item.title }),
      duration: 6000,
      action: { label: t('review.undo'), onClick: () => actions.replace(before) },
    });
  };

  const nameTaken = createError?.code === 'PROJECT_NAME_TAKEN';
  const keyTaken = createError?.code === 'PROJECT_KEY_TAKEN';
  const otherError = createError && !nameTaken && !keyTaken ? createError : null;
  const otherErrorText = otherError
    ? (otherError.code.startsWith('TARGET_') || otherError.status === 404 ? describeApiError(otherError, t) : otherError.message)
    : undefined;

  const ask = (action: 'regenerate' | 'discard') => (dirty ? setConfirm(action) : action === 'regenerate' ? onRegenerate() : onDiscard());

  const buttons = () => (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
      <Button
        type="button"
        variant="ghost"
        onClick={() => ask('discard')}
        disabled={creating}
        className="h-11 gap-2 rounded-lg text-text-body sm:h-9"
      >
        <Trash2 aria-hidden className="size-4" /> {t('review.discard')}
      </Button>
      <Button
        type="button"
        variant="outline"
        onClick={() => ask('regenerate')}
        disabled={creating || !canRegenerate}
        title={canRegenerate ? undefined : t('review.regenerateUnavailable')}
        className="h-11 gap-2 rounded-lg sm:h-9"
      >
        <RefreshCw aria-hidden className="size-4" /> {t('review.regenerate')}
      </Button>
      <Button
        type="button"
        onClick={() => (existing ? setConfirm('add') : onCreate())}
        disabled={creating || problems.length > 0 || Boolean(targetIssue)}
        aria-busy={creating}
        className="h-11 gap-2 rounded-lg bg-primary text-white shadow-sm hover:bg-primary-hover sm:h-9"
      >
        <Rocket aria-hidden className="size-4" />
        {creating
          ? t('review.creating')
          : existing
            ? t('review.add', { count: itemCount, target: targetName })
            : t('review.create', { count: itemCount })}
      </Button>
    </div>
  );

  return (
    <div className="space-y-4">
      {plan.source.truncated && (
        <Banner tone="warning" title={t('review.partialTitle')}>
          {t('review.partialBody', { chars: formatNumber(plan.source.chars) })}
        </Banner>
      )}

      {/* Where the plan goes: a new project or one the workspace already uses */}
      <Surface as="section" aria-label={t('review.destinationLabel')} padding="md" className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <IconTile tone={existing ? 'primary' : 'neutral'} size="md">
              {existing ? <FolderKanban className="size-5" /> : <FolderPlus className="size-5" />}
            </IconTile>
            <div className="min-w-0 space-y-0.5">
              <p className="text-xs font-medium uppercase tracking-wide text-text-subtle">
                {existing ? t('review.destinationExisting') : t('review.destinationNew')}
              </p>
              <p className="break-words text-base font-semibold text-text-strong">
                {existing ? (target ? targetLabel(target) : t('review.unknownTarget')) : draft.project.name}
              </p>
              <p className="text-sm text-text-body">
                {existing ? t('review.destinationExistingHint') : t('review.destinationNewHint')}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => setChangingDestination(value => !value)}
            aria-expanded={changingDestination}
            aria-controls={changingDestination ? destinationPanelId : undefined}
            disabled={creating}
            className="h-11 shrink-0 gap-2 rounded-lg sm:h-9"
          >
            {changingDestination ? t('review.doneChanging') : t('review.changeDestination')}
          </Button>
        </div>
        {existing && targetIssueText && (
          <p role="alert" className="text-sm font-medium text-danger-fg">{targetIssueText}</p>
        )}
        {changingDestination && (
          <div id={destinationPanelId} className="border-t border-border pt-3">
            <DestinationPicker
              slug={slug}
              destination={destination}
              onDestinationChange={value => onDestinationChange(value, value === 'existing' ? targetProjectId : null)}
              targetProjectId={targetProjectId}
              onTargetChange={value => onDestinationChange('existing', value)}
              projects={projects}
              projectsLoading={projectsLoading}
              serverTarget={serverTarget}
              disabled={creating}
            />
          </div>
        )}
      </Surface>

      <PlanHeader
        plan={draft}
        source={plan.source}
        actions={actions}
        destination={destination}
        target={target}
        nameProblem={nameTaken ? createError.message : undefined}
        keyProblem={keyTaken ? createError.message : undefined}
      />

      {(nameTaken || keyTaken) && createError?.suggestion && (
        <Alert tone="warning" title={nameTaken ? t('review.nameTakenTitle') : t('review.keyTakenTitle')} onDismiss={onDismissError}>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              actions.updateProject(nameTaken ? { name: createError.suggestion } : { key: createError.suggestion });
              onDismissError();
            }}
            className="mt-1 h-10 rounded-lg sm:h-8"
          >
            {t(nameTaken ? 'review.useName' : 'review.useKey', { value: createError.suggestion })}
          </Button>
        </Alert>
      )}
      {otherError && (
        <Alert tone="error" title={existing ? t('review.addFailedTitle') : t('review.createFailedTitle')} onDismiss={onDismissError}>
          {otherErrorText}
        </Alert>
      )}

      {problems.length > 0 && (
        <Alert tone="warning" title={t('review.problemsTitle', { count: problems.length })}>
          <ul className="list-disc ps-4">
            {[...new Set(problems.map(problem => problemText(problem, t)))].map(text => <li key={text}>{text}</li>)}
          </ul>
        </Alert>
      )}

      <p className="text-sm text-text-subtle">{t('review.hint')}</p>
      {buttons()}

      <Tabs value={tab} onValueChange={value => setTab(value as TabValue)} className="gap-4">
        <div className="-mx-1 overflow-x-auto px-1">
          <TabsList aria-label={t('review.tabsLabel')} className="w-max group-data-horizontal/tabs:h-11 sm:group-data-horizontal/tabs:h-9">
            <TabsTrigger value="sprints" className="px-3">{t('review.tabs.sprints')} <span className="tabular-nums text-text-body">{draft.sprints.length}</span></TabsTrigger>
            <TabsTrigger value="tasks" className="px-3">{t('review.tabs.tasks')} <span className="tabular-nums text-text-body">{draft.items.length}</span></TabsTrigger>
            <TabsTrigger value="subtasks" className="px-3">{t('review.tabs.subtasks')} <span className="tabular-nums text-text-body">{subtasks}</span></TabsTrigger>
            <TabsTrigger value="criteria" className="px-3">{t('review.tabs.criteria')} <span className="tabular-nums text-text-body">{criteria}</span></TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="sprints"><SprintsPanel plan={draft} weeks={plan.options.sprintLengthWeeks} actions={actions} onRemove={remove} /></TabsContent>
        <TabsContent value="tasks"><TasksPanel plan={draft} actions={actions} onRemove={remove} /></TabsContent>
        <TabsContent value="subtasks"><SubtasksPanel plan={draft} actions={actions} /></TabsContent>
        <TabsContent value="criteria"><CriteriaPanel plan={draft} actions={actions} /></TabsContent>
      </Tabs>

      <NotesPanel assumptions={draft.assumptions} risks={draft.risks} />
      {buttons()}

      <ConfirmActionDialog
        open={confirm !== null}
        onOpenChange={open => !open && setConfirm(null)}
        title={confirm === 'regenerate'
          ? t('review.confirmRegenerateTitle')
          : confirm === 'add'
            ? t('review.confirmAddTitle', { target: targetName })
            : t('review.confirmDiscardTitle')}
        description={confirm === 'regenerate'
          ? t('review.confirmRegenerateBody')
          : confirm === 'add'
            ? `${t('review.confirmAddBody', { target: targetName })} ${t('review.confirmAddCounts', {
              sprints: draft.sprints.length, tasks: taskCount, subtasks, criteria,
            })}`
            : t('review.confirmDiscardBody')}
        confirmLabel={confirm === 'regenerate'
          ? t('review.regenerate')
          : confirm === 'add'
            ? t('review.confirmAddAction', { count: itemCount })
            : t('review.discard')}
        onConfirm={() => {
          const action = confirm;
          setConfirm(null);
          if (action === 'regenerate') onRegenerate();
          else if (action === 'add') onCreate();
          else onDiscard();
        }}
      />
    </div>
  );
};
