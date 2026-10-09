import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { AlarmClock, CheckSquare, Clock, ListTodo, Plus } from 'lucide-react';
import AppShell from '@/components/AppShell';
import { Alert, PageHeader, SkeletonCards, StatCard, Surface, toast } from '@/components/ds';
import { markBoardTried } from '@/components/dashboard/getStarted';
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/hooks/usePermissions';
import {
  BoardView, CalendarView, DEFAULT_FILTERS, DELETE_UNDO_MS, ListView, TASK_VIEWS, TaskDetailDialog, TaskFormDialog,
  TaskToolbar, TimelineView, ViewSwitcher, applyFilters, collectLabels, getTaskStats, useTasks, useWorkspaceMembers,
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
  const { can, user } = usePermissions();
  const canWrite = can('tasks:write');
  const canDelete = can('tasks:delete');
  const canReadUsers = can('users:read');
  const currentUser = useMemo(() => (user ? { _id: user._id, name: user.name } : null), [user]);

  const [filters, setFilters] = useState<TaskFilters>(DEFAULT_FILTERS);
  const [form, setForm] = useState<FormState>({ mode: 'closed' });
  const [detailId, setDetailId] = useState<string | null>(null);

  const {
    tasks, loading, error, clearError, createTask, updateTask, deleteTask, undoDelete,
    addComment, removeComment, uploadAttachment, removeAttachment, downloadAttachment,
  } = useTasks(workspaceSlug);
  const { members, loading: membersLoading } = useWorkspaceMembers(workspaceSlug, form.mode !== 'closed' && canReadUsers);

  const requestedView = searchParams.get('view') as TaskView | null;
  const view: TaskView = requestedView && TASK_VIEWS.includes(requestedView) ? requestedView : defaultView;
  const setView = (next: TaskView) => setSearchParams({ view: next }, { replace: true });

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
  const visibleTasks = useMemo(() => applyFilters(tasks, activeFilters, currentUser?._id), [tasks, activeFilters, currentUser?._id]);
  const stats = useMemo(() => getTaskStats(tasks), [tasks]);
  const detailTask = detailId ? tasks.find(task => task._id === detailId) ?? null : null;

  /** Hides the task at once; the request is only sent when the undo toast expires. */
  const handleDelete = (task: Task) => {
    if (!canDelete) return;
    setDetailId(null);
    deleteTask(task._id);
    toast({
      title: 'Task deleted',
      description: task.title,
      duration: DELETE_UNDO_MS,
      // The request is sent when the time is up, so the countdown must not pause on hover
      pauseOnHover: false,
      action: { label: 'Undo', onClick: () => undoDelete(task._id) },
    });
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
            className="h-10 gap-2 rounded-lg bg-primary text-sm text-white shadow-sm hover:bg-primary-hover sm:h-9"
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

          <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
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
              counts={{ all: stats.total, pending: stats.pending, 'in-progress': stats.inProgress, completed: stats.completed }}
            />
          </Surface>

          {view === 'list' && <ListView {...viewProps} totalCount={tasks.length} />}
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
        />
      )}

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
