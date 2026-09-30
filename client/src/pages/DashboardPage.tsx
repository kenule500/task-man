import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import api from '../utils/api';
import {
  LayoutDashboard,
  Rocket,
  Users,
  Calendar,
  ArrowRight,
  Sparkles,
  Copy,
  Check,
} from 'lucide-react';

interface UserData {
  _id: string;
  name: string;
  email: string;
  onboardingComplete?: boolean;
  activeWorkspace?: string;
  activeWorkspaceSlug?: string;
  workspaces?: string[];
  createdAt?: string;
}

interface Workspace {
  _id: string;
  name: string;
  slug: string;
  inviteCode: string;
  createdAt?: string;
  members?: { user: string; role: string; joinedAt: string }[];
}

const DashboardPage = () => {
  const navigate = useNavigate();
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();

  const [user, setUser] = useState<UserData | null>(() => {
    try {
      const userData = localStorage.getItem('user');
      return userData ? JSON.parse(userData) : null;
    } catch { return null; }
  });

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [workspaceCount, setWorkspaceCount] = useState(0);
  const [loading, setLoading] = useState(!!workspaceSlug);
  const [copied, setCopied] = useState(false);

  // Auth guard
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

  // Fetch live data: current workspace + user's workspace count
  useEffect(() => {
    if (!workspaceSlug) return;

    (async () => {
      try {
        setLoading(true);

        const [workspaceRes, allWorkspacesRes] = await Promise.all([
          api.get(`/workspaces/${workspaceSlug}`),
          api.get('/workspaces'),
        ]);

        setWorkspace(workspaceRes.data);
        setWorkspaceCount(allWorkspacesRes.data?.length || 0);
      } catch (err) {
        console.error('Failed to load workspace:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [workspaceSlug]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    navigate('/');
  };

  const handleCopyCode = () => {
    if (!workspace?.inviteCode) return;
    navigator.clipboard.writeText(workspace.inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!user) return null;

  // All three numbers come from live API data — none from stale localStorage
  const memberCount = workspace?.members?.length ?? 0;
  const memberSinceDate = workspace?.createdAt
    ? new Date(workspace.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : '—';

  return (
    <Sidebar user={user} onLogout={handleLogout}>
      <div className="w-full space-y-6 lg:space-y-8">

        {/* Header */}
        <header>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-[11px] font-semibold uppercase tracking-wider mb-3">
            <Sparkles className="w-3 h-3" />
            Workspace
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">
            {loading ? 'Loading…' : workspace?.name || 'Welcome back'}
          </h1>
          <p className="text-slate-500 mt-1.5 text-sm md:text-base">
            Welcome back, <span className="font-medium text-slate-700">{user.name}</span>. Here's your workspace at a glance.
          </p>
        </header>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {/* Members */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-4">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Users className="w-5 h-5 text-primary" />
              </div>
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                Members
              </span>
            </div>
            <p className="text-3xl font-bold text-slate-900">
              {loading ? '—' : memberCount}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {memberCount === 1 ? 'Just you so far' : 'Collaborating together'}
            </p>
          </div>

          {/* Your Workspaces */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                <LayoutDashboard className="w-5 h-5 text-emerald-600" />
              </div>
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                Your Workspaces
              </span>
            </div>
            <p className="text-3xl font-bold text-slate-900">
              {loading ? '—' : workspaceCount}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              You belong to {workspaceCount} workspace{workspaceCount !== 1 ? 's' : ''}
            </p>
          </div>

          {/* Workspace created */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
                <Calendar className="w-5 h-5 text-amber-600" />
              </div>
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                Created
              </span>
            </div>
            <p className="text-3xl font-bold text-slate-900">
              {loading ? '—' : memberSinceDate}
            </p>
            <p className="text-xs text-slate-400 mt-1">When this workspace was made</p>
          </div>
        </div>

        {/* Hero */}
        <div className="bg-gradient-to-br from-primary/5 via-white to-blue-50/50 rounded-2xl border border-primary/10 p-8 md:p-12 text-center">
          <div className="w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-white shadow-sm flex items-center justify-center mx-auto mb-5">
            <Rocket className="w-7 h-7 md:w-8 md:h-8 text-primary" />
          </div>
          <h2 className="text-xl md:text-2xl font-bold text-slate-900 mb-2">
            Your workspace is ready
          </h2>
          <p className="text-slate-500 max-w-lg mx-auto mb-8 text-sm md:text-base leading-relaxed">
            Use the sidebar to explore the workspace. Tasks, projects, calendar, and reports are all being built — they'll be ready soon.
          </p>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
            <button
              onClick={() => navigate('/settings/profile')}
              className="inline-flex items-center justify-center gap-2 bg-primary hover:bg-primary-hover text-white px-5 py-2.5 rounded-xl font-medium text-sm transition-colors shadow-sm"
            >
              Complete your profile <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => navigate(`/${workspaceSlug}/team`)}
              className="inline-flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-5 py-2.5 rounded-xl font-medium text-sm transition-colors"
            >
              Invite your team
            </button>
          </div>
        </div>

        {/* Invite Code */}
        {workspace?.inviteCode && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 md:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
              <div className="min-w-0">
                <p className="font-semibold text-slate-900 text-sm mb-1">
                  Invite teammates to this workspace
                </p>
                <p className="text-xs text-slate-500">
                  Share this code — they'll be able to join instantly.
                </p>
              </div>

              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 flex-shrink-0">
                <code className="text-sm font-mono text-slate-700 font-semibold tracking-wider truncate">
                  {workspace.inviteCode}
                </code>
                <button
                  onClick={handleCopyCode}
                  className="flex items-center gap-1 text-xs text-primary font-semibold hover:underline flex-shrink-0"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" /> Copy
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Sidebar>
  );
};

export default DashboardPage;