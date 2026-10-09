import { useCallback } from 'react';
import { Link, Navigate, Outlet, useNavigate, useParams } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import Sidebar from './Sidebar';
import { InsideWorkspaceShellContext } from './shellContext';
import { EmptyState, SkeletonCards } from '@/components/ds';
import { buttonVariants } from '@/components/ui/button';
import { ProjectsProvider } from '@/features/projects';
import { usePermissions } from '../hooks/usePermissions';
import api from '../utils/api';
import { clearSession, getToken } from '../utils/session';

/**
 * Persistent layout for all workspace-scoped routes.
 *
 * Renders the Sidebar ONCE. When the user navigates between
 * /{slug}/dashboard, /{slug}/team, etc., only the <Outlet />
 * content swaps — the Sidebar (and its workspace list) stays mounted.
 * Pages below it share one content column; AppShell detects the context and
 * skips its own frame.
 */
const WorkspaceLayout = () => {
  const navigate = useNavigate();
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  const { user, error } = usePermissions();

  const handleLogout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => undefined);
    clearSession();
    navigate('/');
  }, [navigate]);

  // Signed-out visitors go to the sign-in page instead of waiting forever
  if (!getToken()) return <Navigate to="/login" replace />;

  // Wait until we know who the user is before rendering the shell
  if (!user) {
    if (error) {
      return (
        <div className="flex min-h-dvh items-center justify-center bg-slate-50 p-4">
          <main className="w-full max-w-md rounded-2xl border border-slate-100 bg-white shadow-sm">
            <EmptyState
              icon={<ShieldAlert />}
              title="We couldn't open this workspace"
              description={`${error}. It may not exist, or you may not be a member.`}
              action={
                <Link to="/" className={buttonVariants({ className: 'h-10 bg-primary px-4 text-white hover:bg-primary-hover' })}>
                  Back to home
                </Link>
              }
            />
          </main>
        </div>
      );
    }
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-4xl">
          <SkeletonCards count={3} columns="sm:grid-cols-3" />
        </div>
      </div>
    );
  }

  return (
    // The project directory wraps the sidebar too, so its Projects list and the pages share one fetch
    <ProjectsProvider slug={workspaceSlug}>
      <Sidebar user={user} onLogout={handleLogout}>
        <InsideWorkspaceShellContext.Provider value>
          <div className="mx-auto w-full max-w-7xl space-y-6">
            <Outlet />
          </div>
        </InsideWorkspaceShellContext.Provider>
      </Sidebar>
    </ProjectsProvider>
  );
};

export default WorkspaceLayout;
