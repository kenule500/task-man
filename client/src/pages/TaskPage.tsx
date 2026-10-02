import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../utils/api';
import StatCard from '../components/StatCard';
import Sidebar from '../components/Sidebar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, CheckSquare, Clock, AlertCircle, Plus } from 'lucide-react';

import { useTasks } from '../features/tasks/useTasks';
import TaskViewSwitcher, { type TaskView } from '../features/tasks/TaskViewSwitcher';
import TaskListView from '../features/tasks/TaskListView';
import TaskBoardView from '../features/tasks/TaskBoardView';
import TaskCalendarView from '../features/tasks/TaskCalendarView';
import TaskTimelineView from '../features/tasks/TaskTimelineView';
import TaskFormDialog from '../features/tasks/TaskFormDialog';
import TaskDetailDialog from '../features/tasks/TaskDetailDialog';
import UndoToast from '../features/tasks/components/UndoToast';
import type { Task, TaskInput, TaskMember, TaskStatus } from '../features/tasks/types';

interface UserData {
  _id: string;
  name: string;
  email: string;
  onboardingComplete?: boolean;
  activeWorkspace?: string;
  activeWorkspaceSlug?: string;
  workspaces?: string[];
}

interface RawWorkspaceMember {
  user: TaskMember | string;
}

const VIEW_STORAGE_KEY = 'taskman.taskView';

