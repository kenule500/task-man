import { Link, useLocation } from 'react-router-dom';
import { CheckSquare, FolderKanban, LayoutDashboard, Menu, Plus, type LucideIcon } from 'lucide-react';
import { cn } from 'cn';
import { useSidebar } from '@/components/ui/sidebar';
import { usePermissions } from '@/hooks/usePermissions';

interface MobileTabBarProps {
  /** Workspace the links point to. Nothing is rendered without one. */
  slug: string;
}

const TAB =
  'relative flex min-h-12 min-w-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg text-[11px] font-medium outline-none transition-colors focus-visible:outline-2 focus-visible:outline-primary';

interface TabLinkProps {
  to: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
}

const TabLink = ({ to, label, icon: Icon, active }: TabLinkProps) => (
  <Link
    to={to}
    aria-current={active ? 'page' : undefined}
    className={cn(TAB, active ? 'text-primary' : 'text-slate-500 hover:text-slate-900')}
  >
    {active && <span aria-hidden className="absolute top-0 h-0.5 w-8 rounded-full bg-primary" />}
    <Icon className="size-5" strokeWidth={active ? 2.5 : 2} aria-hidden />
    <span>{label}</span>
  </Link>
);

/**
 * Bottom navigation for phones (hidden from `md`, where the sidebar is docked).
 * Slots the user may not use stay empty so the other items keep their positions.
 */
const MobileTabBar = ({ slug }: MobileTabBarProps) => {
  const { pathname } = useLocation();
  const { can, loading } = usePermissions();
  const { setOpenMobile } = useSidebar();

  if (!slug) return null;

  const allowed = (permission: string) => !loading && can(permission);
  // Sub-pages (e.g. a project's page) keep their section's tab highlighted
  const isActive = (key: string) => pathname === `/${slug}/${key}` || pathname.startsWith(`/${slug}/${key}/`);
  const base = `/${slug}`;

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] backdrop-blur md:hidden"
    >
      <ul className="mx-auto flex max-w-md items-center px-2">
        <li className="flex flex-1">
          <TabLink to={`${base}/dashboard`} label="Home" icon={LayoutDashboard} active={isActive('dashboard')} />
        </li>
        <li className="flex flex-1">
          {allowed('tasks:read') && (
            <TabLink to={`${base}/tasks`} label="Tasks" icon={CheckSquare} active={isActive('tasks')} />
          )}
        </li>
        <li className="flex flex-1 justify-center">
          {allowed('tasks:write') && (
            <Link
              to={`${base}/tasks?new=1`}
              aria-label="New task"
              className="-mt-6 flex size-14 items-center justify-center rounded-full bg-primary text-white shadow-lg ring-4 ring-white outline-none transition-transform hover:bg-primary-hover active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <Plus className="size-6" strokeWidth={2.5} aria-hidden />
            </Link>
          )}
        </li>
        <li className="flex flex-1">
          {allowed('projects:read') && (
            <TabLink to={`${base}/projects`} label="Projects" icon={FolderKanban} active={isActive('projects')} />
          )}
        </li>
        <li className="flex flex-1">
          <button type="button" aria-haspopup="dialog" onClick={() => setOpenMobile(true)} className={cn(TAB, 'text-slate-500 hover:text-slate-900')}>
            <Menu className="size-5" aria-hidden />
            <span>More</span>
          </button>
        </li>
      </ul>
    </nav>
  );
};

export default MobileTabBar;
