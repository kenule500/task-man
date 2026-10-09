import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ChevronDown, FolderKanban, Plus, Search } from 'lucide-react';
import AppShell from '@/components/AppShell';
import ConfirmActionDialog from '@/components/ConfirmActionDialog';
import { Alert, EmptyState, PageHeader, SkeletonCards, Surface, toast } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePermissions } from '@/hooks/usePermissions';
import { cn } from '@/lib/utils';
import { OptionSelect, useTasks } from '@/features/tasks';
import {
  NewProjectCard, PROJECT_SORT_OPTIONS, ProjectFolderCard, ProjectFormDialog, filterProjectEntries, sortProjectEntries,
  summarizeProject, useProjects,
  type Project, type ProjectEntry, type ProjectSort,
} from '@/features/projects';

type FormState = { mode: 'closed' } | { mode: 'create' } | { mode: 'edit'; project: Project };

const GRID = 'grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 xl:grid-cols-4';

const ProjectsPage = () => {
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  const { can } = usePermissions();
  const canWrite = can('projects:write');
  const canDelete = can('projects:delete');

  const projectsState = useProjects(workspaceSlug);
  const { projects, createProject, updateProject, deleteProject } = projectsState;
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
      toast.success(project.archived ? `"${project.name}" restored` : `"${project.name}" archived`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update the project.');
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await deleteProject(toDelete._id);
      toast.success(`"${toDelete.name}" deleted`);
      setToDelete(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete the project.');
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
      <Plus className="size-4" /> New project
    </Button>
  ) : undefined;

  return (
    <AppShell>
      <PageHeader
        title="Projects"
        description="Folders for your sprints and tasks. Open one to plan sprints and track progress."
        actions={newProjectButton}
      />

      {loading ? (
        <SkeletonCards count={4} columns="grid-cols-2 md:grid-cols-3 xl:grid-cols-4" className="gap-3 sm:gap-5" />
      ) : (
        <>
          {error && (
            <Alert tone="error" onDismiss={() => { projectsState.clearError(); clearTasksError(); }}>{error}</Alert>
          )}

          {projects.length === 0 ? (
            <Surface padding="none">
              <EmptyState
                icon={<FolderKanban />}
                title="No projects yet"
                description={canWrite
                  ? 'Create a project to plan sprints, keep a backlog and see progress at a glance.'
                  : 'Projects will appear here once someone with access creates them.'}
                action={newProjectButton}
              />
            </Surface>
          ) : (
            <>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative flex-1 sm:max-w-sm">
                  <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    type="search"
                    value={query}
                    onChange={event => setQuery(event.target.value)}
                    placeholder="Search projects"
                    aria-label="Search projects"
                    className="h-11 rounded-lg border-slate-200 bg-white pl-9 text-base shadow-none sm:h-9 sm:text-sm"
                  />
                </div>
                <OptionSelect
                  value={sort}
                  options={PROJECT_SORT_OPTIONS}
                  onChange={setSort}
                  aria-label="Sort projects"
                  className="h-11 sm:h-9 sm:w-48"
                />
              </div>
              <p role="status" className="sr-only">
                {searching ? `${active.length + archived.length} ${active.length + archived.length === 1 ? 'project matches' : 'projects match'} "${query.trim()}"` : ''}
              </p>

              {active.length === 0 && archived.length === 0 ? (
                <Surface padding="none">
                  <EmptyState
                    icon={<Search />}
                    title="No projects match"
                    description={`Nothing matches "${query.trim()}". Try another name or key.`}
                    action={<Button variant="outline" onClick={() => setQuery('')} className="h-10 rounded-lg">Clear search</Button>}
                  />
                </Surface>
              ) : (
                <ul aria-label="Projects" className={GRID}>
                  {active.map(renderCard)}
                  {canWrite && !searching && <NewProjectCard onClick={() => setForm({ mode: 'create' })} />}
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
                      Archived
                      <span className="rounded-md border border-slate-200 bg-slate-50 px-1.5 text-xs font-medium tabular-nums text-slate-600">{archived.length}</span>
                    </button>
                  </h2>
                  {showArchived && (
                    <ul id="archived-projects" aria-label="Archived projects" className={GRID}>
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
            toast.success(form.mode === 'edit' ? 'Project saved' : 'Project created');
          }}
        />
      )}

      <ConfirmActionDialog
        open={Boolean(toDelete)}
        onOpenChange={open => !open && !deleting && setToDelete(null)}
        title={`Delete "${toDelete?.name ?? ''}"?`}
        description="The project and its sprints are deleted. Its tasks are kept, without a project or sprint."
        confirmLabel="Delete project"
        busyLabel="Deleting..."
        busy={deleting}
        onConfirm={confirmDelete}
      />
    </AppShell>
  );
};

export default ProjectsPage;
