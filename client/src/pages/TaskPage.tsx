import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AlertCircle, CheckSquare, Clock, Plus, X } from 'lucide-react';
import StatCard from '../components/StatCard';
import Sidebar from '../components/Sidebar';
import { Button } from '@/components/ui/button';
import {
  BoardView, CalendarView, ConfirmDeleteDialog, DEFAULT_FILTERS, ListView, TASK_VIEWS, TaskFormDialog,
  TaskToolbar, TimelineView, ViewSwitcher, applyFilters, getTaskStats, useTasks,
  type Task, type TaskFilters, type TaskFormValues, type TaskView,
} from '@/features/tasks';

interface UserData {
  _id: string;
  name: string;
  email: string;
  onboardingComplete?: boolean;
  activeWorkspace?: string;
  activeWorkspaceSlug?: string;
  workspaces?: string[];
}

type FormState =
  | { mode: 'closed' }
  | { mode: 'create'; defaults?: Partial<TaskFormValues> }
  | { mode: 'edit'; task: Task };

const readStoredUser = (): UserData | null => {
  try {
    const userData = localStorage.getItem('user');
    return userData ? JSON.parse(userData) : null;
  } catch {
    return null;
  }
};

interface TaskPageProps {
  /** View shown when the URL has no `?view=` (e.g. the Calendar menu entry). */
  defaultView?: TaskView;
}

const TaskPage = ({ defaultView = 'list' }: TaskPageProps) => {
  const navigate = useNavigate();
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  const [user, setUser] = useState<UserData | null>(readStoredUser);
  const [filters, setFilters] = useState<TaskFilters>(DEFAULT_FILTERS);
  const [form, setForm] = useState<FormState>({ mode: 'closed' });
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);

  const { tasks, loading, error, clearError, createTask, updateTask, deleteTask } = useTasks(workspaceSlug);

  const requestedView = searchParams.get('view') as TaskView | null;
  const view: TaskView = requestedView && TASK_VIEWS.includes(requestedView) ? requestedView : defaultView;
  const setView = (next: TaskView) => setSearchParams({ view: next }, { replace: true });

  // Auth + onboarding guard
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token || !user) {
      navigate('/login');
      return;
    }
    if (!user.onboardingComplete) navigate('/onboarding');
  }, [navigate, user]);

  const visibleTasks = useMemo(() => applyFilters(tasks, filters), [tasks, filters]);
  const stats = useMemo(() => getTaskStats(tasks), [tasks]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    navigate('/');
  };

  const viewProps = {
    tasks: visibleTasks,
    onUpdate: updateTask,
    onEdit: (task: Task) => setForm({ mode: 'edit', task }),
    onDelete: setTaskToDelete,
    onCreate: (defaults?: Partial<TaskFormValues>) => setForm({ mode: 'create', defaults }),
  };

  if (!user) return null;

  return (
    <Sidebar user={user} onLogout={handleLogout}>
      <div className="space-y-6">
        <header className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">My Tasks</h1>
            <p className="text-slate-500 text-sm mt-1">Manage and track all your tasks</p>
          </div>
          <Button
            onClick={() => setForm({ mode: 'create' })}
            disabled={loading || !workspaceSlug}
            className="h-9 rounded-lg gap-2 bg-primary hover:bg-primary-hover shadow-sm text-sm text-white self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" /> Add Task
          </Button>
        </header>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5" aria-busy="true" aria-label="Loading tasks">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm animate-pulse">
                <div className="h-5 w-24 bg-slate-200 rounded mb-4"></div>
                <div className="h-8 w-12 bg-slate-200 rounded mb-2"></div>
                <div className="h-4 w-32 bg-slate-200 rounded"></div>
              </div>
            ))}
          </div>
        ) : (
          <>
            {error && (
              <div role="alert" className="flex items-start justify-between gap-3 p-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg">
                <span className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  {error}
                </span>
                <button type="button" onClick={clearError} aria-label="Dismiss" className="text-red-400 hover:text-red-600">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              <StatCard title="Total Tasks" value={stats.total} subtitle="All tasks in this workspace" icon={<CheckSquare className="w-4 h-4" />} colorClass="text-slate-600" />
              <StatCard title="In Progress" value={stats.inProgress} subtitle="Currently being worked on" icon={<Clock className="w-4 h-4" />} colorClass="text-blue-600" />
              <StatCard title="Completed" value={stats.completed} subtitle="Tasks finished" icon={<CheckSquare className="w-4 h-4" />} colorClass="text-emerald-600" />
              <StatCard title="Pending" value={stats.pending} subtitle="Awaiting your action" icon={<AlertCircle className="w-4 h-4" />} colorClass="text-amber-600" />
            </div>

            <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
              <ViewSwitcher value={view} onChange={setView} />
              <TaskToolbar filters={filters} onChange={setFilters} showSort={view === 'list'} />
            </div>

            {view === 'list' && <ListView {...viewProps} totalCount={tasks.length} />}
            {view === 'board' && <BoardView {...viewProps} />}
            {view === 'calendar' && <CalendarView {...viewProps} />}
            {view === 'timeline' && <TimelineView {...viewProps} />}
          </>
        )}
      </div>

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
    </Sidebar>
  );
};

export default TaskPage;
