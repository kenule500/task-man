import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../utils/api';
import StatCard from '../components/StatCard';
import TaskRow, { ITask } from '../components/TaskCard';
import Sidebar from '../components/Sidebar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Filter, CheckSquare, Clock, AlertCircle, ArrowUpDown, Plus } from 'lucide-react';

interface UserData {
  _id: string;
  name: string;
  email: string;
  onboardingComplete?: boolean;
  activeWorkspace?: string;
  activeWorkspaceSlug?: string;
  workspaces?: string[];
}

const TaskPage = () => {
  const navigate = useNavigate();
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();

  const [user, setUser] = useState<UserData | null>(() => {
    try {
      const userData = localStorage.getItem('user');
      return userData ? JSON.parse(userData) : null;
    } catch { return null; }
  });

  const [tasks, setTasks] = useState<ITask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'in-progress' | 'completed'>('all');
  const [sortBy, setSortBy] = useState<'createdAt' | 'deadline' | 'priority'>('createdAt');

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

  // Fetch tasks
  const fetchTasks = useCallback(async () => {
    if (!workspaceSlug) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const response = await api.get(`/workspaces/${workspaceSlug}/tasks`);
      setTasks(Array.isArray(response.data) ? response.data : []);
      setError('');
    } catch (err: unknown) {
      const axiosError = err as { response?: { status?: number; data?: { message?: string } } };

      if (axiosError.response?.status === 403 || axiosError.response?.status === 404) {
        setError(`You don't have access to "${workspaceSlug}". Use the workspace switcher to pick another one.`);
        setTasks([]);
      } else {
        console.error('fetchTasks error:', err);
        setError('Failed to load tasks.');
      }
    } finally {
      setLoading(false);
    }
  }, [workspaceSlug]);

  useEffect(() => {
    (async () => {
      await fetchTasks();
    })();
  }, [fetchTasks]);

  // Filter, search, sort
  const filteredTasks = tasks
    .filter(task => {
      const matchesStatus = statusFilter === 'all' || task.status === statusFilter;
      const matchesSearch =
        task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (task.description?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false);
      return matchesStatus && matchesSearch;
    })
    .sort((a, b) => {
      if (sortBy === 'deadline') return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
      if (sortBy === 'priority') {
        const order: Record<string, number> = { high: 1, medium: 2, low: 3 };
        return (order[a.priority || 'medium']) - (order[b.priority || 'medium']);
      }
      return 0;
    });

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

  if (!user) return null;

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
            <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 h-9">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                className="bg-transparent text-sm text-slate-700 outline-none cursor-pointer h-full pr-1"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | 'pending' | 'in-progress' | 'completed')}
                disabled={loading}
              >
                <option value="all">All Status</option>
                <option value="pending">Pending</option>
                <option value="in-progress">In Progress</option>
                <option value="completed">Completed</option>
              </select>
            </div>
            <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 h-9">
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
              <select
                className="bg-transparent text-sm text-slate-700 outline-none cursor-pointer h-full pr-1"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'createdAt' | 'deadline' | 'priority')}
                disabled={loading}
              >
                <option value="createdAt">Newest</option>
                <option value="deadline">By Deadline</option>
                <option value="priority">By Priority</option>
              </select>
            </div>

            <Button className="h-9 rounded-lg gap-2 bg-primary hover:bg-primary-hover shadow-sm text-sm text-white">
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
          </div>
        ) : (
          <>
            {error && (
              <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg">{error}</div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              <StatCard title="Total Tasks" value={stats.total} subtitle="Tasks created this month" icon={<CheckSquare className="w-4 h-4" />} colorClass="text-slate-600" trend="+18%" trendUp={true} />
              <StatCard title="In Progress" value={stats.inProgress} subtitle="Currently being worked on" icon={<Clock className="w-4 h-4" />} colorClass="text-blue-600" trend="-12%" trendUp={false} />
              <StatCard title="Completed" value={stats.completed} subtitle="Tasks finished this week" icon={<CheckSquare className="w-4 h-4" />} colorClass="text-emerald-600" trend="+24%" trendUp={true} />
              <StatCard title="Pending" value={stats.pending} subtitle="Awaiting your action" icon={<AlertCircle className="w-4 h-4" />} colorClass="text-amber-600" trend="+5%" trendUp={true} />
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="grid grid-cols-12 gap-4 px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                <div className="col-span-1 flex items-center">
                  <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-primary" />
                </div>
                <div className="col-span-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Task Name</div>
                <div className="col-span-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">Priority</div>
                <div className="col-span-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</div>
                <div className="col-span-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">Due Date</div>
                <div className="col-span-1"></div>
              </div>

              {filteredTasks.length === 0 ? (
                <div className="text-center py-20">
                  <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400">
                    <CheckSquare className="w-8 h-8" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-700 mb-1">No tasks found</h3>
                  <p className="text-slate-500 text-sm">
                    {tasks.length === 0
                      ? "You're all caught up! Create your first task to get started."
                      : "No tasks match your current filters."}
                  </p>
                </div>
              ) : (
                filteredTasks.map((task) => (
                  <TaskRow
                    key={task._id}
                    task={task}
                    onEdit={() => {}}
                    onDelete={() => {}}
                  />
                ))
              )}

              {filteredTasks.length > 0 && (
                <div className="flex flex-col sm:flex-row justify-between items-center gap-3 px-6 py-4 bg-slate-50/50 border-t border-slate-100">
                  <p className="text-xs text-slate-500">
                    Showing <span className="font-medium text-slate-700">{filteredTasks.length}</span> of <span className="font-medium text-slate-700">{tasks.length}</span> tasks
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Sidebar>
  );
};

export default TaskPage;