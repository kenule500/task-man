import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronDown, FolderKanban, Plus, Search, Sparkles } from 'lucide-react';
import AppShell from '@/components/AppShell';
import ConfirmActionDialog from '@/components/ConfirmActionDialog';
import { Alert, EmptyState, PageHeader, SkeletonList, Surface, toast } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePermissions } from '@/hooks/usePermissions';
import { cn } from '@/lib/utils';
import { OptionSelect, useTasks } from '@/features/tasks';
import {
  PROJECT_SORT_OPTIONS, NewProjectCard, ProjectFolderCard, ProjectFormDialog, filterProjectEntries, sortProjectEntries,
  summarizeProject, useProjectDirectory, useProjects,
  type Project, type ProjectEntry, type ProjectSort,
} from '@/features/projects';
import { AiProjectCard } from '@/features/ai-plan';

type FormState = { mode: 'closed' } | { mode: 'create' } | { mode: 'edit'; project: Project };

const GRID = 'grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-5 md:grid-cols-3 xl:grid-cols-4';

const ProjectsPage = () => {
  const { t } = useTranslation('projects');
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const canWrite = can('projects:write');
  const canDelete = can('projects:delete');
  // The AI plan creates a project and its tasks, so it needs both rights
  const canCreateWithAi = canWrite && can('tasks:write');

  const projectsState = useProjects(workspaceSlug);
  const { projects } = projectsState;
  // The sidebar's project list is a separate directory: refresh it after every change made here
  const directory = useProjectDirectory();
  const createProject: typeof projectsState.createProject = async input => {
    const created = await projectsState.createProject(input);
    void directory.reload();
    return created;
  };
  const updateProject: typeof projectsState.updateProject = async (id, patch) => {
    const updated = await projectsState.updateProject(id, patch);
    void directory.reload();
    return updated;
  };
  const deleteProject: typeof projectsState.deleteProject = async id => {
    await projectsState.deleteProject(id);
    void directory.reload();
  };
  const { tasks, loading: tasksLoading, error: tasksError, clearError: clearTasksError } = useTasks(workspaceSlug);
  const loading = projectsState.loading || tasksLoading;

  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<ProjectSort>('name');
  const [showArchived, setShowArchived] = useState(false);
  const [form, setForm] = useState<FormState>({ mode: 'closed' });
  const [toDelete, setToDelete] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState(false);

  const entries = useMemo<ProjectEntry[]>(
    () => projects.map(project => ({ project, summary: summarizeProject(project, tasks) })),
    [projects, tasks],
  );
  const visible = useMemo(() => sortProjectEntries(filterProjectEntries(entries, query), sort), [entries, query, sort]);
  const active = visible.filter(entry => !entry.project.archived);
  const archived = visible.filter(entry => entry.project.archived);
  const searching = query.trim() !== '';
  const error = projectsState.error || tasksError;

  const toggleArchive = async (project: Project) => {
    try {
      await updateProject(project._id, { archived: !project.archived });
      toast.success(project.archived ? t('page.restored', { name: project.name }) : t('page.archived', { name: project.name }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('page.updateError'));
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await deleteProject(toDelete._id);
      toast.success(t('page.deleted', { name: toDelete.name }));
      setToDelete(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('page.deleteError'));
    } finally {
      setDeleting(false);
    }
  };

  const renderCard = ({ project, summary }: ProjectEntry, index: number) => (
    <ProjectFolderCard
      key={project._id}
      project={project}
      summary={summary}
      workspaceSlug={workspaceSlug ?? ''}
      index={index}
      canWrite={canWrite}
      canDelete={canDelete}
      onEdit={target => setForm({ mode: 'edit', project: target })}
      onToggleArchive={toggleArchive}
      onDelete={setToDelete}
    />
  );

  const newProjectButton = canWrite ? (
    <Button
      onClick={() => setForm({ mode: 'create' })}
      disabled={loading || !workspaceSlug}
      className="h-10 gap-2 rounded-lg bg-primary text-sm text-white shadow-sm hover:bg-primary-hover sm:h-9"
    >
      <Plus className="size-4" /> {t('page.newProject')}
    </Button>
  ) : undefined;

  const aiProjectButton = canCreateWithAi ? (
    <Button
      variant="outline"
      onClick={() => {
        if (workspaceSlug) navigate(`/${workspaceSlug}/projects/new/ai`);
      }}
      disabled={loading || !workspaceSlug}
      className="h-10 gap-2 rounded-lg sm:h-9"
    >
      <Sparkles className="size-4" /> {t('page.createWithAi')}
    </Button>
  ) : undefined;

  const pageActions = (newProjectButton || aiProjectButton) ? (
    <div
      role="group"
      aria-label={t('page.projectActions')}
      className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row"
    >
      {newProjectButton}
      {aiProjectButton}
    </div>
  ) : undefined;

  return (
    <AppShell>
      <PageHeader
        title={t('page.title')}
        description={t('page.description')}
        actions={projects.length > 0 ? pageActions : undefined}
      />

      {loading ? (
        <SkeletonList label={t('page.loading')} rows={4} />
      ) : (
        <>
          {error && (
            <Alert tone="error" onDismiss={() => { projectsState.clearError(); clearTasksError(); }}>{error}</Alert>
          )}

          {projects.length === 0 ? (
            <Surface padding="none">
              <EmptyState
                icon={<FolderKanban />}
                title={t('page.emptyTitle')}
                description={canWrite
                  ? t('page.emptyWrite')
                  : t('page.emptyRead')}
                action={pageActions}
              />
            </Surface>
          ) : (
            <>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative flex-1 sm:max-w-sm">
                  <Search aria-hidden className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
                  <Input
                    type="search"
                    value={query}
                    onChange={event => setQuery(event.target.value)}
                    placeholder={t('page.search')}
                    aria-label={t('page.search')}
                    className="h-11 rounded-lg border-slate-200 bg-white ps-9 text-base shadow-none sm:h-9 sm:text-sm"
                  />
                </div>
                <OptionSelect
                  value={sort}
                  options={PROJECT_SORT_OPTIONS}
                  onChange={setSort}
                  aria-label={t('page.sort')}
                  className="h-11 sm:h-9 sm:w-48"
                />
              </div>
              <p role="status" className="sr-only">
                {searching ? t('page.matches', { count: active.length + archived.length, query: query.trim() }) : ''}
              </p>

              {active.length === 0 && archived.length === 0 ? (
                <Surface padding="none">
                  <EmptyState
                    icon={<Search />}
                    title={t('page.noMatchTitle')}
                    description={t('page.noMatchDescription', { query: query.trim() })}
                    action={<Button variant="outline" onClick={() => setQuery('')} className="h-10 rounded-lg">{t('page.clearSearch')}</Button>}
                  />
                </Surface>
              ) : (
                <ul aria-label={t('page.projectsList')} className={GRID}>
                  {!searching && canWrite && (
                    <NewProjectCard onClick={() => setForm({ mode: 'create' })} />
                  )}
                  {!searching && canCreateWithAi && <AiProjectCard workspaceSlug={workspaceSlug ?? ''} />}
                  {active.map(renderCard)}
                </ul>
              )}

              {archived.length > 0 && (
                <section aria-labelledby="archived-heading" className="space-y-3">
                  <h2 id="archived-heading" className="text-sm font-semibold text-slate-900">
                    <button
                      type="button"
                      onClick={() => setShowArchived(open => !open)}
                      aria-expanded={showArchived}
                      aria-controls="archived-projects"
                      className="-mx-2 flex min-h-11 items-center gap-2 rounded-lg px-2 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-primary md:min-h-9"
                    >
                      <ChevronDown aria-hidden className={cn('size-4 text-slate-500 transition-transform', showArchived && 'rotate-180')} />
                      {t('page.archivedHeading')}
                      <span className="rounded-md border border-slate-200 bg-slate-50 px-1.5 text-xs font-medium tabular-nums text-slate-600">{archived.length}</span>
                    </button>
                  </h2>
                  {showArchived && (
                    <ul id="archived-projects" aria-label={t('page.archivedList')} className={GRID}>
                      {archived.map(renderCard)}
                    </ul>
                  )}
                </section>
              )}
            </>
          )}
        </>
      )}

      {form.mode !== 'closed' && (
        <ProjectFormDialog
          key={form.mode === 'edit' ? form.project._id : 'new'}
          open
          onOpenChange={open => !open && setForm({ mode: 'closed' })}
          project={form.mode === 'edit' ? form.project : null}
          onSubmit={async input => {
            if (form.mode === 'edit') await updateProject(form.project._id, input);
            else await createProject(input);
            toast.success(form.mode === 'edit' ? t('page.projectSaved') : t('page.projectCreated'));
          }}
        />
      )}

      <ConfirmActionDialog
        open={Boolean(toDelete)}
        onOpenChange={open => !open && !deleting && setToDelete(null)}
        title={t('page.deleteTitle', { name: toDelete?.name ?? '' })}
        description={t('page.deleteBody')}
        confirmLabel={t('page.deleteConfirm')}
        busyLabel={t('page.deleting')}
        busy={deleting}
        onConfirm={confirmDelete}
      />
    </AppShell>
  );
};

export default ProjectsPage;
