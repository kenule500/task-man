import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { AlarmClock, CheckSquare, Clock, ListTodo, Plus } from 'lucide-react';
import AppShell from '@/components/AppShell';
import { Alert, PageHeader, SkeletonBoard, SkeletonList, StatCard, Surface, toast } from '@/components/ds';
import { markBoardTried } from '@/components/dashboard/getStarted';
import { Button } from '@/components/ui/button';
import { useProjectDirectory, useProjects } from '@/features/projects';
import { usePermissions } from '@/hooks/usePermissions';
import { useBoardUrlState } from '@/features/tasks/hooks/useBoardSettings';
import ScopeBar from '@/features/tasks/components/ScopeBar';
import { ViewsMenu, useUrlFilters } from '@/features/views';
import {
  BoardView, ConfirmTaskDelete, CalendarView, DELETE_UNDO_MS, FILTER_PARAMS, ListView, TASK_VIEWS, TaskDetailDialog, TaskFormDialog,
  TaskToolbar, TimelineView, ViewSwitcher, applyFilters, collectLabels, dateKeyOf, downloadCsv, getTaskStats, tasksCsvFilename, tasksToCsv,
  tasksApi, useTasks, useWorkspaceMembers, epicsOf, hasScope, matchesFilters, resolveScopeFilters, scopeProjectOf, scopeSprintOf,
  type Task, type TaskDetailActions, type TaskFormValues, type TaskView,
} from '@/features/tasks';

type FormState =
  | { mode: 'closed' }
  | { mode: 'create'; defaults?: Partial<TaskFormValues> }
  | { mode: 'edit'; task: Task };

interface TaskPageProps {
  /** View shown when the URL has no `?view=` (e.g. the Calendar menu entry). */
  defaultView?: TaskView;
}

