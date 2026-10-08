import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../utils/api';
import { usePermissions } from '../hooks/usePermissions';
import {
  LayoutDashboard,
  Rocket,
  Users,
  Calendar,
  ArrowRight,
  Sparkles,
  Copy,
  Check,
  Shield,
} from 'lucide-react';

interface Workspace {
  _id: string;
  name: string;
  slug: string;
  inviteCode: string;
  createdAt?: string;
  members?: { user: string; roleId: string; joinedAt: string }[];
}

const DashboardPage = () => {
  const navigate = useNavigate();
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();

  // User + role come from the permission context
  const { user, role, can, loading: permissionLoading } = usePermissions();

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [workspaceCount, setWorkspaceCount] = useState(0);
  const [loading, setLoading] = useState(!!workspaceSlug);
  const [copied, setCopied] = useState(false);

  // Auth guard — send to login if no token
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login');
      return;
    }
    if (permissionLoading) return;
    // If we finished loading and there's still no user, bail out
    // (PermissionProvider's fallback handles the error UI)
    if (!user) return;
  }, [navigate, permissionLoading, user]);

  // Fetch live workspace data
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

  const handleCopyCode = () => {
    if (!workspace?.inviteCode) return;
    navigator.clipboard.writeText(workspace.inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!user) return null;

  const memberCount = workspace?.members?.length ?? 0;
  const createdDate = workspace?.createdAt
    ? new Date(workspace.createdAt).toLocaleDateString('en-US', {
        month: 'short',
        year: 'numeric',
      })
    : '—';

  const canManageUsers = can('users:write');

  return (
    <div className="w-full space-y-6 lg:space-y-8">

      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
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
        </div>

        {role && (
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-slate-200 shadow-sm flex-shrink-0">
            <Shield className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-semibold text-slate-700">{role.name}</span>
          </div>
        )}
      </header>

      {/* Quick stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
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
            {loading ? '—' : createdDate}
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

          {canManageUsers && (
            <button
              onClick={() => navigate(`/${workspaceSlug}/team`)}
              className="inline-flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-5 py-2.5 rounded-xl font-medium text-sm transition-colors"
            >
              Invite your team
            </button>
          )}
        </div>
      </div>

      {/* Invite Code — permission gated */}
      {workspace?.inviteCode && canManageUsers && (
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
  );
};

export default DashboardPage;