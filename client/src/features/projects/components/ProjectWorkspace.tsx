import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckSquare, ChevronDown, Gauge, Inbox, LayoutGrid, ListTodo, Plus, Target } from 'lucide-react';
import ConfirmActionDialog from '@/components/ConfirmActionDialog';
import { Alert, EmptyState, SkeletonCards, StatCard, Surface, toast } from '@/components/ds';
import { Button, buttonVariants } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePermissions } from '@/hooks/usePermissions';
import { cn } from '@/lib/utils';
import {
  ConfirmTaskDelete, DELETE_UNDO_MS, OptionSelect, TaskDetailDialog, TaskFormDialog, addDays, dateKeyOf, epicsOf, getApiErrorMessage, scopeHref, toDateKey,
  useTasks, useWorkspaceMembers,
  type Task, type TaskDetailActions, type TaskInput,
} from '@/features/tasks';
import { ReleasesTab, useReleases } from '@/features/releases';
// Deep import: the wiki index also exports Markdown helpers, which belong to the lazy wiki page
import ProjectWikiTab from '@/features/wiki/components/ProjectWikiTab';
import type { MoveOpenTo, Project, Sprint } from '../types';
import { groupProjectTasks, projectTasks } from '../lib/grouping';
import { workProgress } from '../lib/sprintStats';
import { averageVelocity } from '../lib/velocity';
import CompleteSprintDialog from './CompleteSprintDialog';
import EpicsPanel from './EpicsPanel';
import OverviewTab from './OverviewTab';
import QuickAdd from './QuickAdd';
import SprintCard from './SprintCard';
import TaskList from './TaskList';

export interface SprintActions {
  start: (sprintId: string) => Promise<unknown>;
  complete: (sprintId: string, moveOpenTo: MoveOpenTo) => Promise<{ movedTasks: number }>;
  remove: (sprintId: string) => Promise<void>;
}

interface ProjectWorkspaceProps {
  workspaceSlug: string;
  project: Project;
  /** All workspace projects, so task dialogs can name sprints. */
  projects: Project[];
  /** Holds `projects:write`. */
  canManage: boolean;
  sprintActions: SprintActions;
  /** Called after a sprint change that moved tasks on the server (complete, delete): reloads the tasks. */
  onTasksChanged: () => void;
  onNewSprint: () => void;
  onEditSprint: (sprint: Sprint) => void;
}

const TABS = ['sprints', 'backlog', 'epics', 'releases', 'wiki', 'overview'] as const;
type TabValue = (typeof TABS)[number];

const MOVE_PLACEHOLDER = '';

/**
 * Everything on the project page that depends on the workspace tasks: stats, sprint lists, backlog and overview.
 * It owns `useTasks`, so the page remounts it (with a `key`) to reload tasks after a sprint was completed or deleted.
 */