const TaskPage = ({ defaultView = 'list' }: TaskPageProps) => {
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { can, user, loading: permissionsLoading } = usePermissions();
  const canWrite = can('tasks:write');
  const canDelete = can('tasks:delete');
  const canReadUsers = can('users:read');
  const canManageBoard = can('settings:manage');
  const boardControls = useBoardUrlState();
  const currentUser = useMemo(() => (user ? { _id: user._id, name: user.name } : null), [user]);

  // Filters live in the URL (?q=&status=&priority=&type=&label=&epic=&project=&sprint=&assignedToMe=&sort=) so any view is shareable by link
  const [filters, setFilters] = useUrlFilters();
  const [form, setForm] = useState<FormState>({ mode: 'closed' });
  const [detailId, setDetailId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Task | null>(null);

  const {
    tasks, loading, error, clearError, createTask, updateTask, deleteTask, undoDelete,
    addComment, removeComment, uploadAttachment, removeAttachment, downloadAttachment, reload,
  } = useTasks(workspaceSlug);
  const { projects } = useProjects(workspaceSlug);
  const { byName } = useProjectDirectory();

  const requestedView = searchParams.get('view') as TaskView | null;
  const view: TaskView = requestedView && TASK_VIEWS.includes(requestedView) ? requestedView : defaultView;
  // Members feed the task form and the list's bulk "assign" action
  const { members, loading: membersLoading } = useWorkspaceMembers(workspaceSlug, (form.mode !== 'closed' || view === 'list') && canReadUsers);
  // Switching layout keeps the filters (they apply to every view) and drops the rest (open task, board state)
  const setView = (next: TaskView) =>
    setSearchParams(prev => {
      const params = new URLSearchParams({ view: next });
      for (const name of FILTER_PARAMS) {
        const value = prev.get(name);
        if (value !== null) params.set(name, value);
      }
      return params;
    }, { replace: true });

  // Deep links: `?new=1` opens the create dialog, `?task=<id>` opens that task. Each runs once, then leaves the URL.
  const wantsNew = searchParams.get('new') === '1';
  const wantedTaskId = searchParams.get('task');
  const dropParam = (name: string) =>
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.delete(name);
      return next;
    }, { replace: true });

  useEffect(() => {
    if (!wantsNew || permissionsLoading) return;
    // Syncing URL -> UI state once, then the param is removed
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (canWrite) setForm({ mode: 'create' });
    dropParam('new');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsNew, permissionsLoading, canWrite]);

  useEffect(() => {
    if (!wantedTaskId || loading) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (tasks.some(task => task._id === wantedTaskId)) setDetailId(wantedTaskId);
    dropParam('task');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantedTaskId, loading, tasks]);

  // Showing the board ticks the "try the board" step of the dashboard checklist
  useEffect(() => {
    if (workspaceSlug && view === 'board') markBoardTried(workspaceSlug);
  }, [workspaceSlug, view]);

  const labels = useMemo(() => collectLabels(tasks), [tasks]);
  const epics = useMemo(() => epicsOf(tasks), [tasks]);
  // A label or epic filter whose target no longer exists would hide everything: fall back to "all"
  const activeFilters = useMemo(() => {
    const labelGone = Boolean(filters.label && filters.label !== 'all' && !labels.some(label => label.toLowerCase() === filters.label?.toLowerCase()));
    const epicGone = Boolean(filters.epic && filters.epic !== 'all' && filters.epic !== 'none' && !epics.some(epic => epic._id === filters.epic));
    return labelGone || epicGone
      ? { ...filters, ...(labelGone && { label: 'all' }), ...(epicGone && { epic: 'all' }) }
      : filters;
  }, [filters, labels, epics]);
  // Lets the search find "WEB-12" and labels the CSV key column
  const projectKeyOf = useCallback((task: Task) => (task.project ? byName(task.project)?.key : undefined), [byName]);
  // `sprint=active` becomes the running sprint's id; the same filters drive every view
  const resolvedFilters = useMemo(() => resolveScopeFilters(activeFilters, projects), [activeFilters, projects]);
  // The board's columns are the statuses, so a status filter set in another view must not hide columns
  const visibleTasks = useMemo(
    () => applyFilters(tasks, view === 'board' ? { ...resolvedFilters, status: 'all' } : resolvedFilters, currentUser?._id, projectKeyOf),
    [tasks, view, resolvedFilters, currentUser?._id, projectKeyOf],
  );
  // Inside a project or sprint the stats and status counts describe that scope, not the whole workspace
  const scoped = hasScope(activeFilters);
  const scopedTasks = useMemo(
    () => (scoped ? tasks.filter(task => matchesFilters(task, { search: '', status: 'all', project: resolvedFilters.project, sprint: resolvedFilters.sprint })) : tasks),
    [tasks, scoped, resolvedFilters.project, resolvedFilters.sprint],
  );
  const stats = useMemo(() => getTaskStats(scopedTasks), [scopedTasks]);
  // New tasks start inside the scope: its project and (unless it is over) its sprint
  const scopeDefaults = useMemo((): Partial<TaskFormValues> => {
    const project = scopeProjectOf(activeFilters, projects);
    const sprint = scopeSprintOf(activeFilters, projects);
    return {
      ...(project ? { project: project.name } : {}),
      ...(sprint && sprint.status !== 'completed' ? { sprint: sprint._id } : {}),
    };
  }, [activeFilters, projects]);
  const clearScope = () => setFilters({ ...filters, project: 'all', sprint: 'all' });
  const detailTask = detailId ? tasks.find(task => task._id === detailId) ?? null : null;

  /** Asks first; see commitDelete. */
  const handleDelete = (task: Task) => {
    if (canDelete) setConfirmDelete(task);
  };

  /** Hides the task at once; the request is only sent when the undo toast expires. */
  const commitDelete = (task: Task) => {
    setConfirmDelete(null);
    if (!canDelete) return;
    // Deleting the task being viewed closes it (a subtask goes back to its parent); a row of the open task keeps it open
    if (detailId === task._id) setDetailId(task.parent ?? null);
    deleteTask(task._id);
    const subtaskCount = tasks.filter(item => item.parent === task._id).length;
    toast({
      title: task.parent ? 'Subtask deleted' : 'Task deleted',
      description: subtaskCount ? `${task.title} and ${subtaskCount} ${subtaskCount === 1 ? 'subtask' : 'subtasks'}` : task.title,
      duration: DELETE_UNDO_MS,
      // The request is sent when the time is up, so the countdown must not pause on hover
      pauseOnHover: false,
      action: { label: 'Undo', onClick: () => undoDelete(task._id) },
    });
  };

  /** Downloads the tasks currently shown (filters applied) as a spreadsheet-friendly CSV. */
  const exportCsv = () => {
    if (visibleTasks.length === 0) return;
    const sprints = projects.flatMap(project => project.sprints);
    const csv = tasksToCsv(visibleTasks, tasks, {
      projectKeyOf,
      sprintName: id => sprints.find(sprint => sprint._id === id)?.name,
    });
    downloadCsv(tasksCsvFilename(workspaceSlug ?? ''), csv);
    toast.success(`Exported ${visibleTasks.length} ${visibleTasks.length === 1 ? 'task' : 'tasks'}`);
  };

  const handleEdit = (task: Task) => {
    if (!canWrite) return;
    setDetailId(null);
    setForm({ mode: 'edit', task });
  };

  const detailActions: TaskDetailActions = {
    addComment: (id, text) => addComment(id, text, currentUser ?? undefined),
    removeComment,
    uploadAttachment,
    removeAttachment,
    downloadAttachment,
    updateTask: canWrite ? updateTask : async () => null,
    openTask: (task: Task) => setDetailId(task._id),
    createSubtask: async (parent: Task, title: string) => {
      await createTask({
        title,
        parent: parent._id,
        deadline: dateKeyOf(parent.deadline),
        ...(parent.project ? { project: parent.project } : {}),
      });
    },
  };

  const viewProps = {
    tasks: visibleTasks,
    canWrite,
    canDelete,
    onUpdate: canWrite ? updateTask : async () => null,
    onEdit: handleEdit,
    onOpen: (task: Task) => setDetailId(task._id),
    onDelete: handleDelete,
    onCreate: (defaults?: Partial<TaskFormValues>) => {
      if (canWrite) setForm({ mode: 'create', defaults: { ...scopeDefaults, ...defaults } });
    },
  };

  return (
    <AppShell>
      <PageHeader
        title="Tasks"
        description={canWrite ? 'All work in this workspace, as a list, board, calendar or timeline' : 'All work in this workspace (read-only access)'}
        actions={canWrite ? (
          <Button
            onClick={() => setForm({ mode: 'create', defaults: scopeDefaults })}
            disabled={loading || !workspaceSlug}
            // Phones use the "+" button of the bottom navigation instead
            className="h-10 gap-2 rounded-lg bg-primary text-sm text-white shadow-sm hover:bg-primary-hover max-md:hidden sm:h-9"
          >
            <Plus className="w-4 h-4" /> Add Task
          </Button>
        ) : undefined}
      />

      {loading ? (
        view === 'board' ? <SkeletonBoard label="Loading board" /> : <SkeletonList label="Loading tasks" rows={6} />
      ) : (
        <>
          {error && <Alert tone="error" onDismiss={clearError}>{error}</Alert>}

          {/* Phones go straight to the tasks; the dashboard has the same numbers */}
          <div className="hidden grid-cols-2 gap-3 sm:grid sm:gap-5 lg:grid-cols-4">
            <StatCard className="p-4 sm:p-5" title="Total tasks" value={stats.total} subtitle={`${stats.pending} pending`} icon={<ListTodo className="w-4 h-4" />} colorClass="text-slate-600" />
            <StatCard className="p-4 sm:p-5" title="In progress" value={stats.inProgress} subtitle="Currently being worked on" icon={<Clock className="w-4 h-4" />} colorClass="text-blue-600" />
            <StatCard className="p-4 sm:p-5" title="Completed" value={stats.completed} subtitle={stats.total ? `${Math.round((stats.completed / stats.total) * 100)}% of all tasks` : 'Nothing yet'} icon={<CheckSquare className="w-4 h-4" />} colorClass="text-success-fg" />
            <StatCard className="p-4 sm:p-5" title="Overdue" value={stats.overdue} subtitle={stats.overdue ? 'Missed deadlines' : 'All on track'} icon={<AlarmClock className="w-4 h-4" />} colorClass="text-danger-fg" />
          </div>

          {workspaceSlug && scoped && (
            <ScopeBar slug={workspaceSlug} filters={activeFilters} projects={projects} onClear={clearScope} />
          )}

          <Surface padding="sm" className="space-y-4">
            <ViewSwitcher value={view} onChange={setView} />
            <TaskToolbar
              filters={activeFilters}
              onChange={setFilters}
              showStatus={view !== 'board'}
              showSort={view === 'list'}
              labels={labels}
              epics={epics}
              projects={projects}
              canFilterMine={Boolean(currentUser)}
              onExport={exportCsv}
              exportCount={visibleTasks.length}
              viewsMenu={workspaceSlug ? (
                <ViewsMenu slug={workspaceSlug} layout={view} params={searchParams} canManageShared={canManageBoard} />
              ) : undefined}
              counts={{ all: stats.total, pending: stats.pending, 'in-progress': stats.inProgress, completed: stats.completed }}
            />
          </Surface>

          {view === 'list' && (
            <ListView
              {...viewProps}
              totalCount={scopedTasks.length}
              allTasks={tasks}
              projects={projects}
              members={members}
              // Bulk changes go straight to the server, then the list reloads (one request for many tasks)
              onBulkUpdate={workspaceSlug ? async (ids, patch) => { await tasksApi.bulkUpdate(workspaceSlug, ids, patch); await reload(); } : undefined}
              onBulkDelete={workspaceSlug ? async ids => { await tasksApi.bulkDelete(workspaceSlug, ids); await reload(); } : undefined}
            />
          )}
          {view === 'board' && (
            <BoardView
              {...viewProps}
              controls={boardControls}
              allTasks={tasks}
              currentUserId={currentUser?._id}
              workspaceSlug={workspaceSlug}
              canManageBoard={canManageBoard}
            />
          )}
          {view === 'calendar' && <CalendarView {...viewProps} />}
          {view === 'timeline' && <TimelineView {...viewProps} />}
        </>
      )}

      {detailTask && (
        <TaskDetailDialog
          key={detailTask._id}
          task={detailTask}
          onOpenChange={open => !open && setDetailId(null)}
          tasks={tasks}
          currentUser={currentUser}
          canWrite={canWrite}
          canDelete={canDelete}
          onEdit={handleEdit}
          onDelete={handleDelete}
          actions={detailActions}
          projects={projects}
          workspaceSlug={workspaceSlug}
        />
      )}

      <ConfirmTaskDelete task={confirmDelete} tasks={tasks} onCancel={() => setConfirmDelete(null)} onConfirm={commitDelete} />

      {form.mode !== 'closed' && (
        <TaskFormDialog
          key={form.mode === 'edit' ? form.task._id : 'new'}
          open
          onOpenChange={open => !open && setForm({ mode: 'closed' })}
          task={form.mode === 'edit' ? form.task : null}
          defaults={form.mode === 'create' ? form.defaults : undefined}
          tasks={tasks}
          members={members}
          membersLoading={membersLoading}
          canListMembers={canReadUsers}
          currentUser={currentUser}
          projects={projects}
          onSubmit={async input => {
            const saved = await (form.mode === 'edit' ? updateTask(form.task._id, input) : createTask(input));
            if (saved) toast.success(form.mode === 'edit' ? 'Task saved' : 'Task created');
            return saved;
          }}
        />
      )}
    </AppShell>
  );
};

export default TaskPage;
