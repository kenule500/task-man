import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ShieldAlert } from 'lucide-react';
import AppShell from '@/components/AppShell';
import { Alert, EmptyState, PageHeader, SkeletonDetail, Stepper, Surface, toast } from '@/components/ds';
import { usePermissions } from '@/hooks/usePermissions';
import { useProjectDirectory } from '@/features/projects';
import { useAiSettings } from '@/features/ai-review';
import {
  AnalyzingStep, ReviewStep, UploadStep, aiPlanApi, describeFailure, planActions, useAiProjectPlan, useRecentPlans, type AiPlan,
} from '@/features/ai-plan';

const STEP_INDEX = { upload: 0, analyzing: 1, review: 2, creating: 3 } as const;

/** Create a project from a requirements document: upload, wait for the AI, review the plan, create everything. */
const AiProjectPage = () => {
  const { t } = useTranslation('aiPlan');
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { can } = usePermissions();
  const allowed = can('projects:write') && can('tasks:write');
  const ai = useAiSettings(allowed ? workspaceSlug : undefined);
  const directory = useProjectDirectory();

  // The plan id lives in the address, so a reload (or the back button) comes back to the same plan
  const keepPlanInAddress = useCallback((id: string | null) => {
    setSearchParams(current => {
      const next = new URLSearchParams(current);
      if (id) next.set('plan', id);
      else next.delete('plan');
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const flow = useAiProjectPlan(allowed ? workspaceSlug : undefined, { onPlanId: keepPlanInAddress });
  const recent = useRecentPlans(workspaceSlug, allowed && flow.phase === 'upload' && !flow.loading);
  const { resume } = flow;

  const openProject = useCallback((projectId: string) => {
    if (workspaceSlug) navigate(`/${workspaceSlug}/projects/${projectId}`, { replace: true });
  }, [navigate, workspaceSlug]);

  // Only the plan id the page was opened with is resumed; ids written later by this page itself are not
  const openedWith = useRef(searchParams.get('plan'));
  const resumed = useRef(false);
  useEffect(() => {
    const id = openedWith.current;
    if (!allowed || !id || resumed.current) return;
    resumed.current = true;
    void resume(id).then(projectId => { if (projectId) openProject(projectId); });
  }, [allowed, resume, openProject]);

  const actions = useMemo(() => planActions(flow.edit), [flow.edit]);

  const openRecent = (plan: AiPlan) => { void flow.resume(plan._id).then(projectId => { if (projectId) openProject(projectId); }); };
  const openActive = async () => {
    if (!workspaceSlug) return;
    try {
      const plans = await aiPlanApi.list(workspaceSlug);
      const active = plans.find(plan => plan.status === 'queued' || plan.status === 'running');
      if (active) await flow.resume(active._id);
    } catch {
      // The upload error stays on screen; nothing else to do
    }
  };

  const create = async () => {
    if (!workspaceSlug) return;
    const created = await flow.create();
    if (!created) return;
    void directory.reload();
    const added = created.destination === 'existing';
    toast.success({
      title: added ? t('page.added', { name: created.project.name }) : t('page.created', { name: created.project.name }),
      description: added
        ? t('page.addedBody', { tasks: created.counts.tasks, sprints: created.counts.sprints })
        : t('page.createdBody', { tasks: created.counts.tasks, sprints: created.counts.sprints }),
    });
    keepPlanInAddress(null);
    openProject(created.project._id);
  };

  const start = async (file: File, options: Parameters<typeof flow.start>[1]) => {
    const started = await flow.start(file, options);
    if (started) void ai.reload();
  };

  if (!workspaceSlug) return null;

  const failure = flow.plan?.status === 'failed' ? describeFailure(flow.plan, t) : '';

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-4xl space-y-5 pb-6">
        <Link
          to={`/${workspaceSlug}/projects`}
          className="inline-flex min-h-11 items-center gap-1 rounded-md text-sm text-text-body outline-none hover:text-text-strong focus-visible:ring-2 focus-visible:ring-primary sm:min-h-0"
        >
          <ChevronLeft aria-hidden className="size-4 rtl:-scale-x-100" /> {t('page.back')}
        </Link>

        <PageHeader title={t('page.title')} description={t('page.description')} />

        {!allowed ? (
          <Surface>
            <EmptyState headingLevel="h2" icon={<ShieldAlert />} title={t('page.noAccessTitle')} description={t('page.noAccessBody')} />
          </Surface>
        ) : (
          <>
            <Stepper
              label={t('page.stepsLabel')}
              size="sm"
              current={STEP_INDEX[flow.phase]}
              steps={[
                { id: 'upload', title: t('steps.upload') },
                { id: 'analyze', title: t('steps.analyze') },
                { id: 'review', title: t('steps.review') },
                { id: 'create', title: t('steps.create') },
              ]}
            />

            {flow.loading ? (
              <SkeletonDetail label={t('page.loading')} />
            ) : flow.phase === 'upload' ? (
              <UploadStep
                slug={workspaceSlug}
                settings={ai.settings}
                settingsLoading={ai.loading}
                settingsError={ai.error}
                onRetrySettings={ai.reload}
                canManageSettings={can('settings:manage')}
                projects={directory.projects}
                projectsLoading={directory.loading}
                initial={flow.request}
                busy={flow.uploading}
                error={flow.error}
                failure={failure}
                recent={recent.plans}
                onOpenRecent={openRecent}
                onOpenActive={() => { void openActive(); }}
                onStart={(file, options) => { void start(file, options); }}
              />
            ) : flow.phase === 'analyzing' && flow.plan ? (
              <>
                {flow.error && <Alert tone="error" onDismiss={flow.clearError}>{flow.error.message}</Alert>}
                <AnalyzingStep plan={flow.plan} cancelling={flow.cancelling} timedOut={flow.timedOut} onCancel={() => { void flow.discard(); }} />
              </>
            ) : flow.plan && flow.draft ? (
              <ReviewStep
                plan={flow.plan}
                draft={flow.draft}
                dirty={flow.dirty}
                actions={actions}
                creating={flow.creating}
                createError={flow.createError}
                canRegenerate={Boolean(flow.request)}
                slug={workspaceSlug}
                projects={directory.projects}
                projectsLoading={directory.loading}
                destination={flow.destination}
                targetProjectId={flow.targetProjectId}
                onDestinationChange={flow.changeDestination}
                onCreate={() => { void create(); }}
                onRegenerate={() => { void flow.regenerate(); }}
                onDiscard={() => { void flow.discard(); }}
                onDismissError={flow.clearCreateError}
              />
            ) : null}
          </>
        )}
      </div>
    </AppShell>
  );
};

export default AiProjectPage;
