import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { AlarmClock, CheckSquare, Clock, ListTodo, Plus } from 'lucide-react';
import AppShell from '@/components/AppShell';
import { Alert, PageHeader, SkeletonCards, StatCard, Surface, toast } from '@/components/ds';
import { markBoardTried } from '@/components/dashboard/getStarted';
import { Button } from '@/components/ui/button';
import { useProjectDirectory, useProjects } from '@/features/projects';
import { usePermissions } from '@/hooks/usePermissions';
import {
  BoardView, ConfirmTaskDelete, CalendarView, DEFAULT_FILTERS, DELETE_UNDO_MS, ListView, TASK_VIEWS, TaskDetailDialog, TaskFormDialog,
  TaskToolbar, TimelineView, ViewSwitcher, applyFilters, collectLabels, dateKeyOf, downloadCsv, getTaskStats, tasksCsvFilename, tasksToCsv,
  useTasks, useWorkspaceMembers,
  type Task, type TaskDetailActions, type TaskFilters, type TaskFormValues, type TaskView,
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
  const currentUser = useMemo(() => (user ? { _id: user._id, name: user.name } : null), [user]);

  const [filters, setFilters] = useState<TaskFilters>(DEFAULT_FILTERS);
  const [form, setForm] = useState<FormState>({ mode: 'closed' });
  const [detailId, setDetailId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Task | null>(null);

  const {
    tasks, loading, error, clearError, createTask, updateTask, deleteTask, undoDelete,
    addComment, removeComment, uploadAttachment, removeAttachment, downloadAttachment,
  } = useTasks(workspaceSlug);
  const { projects } = useProjects(workspaceSlug);
  const { byName } = useProjectDirectory();
  const { members, loading: membersLoading } = useWorkspaceMembers(workspaceSlug, form.mode !== 'closed' && canReadUsers);

  const requestedView = searchParams.get('view') as TaskView | null;
  const view: TaskView = requestedView && TASK_VIEWS.includes(requestedView) ? requestedView : defaultView;
  const setView = (next: TaskView) => setSearchParams({ view: next }, { replace: true });

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
  // A label filter whose label no longer exists would hide everything: fall back to "all"
  const activeFilters = useMemo(
    () => (filters.label && filters.label !== 'all' && !labels.some(label => label.toLowerCase() === filters.label?.toLowerCase())
      ? { ...filters, label: 'all' }
      : filters),
    [filters, labels],
  );
  // Lets the search find "WEB-12" and labels the CSV key column
  const projectKeyOf = useCallback((task: Task) => (task.project ? byName(task.project)?.key : undefined), [byName]);
  const visibleTasks = useMemo(
    () => applyFilters(tasks, activeFilters, currentUser?._id, projectKeyOf),
    [tasks, activeFilters, currentUser?._id, projectKeyOf],
  );
  const stats = useMemo(() => getTaskStats(tasks), [tasks]);
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
      if (canWrite) setForm({ mode: 'create', defaults });
    },
  };

  return (
    <AppShell>
      <PageHeader
        title="My Tasks"
        description={canWrite ? 'Manage and track all your tasks' : 'Track all your tasks (read-only access)'}
        actions={canWrite ? (
          <Button
            onClick={() => setForm({ mode: 'create' })}
            disabled={loading || !workspaceSlug}
            // Phones use the "+" button of the bottom navigation instead
            className="h-10 gap-2 rounded-lg bg-primary text-sm text-white shadow-sm hover:bg-primary-hover max-md:hidden sm:h-9"
          >
            <Plus className="w-4 h-4" /> Add Task
          </Button>
        ) : undefined}
      />

      {loading ? (
        <SkeletonCards count={4} columns="grid-cols-2 lg:grid-cols-4" className="gap-3 sm:gap-5" />
      ) : (
        <>
          {error && <Alert tone="error" onDismiss={clearError}>{error}</Alert>}

          {/* Phones go straight to the tasks; the dashboard has the same numbers */}
          <div className="hidden grid-cols-2 gap-3 sm:grid sm:gap-5 lg:grid-cols-4">
            <StatCard className="p-4 sm:p-5" title="Total Tasks" value={stats.total} subtitle={`${stats.pending} pending`} icon={<ListTodo className="w-4 h-4" />} colorClass="text-slate-600" />
            <StatCard className="p-4 sm:p-5" title="In Progress" value={stats.inProgress} subtitle="Currently being worked on" icon={<Clock className="w-4 h-4" />} colorClass="text-blue-600" />
            <StatCard className="p-4 sm:p-5" title="Completed" value={stats.completed} subtitle={stats.total ? `${Math.round((stats.completed / stats.total) * 100)}% of all tasks` : 'Nothing yet'} icon={<CheckSquare className="w-4 h-4" />} colorClass="text-emerald-600" />
            <StatCard className="p-4 sm:p-5" title="Overdue" value={stats.overdue} subtitle={stats.overdue ? 'Missed deadlines' : 'All on track'} icon={<AlarmClock className="w-4 h-4" />} colorClass="text-red-600" />
          </div>

          <Surface padding="sm" className="space-y-4">
            <ViewSwitcher value={view} onChange={setView} />
            <TaskToolbar
              filters={activeFilters}
              onChange={setFilters}
              showSort={view === 'list'}
              labels={labels}
              canFilterMine={Boolean(currentUser)}
              onExport={exportCsv}
              exportCount={visibleTasks.length}
              counts={{ all: stats.total, pending: stats.pending, 'in-progress': stats.inProgress, completed: stats.completed }}
            />
          </Surface>

          {view === 'list' && <ListView {...viewProps} totalCount={tasks.length} allTasks={tasks} />}
          {view === 'board' && <BoardView {...viewProps} />}
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
