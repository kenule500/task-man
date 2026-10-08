import { Outlet, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import { usePermissions } from '../hooks/usePermissions';

/**
 * Persistent layout for all workspace-scoped routes.
 *
 * Renders the Sidebar ONCE. When the user navigates between
 * /{slug}/dashboard, /{slug}/team, etc., only the <Outlet />
 * content swaps — the Sidebar (and its workspace list) stays mounted.
 */
const WorkspaceLayout = () => {
  const navigate = useNavigate();
  const { user } = usePermissions();

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/');
  };

  // Wait until we know who the user is before rendering the shell
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <Sidebar user={user} onLogout={handleLogout}>
      <Outlet />
    </Sidebar>
  );
};

export default WorkspaceLayout;