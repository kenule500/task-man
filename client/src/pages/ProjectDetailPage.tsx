import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronRight, FolderKanban, KanbanSquare, Pencil, Plus } from 'lucide-react';
import AppShell from '@/components/AppShell';
import { Alert, EmptyState, SkeletonCards, Surface, Tag, toast } from '@/components/ds';
import { Button, buttonVariants } from '@/components/ui/button';
import { usePermissions } from '@/hooks/usePermissions';
import { cn } from '@/lib/utils';
import {
  ProjectFormDialog, ProjectIcon, ProjectWorkspace, SprintFormDialog, colorStyleOf, suggestSprintDates, suggestSprintName,
  useProjectDirectory, useProjects,
  type Sprint,
} from '@/features/projects';

type SprintFormState = { mode: 'closed' } | { mode: 'create' } | { mode: 'edit'; sprint: Sprint };

const ProjectDetailPage = () => {
  const { workspaceSlug = '', projectId } = useParams<{ workspaceSlug: string; projectId: string }>();
  const { can } = usePermissions();
  const canWrite = can('projects:write');

  const {
    projects, loading, error, clearError, updateProject, createSprint, updateSprint, startSprint, completeSprint, deleteSprint,
  } = useProjects(workspaceSlug);
  const directory = useProjectDirectory();
  const project = projects.find(item => item._id === projectId);

  // Completing or deleting a sprint moves tasks on the server. `useTasks` has no reload, so the
  // task-dependent part of the page is keyed by this counter and remounts to fetch fresh tasks.
  const [tasksVersion, setTasksVersion] = useState(0);
  const [editingProject, setEditingProject] = useState(false);
  const [sprintForm, setSprintForm] = useState<SprintFormState>({ mode: 'closed' });

  const sprintActions = useMemo(() => ({
    start: (sprintId: string) => startSprint(projectId ?? '', sprintId),
    complete: (sprintId: string, moveOpenTo: string) => completeSprint(projectId ?? '', sprintId, moveOpenTo),
    remove: (sprintId: string) => deleteSprint(projectId ?? '', sprintId),
  }), [projectId, startSprint, completeSprint, deleteSprint]);

  const style = colorStyleOf(project?.color);
  // The project's board: its running sprint when there is one, else all of its work
  const hasActiveSprint = project?.sprints?.some(sprint => sprint.status === 'active') ?? false;
  const boardHref = project
    ? `/${workspaceSlug}/tasks?view=board&project=${encodeURIComponent(project.name)}${hasActiveSprint ? '&sprint=active' : ''}`
    : `/${workspaceSlug}/tasks?view=board`;

  return (
    <AppShell>
      {loading ? (
        <SkeletonCards count={4} columns="grid-cols-2 lg:grid-cols-4" className="gap-3 sm:gap-5" />
      ) : !project ? (
        <>
          <h1 className="sr-only">Project</h1>
          {error && <Alert tone="error" onDismiss={clearError}>{error}</Alert>}
          <Surface padding="none">
            <EmptyState
              icon={<FolderKanban />}
              title="Project not found"
              description="It may have been deleted, or the link is wrong. Pick a project from the list."
              action={(
                <Link to={`/${workspaceSlug}/projects`} className={buttonVariants({ className: 'h-10 rounded-lg bg-primary px-4 text-sm text-white hover:bg-primary-hover' })}>
                  Back to projects
                </Link>
              )}
            />
          </Surface>
        </>
      ) : (
        <>
          <nav aria-label="Breadcrumb">
            <ol className="flex items-center gap-1.5 text-sm text-slate-600">
              <li>
                <Link to={`/${workspaceSlug}/projects`} className="rounded px-1 py-2 hover:text-slate-900 hover:underline focus-visible:outline-2 focus-visible:outline-primary">
                  Projects
                </Link>
              </li>
              <li aria-hidden><ChevronRight className="size-3.5" /></li>
              <li className="min-w-0 truncate font-medium text-slate-900" aria-current="page">{project.name}</li>
            </ol>
          </nav>

          <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 items-start gap-3 sm:gap-4">
              <span aria-hidden className={cn('flex size-12 shrink-0 items-center justify-center rounded-xl text-white shadow-sm sm:size-14', style.tile)}>
                <ProjectIcon icon={project.icon} className="size-6 sm:size-7" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <h1 className="break-words text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{project.name}</h1>
                  <Tag tone="neutral" className="font-mono">{project.key}</Tag>
                  {project.archived && <Tag tone="warning">Archived</Tag>}
                </div>
                {project.description && <p className="mt-1 max-w-2xl text-sm text-slate-600">{project.description}</p>}
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2 [&>*]:flex-1 sm:[&>*]:flex-none">
              {canWrite && (
                <Button variant="outline" onClick={() => setEditingProject(true)} className="h-11 gap-2 rounded-lg border-slate-300 text-sm text-slate-800 shadow-none sm:h-9">
                  <Pencil className="size-4" aria-hidden /> Edit
                </Button>
              )}
              <Link to={boardHref} className={buttonVariants({ variant: 'outline', className: 'h-11 gap-2 rounded-lg border-slate-300 text-sm text-slate-800 shadow-none sm:h-9' })}>
                <KanbanSquare className="size-4" aria-hidden /> Open board
              </Link>
              {canWrite && (
                <Button
                  onClick={() => setSprintForm({ mode: 'create' })}
                  className="h-11 gap-2 rounded-lg bg-primary text-sm text-white shadow-sm hover:bg-primary-hover sm:h-9"
                >
                  <Plus className="size-4" aria-hidden /> New sprint
                </Button>
              )}
            </div>
          </header>

          {error && <Alert tone="error" onDismiss={clearError}>{error}</Alert>}

          <ProjectWorkspace
            key={tasksVersion}
            workspaceSlug={workspaceSlug}
            project={project}
            projects={projects}
            canManage={canWrite}
            sprintActions={sprintActions}
            onTasksChanged={() => setTasksVersion(version => version + 1)}
            onNewSprint={() => setSprintForm({ mode: 'create' })}
            onEditSprint={sprint => setSprintForm({ mode: 'edit', sprint })}
          />

          {editingProject && (
            <ProjectFormDialog
              key={project._id}
              open
              onOpenChange={open => !open && setEditingProject(false)}
              project={project}
              onSubmit={async input => {
                await updateProject(project._id, input);
                void directory.reload();
                toast.success('Project saved');
              }}
            />
          )}

          {sprintForm.mode !== 'closed' && (
            <SprintFormDialog
              key={sprintForm.mode === 'edit' ? sprintForm.sprint._id : 'new'}
              open
              onOpenChange={open => !open && setSprintForm({ mode: 'closed' })}
              sprint={sprintForm.mode === 'edit' ? sprintForm.sprint : null}
              defaults={sprintForm.mode === 'create'
                ? { name: suggestSprintName(project.sprints), ...suggestSprintDates(project.sprints) }
                : undefined}
              onSubmit={async input => {
                if (sprintForm.mode === 'edit') await updateSprint(project._id, sprintForm.sprint._id, input);
                else await createSprint(project._id, input);
                toast.success(sprintForm.mode === 'edit' ? 'Sprint saved' : 'Sprint created');
              }}
            />
          )}
        </>
      )}
    </AppShell>
  );
};

export default ProjectDetailPage;