const TaskPage = () => {
  const navigate = useNavigate();
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();

  const [user, setUser] = useState<UserData | null>(() => {
    try {
      const userData = localStorage.getItem('user');
      return userData ? JSON.parse(userData) : null;
    } catch { return null; }
  });

  const [view, setView] = useState<TaskView>(() => {
    const saved = localStorage.getItem(VIEW_STORAGE_KEY);
    return (saved as TaskView) || 'list';
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [members, setMembers] = useState<TaskMember[]>([]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [defaultStatus, setDefaultStatus] = useState<TaskStatus>('pending');
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const [focusCommentsOnOpen, setFocusCommentsOnOpen] = useState(false);

  const {
    tasks, loading, error, setError,
    createTask, updateTask, moveTask, requestDelete, undoDelete, pendingDeletes,
    uploadCoverImage, removeCoverImage, addAttachment, removeAttachment,
    addComment, removeComment,
  } = useTasks(workspaceSlug);

  // Looked up live from `tasks` (rather than kept as a standalone copy) so the
  // open dialog reflects updates immediately — e.g. a new comment appearing.
  const editingTask = editingTaskId ? tasks.find(t => t._id === editingTaskId) ?? null : null;
  const detailTask = detailTaskId ? tasks.find(t => t._id === detailTaskId) ?? null : null;

  // Auth + onboarding guard
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token || !user) {
      navigate('/login');
      return;
    }
    if (!user.onboardingComplete) {
      navigate('/onboarding');
      return;
    }
  }, [navigate, user]);

  useEffect(() => {
    localStorage.setItem(VIEW_STORAGE_KEY, view);
  }, [view]);

  // Workspace members, for the assignee picker
  useEffect(() => {
    if (!workspaceSlug) return;
    (async () => {
      try {
        const response = await api.get(`/workspaces/${workspaceSlug}`);
        const rawMembers: RawWorkspaceMember[] = response.data?.members || [];
        const resolved = rawMembers
          .map(m => (typeof m.user === 'string' ? null : m.user))
          .filter((m): m is TaskMember => !!m);
        setMembers(resolved);
      } catch (err) {
        console.error('Failed to load workspace members:', err);
      }
    })();
  }, [workspaceSlug]);

  const searchedTasks = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return tasks;
    return tasks.filter(task =>
      task.title.toLowerCase().includes(term) ||
      (task.description?.toLowerCase().includes(term) ?? false)
    );
  }, [tasks, searchTerm]);

  const stats = {
    total: tasks.length,
    inProgress: tasks.filter(t => t.status === 'in-progress').length,
    completed: tasks.filter(t => t.status === 'completed').length,
    pending: tasks.filter(t => t.status === 'pending').length,
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    navigate('/');
  };

  const openCreateDialog = useCallback((status: TaskStatus = 'pending') => {
    setEditingTaskId(null);
    setDefaultStatus(status);
    setDialogOpen(true);
  }, []);

  const openEditDialog = useCallback((task: Task) => {
    setEditingTaskId(task._id);
    setDialogOpen(true);
  }, []);

  const openDetailDialog = useCallback((task: Task) => {
    setDetailTaskId(task._id);
    setFocusCommentsOnOpen(false);
    setDetailDialogOpen(true);
  }, []);

  const openDetailDialogWithComments = useCallback((task: Task) => {
    setDetailTaskId(task._id);
    setFocusCommentsOnOpen(true);
    setDetailDialogOpen(true);
  }, []);

  const handleDetailDelete = useCallback((taskId: string) => {
    setDetailDialogOpen(false);
    requestDelete(taskId);
  }, [requestDelete]);

  const handleCreate = useCallback((input: TaskInput) => createTask(input), [createTask]);
  const handleUpdate = useCallback((taskId: string, input: TaskInput) => updateTask(taskId, input), [updateTask]);

  const handleToggleComplete = useCallback((task: Task) => {
    const nextStatus: TaskStatus = task.status === 'completed' ? 'pending' : 'completed';
    updateTask(task._id, { status: nextStatus }).catch(err => {
      console.error('toggleComplete error:', err);
      setError('Could not update the task.');
    });
  }, [updateTask, setError]);

  if (!user) return null;

  const pendingDeleteItems = Object.entries(pendingDeletes).map(([id, p]) => ({ id, title: p.task.title }));

  return (
    <Sidebar user={user} onLogout={handleLogout}>
      <div className="space-y-6">

        <header className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">My Tasks</h1>
            <p className="text-slate-500 text-sm mt-1">Manage and track all your tasks</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search tasks..."
                className="pl-9 h-9 bg-white border-slate-200 rounded-lg text-sm"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                disabled={loading}
              />
            </div>
            <Button
              onClick={() => openCreateDialog('pending')}
              className="h-9 rounded-lg gap-2 bg-primary hover:bg-primary-hover shadow-sm text-sm text-white"
            >
              <Plus className="w-4 h-4" /> Add Task
            </Button>
          </div>
        </header>

        {loading ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm animate-pulse">
                  <div className="h-5 w-24 bg-slate-200 rounded mb-4"></div>
                  <div className="h-8 w-12 bg-slate-200 rounded mb-2"></div>
                  <div className="h-4 w-32 bg-slate-200 rounded"></div>
                </div>
              ))}
            </div>
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 animate-pulse space-y-3">
              {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-12 bg-slate-100 rounded-lg" />)}
            </div>
          </div>
        ) : (
          <>
            {error && (
              <div className="flex items-start gap-2 p-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              <StatCard title="Total Tasks" value={stats.total} subtitle="All tasks in this workspace" icon={<CheckSquare className="w-4 h-4" />} colorClass="text-slate-600" />
              <StatCard title="In Progress" value={stats.inProgress} subtitle="Currently being worked on" icon={<Clock className="w-4 h-4" />} colorClass="text-blue-600" />
              <StatCard title="Completed" value={stats.completed} subtitle="Finished tasks" icon={<CheckSquare className="w-4 h-4" />} colorClass="text-emerald-600" />
              <StatCard title="To Do" value={stats.pending} subtitle="Not started yet" icon={<AlertCircle className="w-4 h-4" />} colorClass="text-amber-600" />
            </div>

            <div className="flex items-center justify-between">
              <TaskViewSwitcher view={view} onChange={setView} />
            </div>

            {view === 'list' && (
              <TaskListView
                tasks={searchedTasks}
                totalCount={tasks.length}
                onToggleComplete={handleToggleComplete}
                onEdit={openEditDialog}
                onDelete={requestDelete}
              />
            )}
            {view === 'board' && (
              <TaskBoardView
                tasks={searchedTasks}
                allTasks={tasks}
                onAddTask={openCreateDialog}
                onOpen={openDetailDialog}
                onOpenComments={openDetailDialogWithComments}
                onEdit={openEditDialog}
                onDelete={requestDelete}
                onMove={moveTask}
              />
            )}
            {view === 'calendar' && (
              <TaskCalendarView tasks={searchedTasks} onEdit={openDetailDialog} />
            )}
            {view === 'timeline' && (
              <TaskTimelineView tasks={searchedTasks} onEdit={openDetailDialog} />
            )}
          </>
        )}
      </div>

      <TaskFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        task={editingTask}
        defaultStatus={defaultStatus}
        members={members}
        allTasks={tasks}
        onCreate={handleCreate}
        onUpdate={handleUpdate}
        onUploadCoverImage={uploadCoverImage}
        onRemoveCoverImage={removeCoverImage}
        onAddAttachment={addAttachment}
        onRemoveAttachment={removeAttachment}
      />

      <TaskDetailDialog
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
        task={detailTask}
        allTasks={tasks}
        currentUserId={user._id}
        autoFocusComments={focusCommentsOnOpen}
        onDelete={handleDetailDelete}
        onAddComment={addComment}
        onRemoveComment={removeComment}
      />

      <UndoToast items={pendingDeleteItems} onUndo={undoDelete} />
    </Sidebar>
  );
};

export default TaskPage;
