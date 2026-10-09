import { useContext, type ReactNode } from 'react';
import Sidebar from '@/components/Sidebar';
import { InsideWorkspaceShellContext } from '@/components/shellContext';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import type { StoredUser } from '@/utils/session';

interface AppShellProps {
  /** Page content, or a render function receiving the signed-in user */
  children: ReactNode | ((user: StoredUser) => ReactNode);
  /** Redirect to onboarding until it is complete (default: true) */
  requireOnboarding?: boolean;
}

/**
 * Authenticated application frame: guards the route, then renders the sidebar,
 * top bar and a responsive content column. Every workspace page starts here.
 * Under WorkspaceLayout the frame already exists, so only the guard and content remain.
 */
const AppShell = ({ children, requireOnboarding = true }: AppShellProps) => {
  const { user, logout } = useAuthGuard({ requireOnboarding });
  const insideWorkspaceShell = useContext(InsideWorkspaceShellContext);
  if (!user) return null;

  const content = typeof children === 'function' ? children(user) : children;
  if (insideWorkspaceShell) return <>{content}</>;

  return (
    <Sidebar user={user} onLogout={logout}>
      <div className="mx-auto w-full max-w-7xl space-y-6">{content}</div>
    </Sidebar>
  );
};

export default AppShell;
