import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, FolderKanban, ShieldAlert } from 'lucide-react';
import AppShell from '@/components/AppShell';
import { Alert, EmptyState, PageHeader, SkeletonDetail, Stepper, Surface, toast } from '@/components/ds';
import { buttonVariants } from '@/components/ui/button';
import { usePermissions } from '@/hooks/usePermissions';
import { useProjectDirectory } from '@/features/projects';
import { useAiSettings } from '@/features/ai-review';
import {
  AnalyzingStep, ReviewStep, UploadStep, aiPlanApi, describeFailure, planActions, planBelongsToProject,
  useAiProjectPlan, useRecentPlans, type AiPlan,
} from '@/features/ai-plan';

const STEP_INDEX = { upload: 0, analyzing: 1, review: 2, creating: 3 } as const;

/**
 * Create a project from a requirements document: upload, wait for the AI, review the plan, create everything.
 * Opened from the Projects page (a new project) or from a project's page (the plan is added to that project).
 */
const AiProjectPage = () => {
  const { t } = useTranslation('aiPlan');
  const { workspaceSlug, projectId } = useParams<{ workspaceSlug: string; projectId?: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { can } = usePermissions();
  const allowed = can('projects:write') && can('tasks:write');
  const ai = useAiSettings(allowed ? workspaceSlug : undefined);
  const directory = useProjectDirectory();
  const projectScoped = Boolean(projectId);
  const project = projectId ? directory.projects.find(item => item._id === projectId) ?? null : null;

  // The plan id lives in the address, so a reload (or the back button) comes back to the same plan
  const keepPlanInAddress = useCallback((id: string | null) => {
    setSearchParams(current => {
      const next = new URLSearchParams(current);
      if (id) next.set('plan', id);
      else next.delete('plan');
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const flow = useAiProjectPlan(allowed ? workspaceSlug : undefined, {
    onPlanId: keepPlanInAddress,
    targetProjectId: projectId ?? null,
  });
  const recent = useRecentPlans(workspaceSlug, allowed && flow.phase === 'upload' && !flow.loading);
  const { resume } = flow;

  // Only plans started for this project can be picked up here; a new-project plan is not offered on a project page
  const recentPlans = useMemo(
    () => (projectId ? recent.plans.filter(plan => plan.options.targetProjectId === projectId) : recent.plans),
    [recent.plans, projectId],
  );

  const openProject = useCallback((id: string) => {
    if (workspaceSlug) navigate(`/${workspaceSlug}/projects/${id}`, { replace: true });
  }, [navigate, workspaceSlug]);

  // Only the plan id the page was opened with is resumed; ids written later by this page itself are not.
  // On a project page the plan must belong to that project, otherwise it is offered on its own page instead.
  const openedWith = useRef(searchParams.get('plan'));
  const resumed = useRef(false);
  const [checking, setChecking] = useState(() => Boolean(projectId && searchParams.get('plan')));
  const [mismatch, setMismatch] = useState<string | null>(null);
  useEffect(() => {
    const id = openedWith.current;
    if (!allowed || !id || resumed.current) return;
    resumed.current = true;
    const open = (createdId: string | null) => { if (createdId) openProject(createdId); };
    if (!projectId || !workspaceSlug) {
      void resume(id).then(open).finally(() => setChecking(false));
      return;
    }
    void aiPlanApi.get(workspaceSlug, id)
      .then(found => {
        if (found.status === 'created' && found.projectId) {
          openProject(found.projectId);
          return;
        }
        if (!planBelongsToProject(found, projectId)) {
          setMismatch(id);
          keepPlanInAddress(null);
          return;
        }
        void resume(id).then(open);
      })
      // A plan that cannot be read is left to `resume`, which shows the usual load error
      .catch(() => { void resume(id).then(open); })
      .finally(() => setChecking(false));
  }, [allowed, projectId, workspaceSlug, resume, openProject, keepPlanInAddress]);

  const actions = useMemo(() => planActions(flow.edit), [flow.edit]);

  const openRecent = (plan: AiPlan) => { void flow.resume(plan._id).then(createdId => { if (createdId) openProject(createdId); }); };
  const openActive = async () => {
    if (!workspaceSlug) return;
    try {
      const plans = await aiPlanApi.list(workspaceSlug);
      const active = plans.find(plan =>
        (plan.status === 'queued' || plan.status === 'running')
        && (!projectId || plan.options.targetProjectId === projectId));
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

  const projectLoading = projectScoped && directory.loading && !project;
  const failure = flow.plan?.status === 'failed' ? describeFailure(flow.plan, t) : '';
  const backTo = project ? `/${workspaceSlug}/projects/${project._id}` : `/${workspaceSlug}/projects`;
  const backLabel = project ? t('page.backToProject') : t('page.back');
  const projectHref = `/${workspaceSlug}/projects/${projectId ?? ''}`;
  const primaryLink = buttonVariants({ className: 'h-10 rounded-lg bg-primary px-4 text-sm text-white hover:bg-primary-hover' });
  const secondaryLink = buttonVariants({ variant: 'outline', className: 'h-10 rounded-lg' });

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-4xl space-y-5 pb-6">
        <Link
          to={backTo}
          className="inline-flex min-h-11 items-center gap-1 rounded-md text-sm text-text-body outline-none hover:text-text-strong focus-visible:ring-2 focus-visible:ring-primary sm:min-h-0"
        >
          <ChevronLeft aria-hidden className="size-4 rtl:-scale-x-100" /> {backLabel}
        </Link>

        {projectLoading ? (
          <SkeletonDetail label={t('page.loadingProject')} />
        ) : (
          <>
            <PageHeader
              title={project ? t('page.projectTitle', { name: project.name }) : t('page.title')}
              description={project ? t('page.projectDescription') : t('page.description')}
            />

            {!allowed ? (
              <Surface>
                <EmptyState headingLevel="h2" icon={<ShieldAlert />} title={t('page.noAccessTitle')} description={t('page.noAccessBody')} />
              </Surface>
            ) : projectScoped && !project ? (
              <Surface>
                <EmptyState
                  headingLevel="h2"
                  icon={<FolderKanban />}
                  title={t('page.projectNotFoundTitle')}
                  description={t('page.projectNotFoundBody')}
                  action={<Link to={`/${workspaceSlug}/projects`} className={primaryLink}>{t('page.back')}</Link>}
                />
              </Surface>
            ) : project?.archived ? (
              <Surface>
                <EmptyState
                  headingLevel="h2"
                  icon={<FolderKanban />}
                  title={t('page.archivedTitle')}
                  description={t('page.archivedBody')}
                  action={<Link to={projectHref} className={primaryLink}>{t('page.backToProject')}</Link>}
                />
              </Surface>
            ) : mismatch ? (
              <Surface>
                <EmptyState
                  headingLevel="h2"
                  icon={<ShieldAlert />}
                  title={t('page.mismatchTitle')}
                  description={t('page.mismatchBody', { target: project?.name ?? '' })}
                  action={(
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Link to={`/${workspaceSlug}/projects/new/ai?plan=${encodeURIComponent(mismatch)}`} className={primaryLink}>
                        {t('page.mismatchOpen')}
                      </Link>
                      <Link to={projectHref} className={secondaryLink}>{t('page.mismatchBack')}</Link>
                    </div>
                  )}
                />
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

                {checking || flow.loading ? (
                  <SkeletonDetail label={t('page.loading')} />
                ) : flow.phase === 'upload' ? (
                  <UploadStep
                    slug={workspaceSlug}
                    settings={ai.settings}
                    settingsLoading={ai.loading}
                    settingsError={ai.error}
                    onRetrySettings={ai.reload}
                    canManageSettings={can('settings:manage')}
                    target={project}
                    initial={flow.request}
                    busy={flow.uploading}
                    error={flow.error}
                    failure={failure}
                    recent={recentPlans}
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
                    target={project}
                    onCreate={() => { void create(); }}
                    onRegenerate={() => { void flow.regenerate(); }}
                    onDiscard={() => { void flow.discard(); }}
                    onDismissError={flow.clearCreateError}
                  />
                ) : null}
              </>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
};

export default AiProjectPage;