const ProjectWorkspace = ({
  workspaceSlug, project, projects, canManage, sprintActions, onTasksChanged, onNewSprint, onEditSprint,
}: ProjectWorkspaceProps) => {
  const { t } = useTranslation('projects');
  const { can, user } = usePermissions();
  const canWriteTasks = can('tasks:write');
  const canDeleteTasks = can('tasks:delete');
  const canReadUsers = can('users:read');
  const currentUser = useMemo(() => (user ? { _id: user._id, name: user.name } : null), [user]);

  const {
    tasks, loading, error, clearError, createTask, updateTask, deleteTask, undoDelete,
    addComment, removeComment, uploadAttachment, removeAttachment, downloadAttachment,
  } = useTasks(workspaceSlug);

  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab') as TabValue | null;
  const tab: TabValue = requestedTab && TABS.includes(requestedTab) ? requestedTab : 'sprints';
  const setTab = (next: TabValue) =>
    setSearchParams(prev => {
      const params = new URLSearchParams(prev);
      if (next === 'sprints') params.delete('tab');
      else params.set('tab', next);
      return params;
    }, { replace: true });

  const [openOverrides, setOpenOverrides] = useState<Record<string, boolean>>({});
  const [confirmDelete, setConfirmDelete] = useState<Task | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Task | null>(null);
  const [completing, setCompleting] = useState<Sprint | null>(null);
  const [deletingSprint, setDeletingSprint] = useState<Sprint | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [startingId, setStartingId] = useState<string | null>(null);
  const { members, loading: membersLoading } = useWorkspaceMembers(workspaceSlug, Boolean(editing) && canReadUsers);

  const own = useMemo(() => projectTasks(tasks, project), [tasks, project]);
  const groups = useMemo(() => groupProjectTasks(own, project.sprints), [own, project.sprints]);
  const progress = useMemo(() => workProgress(own), [own]);
  const epics = useMemo(() => epicsOf(own), [own]);
  const velocity = useMemo(() => averageVelocity(project.sprints), [project.sprints]);
  const { releases } = useReleases(workspaceSlug);
  const releaseCount = releases.filter(item => item.project === project._id && item.status !== 'archived').length;
  const detailTask = detailId ? tasks.find(task => task._id === detailId) ?? null : null;

  const active = project.sprints.filter(sprint => sprint.status === 'active');
  const planned = project.sprints.filter(sprint => sprint.status === 'planned');
  const completed = project.sprints.filter(sprint => sprint.status === 'completed').reverse();
  const assignable = [...active, ...planned];
  const isOpen = (sprint: Sprint) => openOverrides[sprint._id] ?? sprint.status !== 'completed';

  // ----- task actions -----------------------------------------------------

  const toggleSubtask = async (subtask: Task, done: boolean) => {
    if (!canWriteTasks) return;
    await updateTask(subtask._id, { status: done ? 'completed' : 'pending' });
  };

  const addStory = async (title: string, extra: Pick<TaskInput, 'deadline'> & Partial<TaskInput>) => {
    try {
      const created = await createTask({ title, project: project.name, type: 'story', ...extra });
      if (created) toast.success(t('workspace.storyAdded'));
      return created;
    } catch (err) {
      toast.error(getApiErrorMessage(err, t('workspace.storyError')));
      throw err;
    }
  };

  const addEpic = async (title: string) => {
    try {
      const created = await createTask({ title, project: project.name, type: 'epic', deadline: toDateKey(addDays(new Date(), 30)) });
      if (created) toast.success(t('workspace.epicAdded'));
      return created;
    } catch (err) {
      toast.error(getApiErrorMessage(err, t('workspace.epicError')));
      throw err;
    }
  };

  // ----- epic hierarchy ---------------------------------------------------

  const addToEpic = async (epic: Task, title: string) => {
    try {
      const created = await createTask({
        title, project: project.name, type: 'story', epic: epic._id,
        deadline: dateKeyOf(epic.deadline) || toDateKey(addDays(new Date(), 14)),
      });
      if (created) toast.success(t('workspace.addedToEpic', { epic: epic.title }));
      return created;
    } catch (err) {
      toast.error(getApiErrorMessage(err, t('workspace.taskError')));
      throw err;
    }
  };

  const addSubtaskTo = async (item: Task, title: string) => {
    try {
      const created = await createTask({ title, parent: item._id, project: project.name, deadline: dateKeyOf(item.deadline) });
      if (created) toast.success(t('workspace.subtaskAdded'));
      return created;
    } catch (err) {
      toast.error(getApiErrorMessage(err, t('workspace.subtaskError')));
      throw err;
    }
  };

  const linkToEpic = async (epic: Task, taskIds: string[]) => {
    const saved = await Promise.all(taskIds.map(id => updateTask(id, { epic: epic._id })));
    const failed = saved.filter(task => !task).length;
    if (failed === taskIds.length) throw new Error(t('workspace.linkError'));
    if (failed > 0) toast.error(t('workspace.linkPartial', { failed, total: taskIds.length }));
    else toast.success(t('workspace.linked', { count: taskIds.length, epic: epic.title }));
  };

  const changeEpic = async (task: Task, epic: string | null, success: string) => {
    const saved = await updateTask(task._id, { epic });
    if (saved) toast.success(success);
    else toast.error(t('workspace.updateError', { title: task.title }));
  };

  const moveToSprint = async (task: Task, sprintId: string) => {
    const target = project.sprints.find(sprint => sprint._id === sprintId);
    const saved = await updateTask(task._id, { sprint: sprintId });
    if (saved && target) toast.success(t('workspace.movedTo', { name: target.name }));
  };

  /** Asks first; see commitDeleteTask. */
  const handleDeleteTask = (task: Task) => {
    if (canDeleteTasks) setConfirmDelete(task);
  };

  /** Hides the task at once; the request is only sent when the undo toast expires. */
  const commitDeleteTask = (task: Task) => {
    setConfirmDelete(null);
    if (!canDeleteTasks) return;
    setDetailId(null);
    deleteTask(task._id);
    toast({
      title: t('workspace.taskDeleted'),
      description: task.title,
      duration: DELETE_UNDO_MS,
      pauseOnHover: false,
      action: { label: t('actions.undo'), onClick: () => undoDelete(task._id) },
    });
  };

  const handleEditTask = (task: Task) => {
    if (!canWriteTasks) return;
    setDetailId(null);
    setEditing(task);
  };

  const detailActions: TaskDetailActions = {
    addComment: (id, text) => addComment(id, text, currentUser ?? undefined),
    removeComment,
    uploadAttachment,
    removeAttachment,
    downloadAttachment,
    openTask: (task: Task) => setDetailId(task._id),
  };

  // ----- sprint actions ---------------------------------------------------

  const startSprint = async (sprint: Sprint) => {
    setStartingId(sprint._id);
    try {
      await sprintActions.start(sprint._id);
      toast.success(t('workspace.sprintStarted', { name: sprint.name }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('workspace.sprintStartError'));
    } finally {
      setStartingId(null);
    }
  };

  const confirmDeleteSprint = async () => {
    if (!deletingSprint) return;
    setDeleteBusy(true);
    try {
      await sprintActions.remove(deletingSprint._id);
      toast.success(t('workspace.sprintDeleted', { name: deletingSprint.name }));
      setDeletingSprint(null);
      onTasksChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('workspace.sprintDeleteError'));
    } finally {
      setDeleteBusy(false);
    }
  };

  const openTasksOf = (sprint: Sprint) => (groups.bySprint.get(sprint._id) ?? []).filter(task => task.status !== 'completed');

  const renderSprint = (sprint: Sprint) => (
    <SprintCard
      key={sprint._id}
      sprint={sprint}
      projectName={project.name}
      tasks={groups.bySprint.get(sprint._id) ?? []}
      subtasks={groups.subtasks}
      expanded={isOpen(sprint)}
      onToggle={() => setOpenOverrides(current => ({ ...current, [sprint._id]: !isOpen(sprint) }))}
      canManage={canManage}
      canWriteTasks={canWriteTasks}
      blockedByActive={active.length > 0}
      starting={startingId === sprint._id}
      onStart={startSprint}
      onComplete={setCompleting}
      onEdit={onEditSprint}
      onDelete={setDeletingSprint}
      onOpenTask={task => setDetailId(task._id)}
      onToggleSubtask={toggleSubtask}
      onQuickAdd={title => addStory(title, { sprint: sprint._id, deadline: dateKeyOf(sprint.endDate) })}
    />
  );

  if (loading) {
    return <SkeletonCards count={4} columns="grid-cols-2 lg:grid-cols-4" className="gap-3 sm:gap-5" />;
  }

  const moveOptions = [
    { value: MOVE_PLACEHOLDER, label: t('workspace.moveToSprint') },
    ...assignable.map(sprint => ({ value: sprint._id, label: sprint.name })),
  ];

  return (
    <>
      {error && <Alert tone="error" onDismiss={clearError}>{error}</Alert>}

      {active[0] && (
        <Link
          to={scopeHref(workspaceSlug, { view: 'board', project: project.name, sprint: active[0]._id })}
          className={buttonVariants({ className: 'h-11 w-full justify-center gap-2 rounded-lg bg-primary px-4 text-sm text-white shadow-sm hover:bg-primary-hover sm:h-10 sm:w-fit' })}
        >
          <LayoutGrid className="size-4 shrink-0" aria-hidden />
          {t('workspace.activeBoard')}
          <span className="max-w-48 truncate font-normal opacity-90">{active[0].name}</span>
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
        <StatCard
          className="p-4 sm:p-5"
          title={t('workspace.stats.totalTasks')}
          value={progress.totalTasks}
          subtitle={t('workspace.stats.inBacklog', { n: groups.backlog.length })}
          icon={<ListTodo className="size-4" />}
          colorClass="text-slate-600"
        />
        <StatCard
          className="p-4 sm:p-5"
          title={t('workspace.stats.completed')}
          value={`${progress.totalTasks === 0 ? 0 : Math.round((progress.doneTasks / progress.totalTasks) * 100)}%`}
          subtitle={t('workspace.stats.doneOf', { done: progress.doneTasks, total: progress.totalTasks })}
          icon={<CheckSquare className="size-4" />}
          colorClass="text-success-fg"
        />
        <StatCard
          className="p-4 sm:p-5"
          title={t('workspace.stats.storyPoints')}
          value={`${progress.donePoints}/${progress.totalPoints}`}
          subtitle={t('workspace.stats.doneOverPlanned')}
          icon={<Target className="size-4" />}
          colorClass="text-blue-600"
        />
        <StatCard
          className="p-4 sm:p-5"
          title={t('workspace.stats.velocity')}
          value={velocity ?? '–'}
          subtitle={velocity === null ? t('workspace.stats.noCompletedSprints') : t('workspace.stats.pointsPerSprint')}
          icon={<Gauge className="size-4" />}
          colorClass="text-violet-600"
        />
      </div>

      <Tabs value={tab} onValueChange={value => setTab(value as TabValue)} className="gap-4">
        <TabsList aria-label={t('workspace.sections')} className="w-full group-data-horizontal/tabs:h-11 sm:w-fit sm:group-data-horizontal/tabs:h-9">
          <TabsTrigger value="sprints" className="px-4">{t('workspace.tabs.sprints')} <span className="tabular-nums text-slate-600">{project.sprints.length}</span></TabsTrigger>
          <TabsTrigger value="backlog" className="px-4">{t('workspace.tabs.backlog')} <span className="tabular-nums text-slate-600">{groups.backlog.length}</span></TabsTrigger>
          <TabsTrigger value="epics" className="px-4">{t('workspace.tabs.epics')} <span className="tabular-nums text-slate-600">{epics.length}</span></TabsTrigger>
          <TabsTrigger value="releases" className="px-4">{t('workspace.tabs.releases')} <span className="tabular-nums text-slate-600">{releaseCount}</span></TabsTrigger>
          <TabsTrigger value="wiki" className="px-4">{t('workspace.tabs.wiki')}</TabsTrigger>
          <TabsTrigger value="overview" className="px-4">{t('workspace.tabs.overview')}</TabsTrigger>
        </TabsList>

        <TabsContent value="sprints" className="space-y-5">
          {project.sprints.length === 0 ? (
            <Surface padding="none">
              <EmptyState
                icon={<Target />}
                title={t('workspace.noSprintsTitle')}
                description={canManage
                  ? t('workspace.noSprintsManage')
                  : t('workspace.noSprintsRead')}
                action={canManage ? (
                  <Button onClick={onNewSprint} className="h-10 gap-2 rounded-lg bg-primary text-sm text-white hover:bg-primary-hover">
                    <Plus className="size-4" aria-hidden /> {t('workspace.newSprint')}
                  </Button>
                ) : undefined}
              />
            </Surface>
          ) : (
            <>
              {active.length > 0 && (
                <section aria-labelledby="active-sprints" className="space-y-3">
                  <h2 id="active-sprints" className="text-sm font-semibold text-slate-900">{t('workspace.activeSprint')}</h2>
                  {active.map(renderSprint)}
                </section>
              )}
              {active.length === 0 && planned.length > 0 && (
                <Alert tone="info">{t('workspace.noneRunning')}</Alert>
              )}
              {planned.length > 0 && (
                <section aria-labelledby="planned-sprints" className="space-y-3">
                  <h2 id="planned-sprints" className="text-sm font-semibold text-slate-900">{t('workspace.planned')}</h2>
                  {planned.map(renderSprint)}
                </section>
              )}
              {completed.length > 0 && (
                <section aria-labelledby="completed-sprints" className="space-y-3">
                  <h2 id="completed-sprints" className="text-sm font-semibold text-slate-900">
                    <button
                      type="button"
                      onClick={() => setShowCompleted(open => !open)}
                      aria-expanded={showCompleted}
                      aria-controls="completed-sprint-list"
                      className="-mx-2 flex min-h-11 items-center gap-2 rounded-lg px-2 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-primary md:min-h-9"
                    >
                      <ChevronDown aria-hidden className={cn('size-4 text-slate-500 transition-transform motion-reduce:transition-none', !showCompleted && '-rotate-90')} />
                      {t('workspace.completedSprints')}
                      <span className="rounded-md border border-slate-200 bg-slate-50 px-1.5 text-xs font-medium tabular-nums text-slate-600">{completed.length}</span>
                    </button>
                  </h2>
                  {showCompleted && <div id="completed-sprint-list" className="space-y-3">{completed.map(renderSprint)}</div>}
                </section>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="backlog">
          <Surface as="section" padding="none" aria-label={t('workspace.backlog')} className="overflow-hidden">
            <div className="flex justify-end border-b border-slate-100 px-4 py-1.5 sm:px-5">
              <Link
                to={scopeHref(workspaceSlug, { view: 'list', project: project.name, sprint: 'backlog' })}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-1 text-xs font-medium text-primary outline-none hover:underline focus-visible:outline-2 focus-visible:outline-primary md:min-h-8"
              >
                <ListTodo aria-hidden className="size-3.5" />
                {t('workspace.openAsList')}<span className="sr-only">{t('workspace.inTasksSr')}</span>
              </Link>
            </div>
            {canWriteTasks && (
              <QuickAdd
                label={t('workspace.addToBacklog')}
                onAdd={title => addStory(title, { deadline: toDateKey(addDays(new Date(), 14)) })}
              />
            )}
            <TaskList
              label={t('workspace.backlog')}
              tasks={groups.backlog}
              subtasks={groups.subtasks}
              canWrite={canWriteTasks}
              onOpen={task => setDetailId(task._id)}
              onToggleSubtask={toggleSubtask}
              renderTrailing={canWriteTasks && assignable.length > 0 ? task => (
                <OptionSelect
                  value={MOVE_PLACEHOLDER}
                  options={moveOptions}
                  onChange={sprintId => { void moveToSprint(task, sprintId); }}
                  aria-label={t('workspace.moveTaskAria', { title: task.title })}
                  className="h-11 w-36 sm:w-44 md:h-8"
                />
              ) : undefined}
              empty={(
                <EmptyState
                  className="py-10"
                  icon={<Inbox />}
                  title={t('workspace.backlogEmpty')}
                  description={canWriteTasks
                    ? t('workspace.backlogEmptyWrite')
                    : t('workspace.backlogEmptyRead')}
                />
              )}
            />
          </Surface>
        </TabsContent>

        <TabsContent value="epics">
          <Surface as="section" padding="none" aria-label={t('workspace.epics')} className="overflow-hidden">
            <EpicsPanel
              epics={epics}
              tasks={own}
              canWrite={canWriteTasks}
              onOpen={task => setDetailId(task._id)}
              onAdd={addEpic}
              storageKey={project._id}
              onToggleDone={toggleSubtask}
              onAddToEpic={addToEpic}
              onAddSubtask={addSubtaskTo}
              onLinkTasks={linkToEpic}
              onRemoveFromEpic={task => { void changeEpic(task, null, t('workspace.removedFromEpic')); }}
              onMoveToEpic={(task, epicId) => {
                void changeEpic(task, epicId, t('workspace.movedTo', { name: epics.find(epic => epic._id === epicId)?.title ?? t('workspace.theEpic') }));
              }}
            />
          </Surface>
        </TabsContent>

        <TabsContent value="releases">
          <ReleasesTab workspaceSlug={workspaceSlug} projectId={project._id} canManage={canManage} onTasksChanged={onTasksChanged} />
        </TabsContent>

        <TabsContent value="wiki">
          <ProjectWikiTab workspaceSlug={workspaceSlug} projectName={project.name} canWrite={canWriteTasks} />
        </TabsContent>

        <TabsContent value="overview">
          <OverviewTab tasks={own} sprints={project.sprints} onOpenTask={task => setDetailId(task._id)} />
        </TabsContent>
      </Tabs>

      {detailTask && (
        <TaskDetailDialog
          key={detailTask._id}
          task={detailTask}
          onOpenChange={open => !open && setDetailId(null)}
          tasks={tasks}
          currentUser={currentUser}
          canWrite={canWriteTasks}
          canDelete={canDeleteTasks}
          onEdit={handleEditTask}
          onDelete={handleDeleteTask}
          actions={detailActions}
          projects={projects}
        />
      )}

      {editing && (
        <TaskFormDialog
          key={editing._id}
          open
          onOpenChange={open => !open && setEditing(null)}
          task={editing}
          tasks={tasks}
          members={members}
          membersLoading={membersLoading}
          canListMembers={canReadUsers}
          currentUser={currentUser}
          projects={projects}
          onSubmit={async input => {
            const saved = await updateTask(editing._id, input);
            if (saved) toast.success(t('workspace.taskSaved'));
            return saved;
          }}
        />
      )}

      {completing && (
        <CompleteSprintDialog
          key={completing._id}
          open
          onOpenChange={open => !open && setCompleting(null)}
          sprint={completing}
          openTaskCount={openTasksOf(completing).length}
          plannedSprints={planned}
          onConfirm={async moveOpenTo => {
            const { movedTasks } = await sprintActions.complete(completing._id, moveOpenTo);
            const where = moveOpenTo === 'backlog' ? t('workspace.theBacklog') : project.sprints.find(sprint => sprint._id === moveOpenTo)?.name ?? t('workspace.theNextSprint');
            toast.success(movedTasks > 0
              ? t('workspace.sprintCompletedMoved', { name: completing.name, count: movedTasks, where })
              : t('workspace.sprintCompleted', { name: completing.name }));
            onTasksChanged();
          }}
        />
      )}

      <ConfirmActionDialog
        open={Boolean(deletingSprint)}
        onOpenChange={open => !open && !deleteBusy && setDeletingSprint(null)}
        title={t('workspace.deleteSprintTitle', { name: deletingSprint?.name ?? '' })}
        description={t('workspace.deleteSprintBody')}
        confirmLabel={t('workspace.deleteSprintConfirm')}
        busyLabel={t('workspace.deleting')}
        busy={deleteBusy}
        onConfirm={confirmDeleteSprint}
      />

      <ConfirmTaskDelete task={confirmDelete} tasks={tasks} onCancel={() => setConfirmDelete(null)} onConfirm={commitDeleteTask} />
    </>
  );
};

export default ProjectWorkspace;
