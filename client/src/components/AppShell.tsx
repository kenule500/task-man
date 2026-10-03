import type { ReactNode } from 'react';
import Sidebar from '@/components/Sidebar';
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
 */
const AppShell = ({ children, requireOnboarding = true }: AppShellProps) => {
  const { user, logout } = useAuthGuard({ requireOnboarding });
  if (!user) return null;

  return (
    <Sidebar user={user} onLogout={logout}>
      <div className="mx-auto w-full max-w-7xl space-y-6">
        {typeof children === 'function' ? children(user) : children}
      </div>
    </Sidebar>
  );
};

export default AppShell;
