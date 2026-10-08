import { useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { AlarmClock, CheckSquare, Clock, ListTodo, Plus } from 'lucide-react';
import AppShell from '@/components/AppShell';
import { Alert, PageHeader, SkeletonCards, StatCard, Surface } from '@/components/ds';
import { Button } from '@/components/ui/button';
import {
  BoardView, CalendarView, ConfirmDeleteDialog, DEFAULT_FILTERS, ListView, TASK_VIEWS, TaskFormDialog,
  TaskToolbar, TimelineView, ViewSwitcher, applyFilters, getTaskStats, useTasks,
  type Task, type TaskFilters, type TaskFormValues, type TaskView,
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

  const [filters, setFilters] = useState<TaskFilters>(DEFAULT_FILTERS);
  const [form, setForm] = useState<FormState>({ mode: 'closed' });
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);

  const { tasks, loading, error, clearError, createTask, updateTask, deleteTask } = useTasks(workspaceSlug);

  const requestedView = searchParams.get('view') as TaskView | null;
  const view: TaskView = requestedView && TASK_VIEWS.includes(requestedView) ? requestedView : defaultView;
  const setView = (next: TaskView) => setSearchParams({ view: next }, { replace: true });

  const visibleTasks = useMemo(() => applyFilters(tasks, filters), [tasks, filters]);
  const stats = useMemo(() => getTaskStats(tasks), [tasks]);

  const viewProps = {
    tasks: visibleTasks,
    onUpdate: updateTask,
    onEdit: (task: Task) => setForm({ mode: 'edit', task }),
    onDelete: setTaskToDelete,
    onCreate: (defaults?: Partial<TaskFormValues>) => setForm({ mode: 'create', defaults }),
  };

  return (
    <AppShell>
      <PageHeader
        title="My Tasks"
        description="Manage and track all your tasks"
        actions={
          <Button
            onClick={() => setForm({ mode: 'create' })}
            disabled={loading || !workspaceSlug}
            className="h-10 gap-2 rounded-lg bg-primary text-sm text-white shadow-sm hover:bg-primary-hover sm:h-9"
          >
            <Plus className="w-4 h-4" /> Add Task
          </Button>
        }
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
              filters={filters}
              onChange={setFilters}
              showSort={view === 'list'}
              counts={{ all: stats.total, pending: stats.pending, 'in-progress': stats.inProgress, completed: stats.completed }}
            />
          </Surface>

          {view === 'list' && <ListView {...viewProps} totalCount={tasks.length} />}
          {view === 'board' && <BoardView {...viewProps} />}
          {view === 'calendar' && <CalendarView {...viewProps} />}
          {view === 'timeline' && <TimelineView {...viewProps} />}
        </>
      )}

      {form.mode !== 'closed' && (
        <TaskFormDialog
          key={form.mode === 'edit' ? form.task._id : 'new'}
          open
          onOpenChange={open => !open && setForm({ mode: 'closed' })}
          task={form.mode === 'edit' ? form.task : null}
          defaults={form.mode === 'create' ? form.defaults : undefined}
          tasks={tasks}
          onSubmit={input => (form.mode === 'edit' ? updateTask(form.task._id, input) : createTask(input))}
        />
      )}

      <ConfirmDeleteDialog
        task={taskToDelete}
        onCancel={() => setTaskToDelete(null)}
        onConfirm={async task => {
          await deleteTask(task._id);
          setTaskToDelete(null);
        }}
      />
    </AppShell>
  );
};

export default TaskPage;
