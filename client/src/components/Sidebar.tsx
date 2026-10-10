import { Link, useNavigate, useLocation, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard, CheckSquare, FolderKanban, Users, Calendar,
  BarChart3, HelpCircle, LogOut, ChevronsUpDown, DoorOpen,
  Sparkles, Plus, Check, User, Settings, Search, Milestone, Gauge, Timer, BookOpen, type LucideIcon,
} from 'lucide-react';

import {
  Sidebar as ShadcnSidebar, SidebarContent, SidebarFooter,
  SidebarGroup, SidebarGroupLabel, SidebarHeader, SidebarMenu,
  SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarRail,
  SidebarTrigger, SidebarInset, useSidebar,
} from '@/components/ui/sidebar';

import { UserAvatar, toast } from '@/components/ds';
import ConfirmActionDialog from './ConfirmActionDialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';
import SidebarProjects from '@/features/projects/components/SidebarProjects';
import CreateWorkspaceModal from './CreateWorkspaceModal';
import CommandPalette from './CommandPalette';
import MobileTabBar from './MobileTabBar';
import { NotificationBell } from '@/features/notifications';
import TimerPill from '@/features/time/components/TimerPill';
import LiveIndicator from '@/features/live/components/LiveIndicator';
import ThemeToggle from '@/components/ThemeToggle';
import { loadThemeFromAccount } from '@/lib/themeApi';
import { usePermissions } from '../hooks/usePermissions';
import api, { getApiErrorMessage } from '../utils/api';
import type { StoredUser } from '../utils/session';

interface Workspace {
  _id: string;
  name: string;
  slug: string;
  /** Owner user id (the owner cannot leave). */
  owner?: string;
}

interface SidebarProps {
  user: StoredUser | null;
  onLogout: () => void;
  children: React.ReactNode;
}

// ============================================================
// Nav config — each item can declare a required permission.
// `permission: null` means "always visible to any workspace member".
// ============================================================
const navMain = [
  { title: 'Dashboard', key: 'dashboard', icon: LayoutDashboard, permission: null },
  { title: 'Tasks', key: 'tasks', icon: CheckSquare, permission: 'tasks:read' },
  { title: 'Projects', key: 'projects', icon: FolderKanban, permission: 'projects:read' },
  { title: 'Roadmap', key: 'roadmap', icon: Milestone, permission: 'projects:read' },
  { title: 'Workload', key: 'workload', icon: Gauge, permission: 'projects:read' },
  { title: 'Timesheet', key: 'timesheet', icon: Timer, permission: 'tasks:read' },
  { title: 'Wiki', key: 'wiki', icon: BookOpen, permission: 'tasks:read' },
  { title: 'Team', key: 'team', icon: Users, permission: 'users:read' },
  { title: 'Calendar', key: 'calendar', icon: Calendar, permission: 'tasks:read' },
  { title: 'Reports', key: 'reports', icon: BarChart3, permission: 'reports:read' },
];

const navGeneral = [
  // Workspace settings require settings:manage
  { title: 'Settings', key: 'settings', icon: Settings, permission: 'settings:manage' },
  // Help is always visible
  { title: 'Help center', key: 'help', icon: HelpCircle, permission: null },
];

/** "⌘K" on Apple devices, "Ctrl K" elsewhere. */
const shortcutLabel = () =>
  typeof navigator !== 'undefined' && /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent || '')
    ? '⌘K'
    : 'Ctrl K';

/** 40px rows on touch, compact from `md`. */
const MENU_ITEM = 'min-h-10 md:min-h-0';

// ============================================================
// NavGroup — renders a group of nav items with permission filtering
// and auto-closes the mobile sheet after navigation.
// ============================================================
interface NavItem {
  title: string;
  key: string;
  icon: LucideIcon;
  permission: string | null;
}

interface NavGroupProps {
  label: string;
  items: NavItem[];
  isActive: (key: string) => boolean;
  /** Route for a nav key (onboarding when no workspace is known yet) */
  hrefFor: (key: string) => string;
  can: (permission: string) => boolean;
  permissionsLoading: boolean;
}

const NavGroup = ({
  label,
  items,
  isActive,
  hrefFor,
  can,
  permissionsLoading,
}: NavGroupProps) => {
  const { isMobile, setOpenMobile } = useSidebar();

  // Filter by permission; hide permission-gated items while loading
  const visibleItems = items.filter((item) => {
    if (!item.permission) return true;
    if (permissionsLoading) return false;
    return can(item.permission);
  });

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarMenu>
        {visibleItems.map(({ title, key, icon: Icon }) => (
          <SidebarMenuItem key={key}>
            <SidebarMenuButton
              isActive={isActive(key)}
              tooltip={title}
              className="max-md:h-10"
              render={
                <Link
                  to={hrefFor(key)}
                  aria-current={isActive(key) ? 'page' : undefined}
                  onClick={() => {
                    if (isMobile) setOpenMobile(false);
                  }}
                  className="w-full"
                >
                  <Icon />
                  <span>{title}</span>
                </Link>
              }
            />
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
};

const Sidebar = ({ user, onLogout, children }: SidebarProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();

  // ===== RBAC =====
  const { can, loading: permissionsLoading } = usePermissions();

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null);
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(true);

  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);

  // The account's saved theme (light/dark/system) follows the person across browsers
  useEffect(() => {
    void loadThemeFromAccount();
  }, []);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  // Target slug for navigation
  const targetSlug =
    workspaceSlug ||
    user?.activeWorkspaceSlug ||
    activeWorkspace?.slug ||
    '';

  // The wiki has one address per page (/wiki/<id>), so it stays lit below its root
  const isActive = (key: string) =>
    location.pathname === `/${targetSlug}/${key}` || (key === 'wiki' && location.pathname.startsWith(`/${targetSlug}/wiki/`));

  // Page context for the top bar (visible on mobile, where the sidebar is hidden)
  const section =
    location.pathname.split('/')[1] === 'settings'
      ? 'settings'
      : location.pathname.split('/')[2];
  const pageTitle =
    [...navMain, ...navGeneral].find((item) => item.key === section)?.title ?? '';

  // Ctrl/Cmd+K opens the search from anywhere in the app
  useEffect(() => {
    if (!targetSlug) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [targetSlug]);

  // Fetch workspaces
  const fetchWorkspaces = async () => {
    try {
      const response = await api.get('/workspaces');
      const list: Workspace[] = response.data || [];
      setWorkspaces(list);

      const fromUrl = workspaceSlug ? list.find((w) => w.slug === workspaceSlug) : null;
      const active = fromUrl || list.find((w) => w._id === user?.activeWorkspace) || list[0];
      setActiveWorkspace(active || null);
    } catch (err) {
      console.error('Failed to fetch workspaces:', err);
    } finally {
      setLoadingWorkspaces(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    (async () => {
      await fetchWorkspaces();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, workspaceSlug]);

  // Sync active workspace in DB when URL slug changes
  useEffect(() => {
    if (!workspaceSlug) return;
    api.put(`/workspaces/${workspaceSlug}/activate`).catch((err) => {
      console.error('Failed to sync active workspace:', err);
    });
  }, [workspaceSlug]);

  const handleSwitchWorkspace = (ws: Workspace) => {
    navigate(`/${ws.slug}/dashboard`);
  };

  const hrefFor = (key: string) => (targetSlug ? `/${targetSlug}/${key}` : '/onboarding');

  return (
    <SidebarProvider>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary focus:shadow-lg focus:outline-2 focus:outline-primary"
      >
        Skip to content
      </a>
      {/* A landmark, so the workspace switcher, menus and account controls are reachable by region */}
      <ShadcnSidebar collapsible="icon" role="navigation" aria-label="Workspace" className="border-r border-slate-300">
        {/* ========== Workspace Switcher ========== */}
        <SidebarHeader className="pt-[max(0.5rem,env(safe-area-inset-top))]">
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={<SidebarMenuButton size="lg" className="cursor-pointer" aria-label="Switch workspace" />}
                >
                  <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-white">
                    <Sparkles className="size-4" aria-hidden />
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-bold">
                      {loadingWorkspaces ? 'Loading...' : activeWorkspace?.name || 'No workspace'}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {workspaces.length} {workspaces.length === 1 ? 'workspace' : 'workspaces'}
                    </span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4" aria-hidden />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-64">
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>My workspaces</DropdownMenuLabel>
                    {workspaces.map((ws) => (
                      <DropdownMenuItem
                        key={ws._id}
                        onClick={() => handleSwitchWorkspace(ws)}
                        className={MENU_ITEM}
                      >
                        <span aria-hidden className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-[10px] font-bold text-primary">
                          {ws.name.charAt(0).toUpperCase()}
                        </span>
                        <span className="flex-1 truncate">{ws.name}</span>
                        {activeWorkspace?._id === ws._id && (
                          <>
                            <Check className="size-4 shrink-0 text-primary" aria-hidden />
                            <span className="sr-only">(current)</span>
                          </>
                        )}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setCreateWorkspaceOpen(true)} className={MENU_ITEM}>
                    <Plus aria-hidden /> Create workspace
                  </DropdownMenuItem>
                  {activeWorkspace && activeWorkspace.owner !== user?._id && (
                    <DropdownMenuItem variant="destructive" onClick={() => setLeaveOpen(true)} className={MENU_ITEM}>
                      <DoorOpen aria-hidden /> Leave {activeWorkspace.name}
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        {/* ========== Navigation ========== */}
        <SidebarContent>
          <NavGroup
            label="Main Menu"
            items={navMain}
            isActive={isActive}
            hrefFor={hrefFor}
            can={can}
            permissionsLoading={permissionsLoading}
          />
          <SidebarProjects slug={targetSlug} canRead={!permissionsLoading && can('projects:read')} />
          <NavGroup
            label="General"
            items={navGeneral}
            isActive={isActive}
            hrefFor={hrefFor}
            can={can}
            permissionsLoading={permissionsLoading}
          />
        </SidebarContent>

        {/* ========== User Footer ========== */}
        <SidebarFooter className="border-t border-slate-100 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={<SidebarMenuButton size="lg" className="cursor-pointer" aria-label="Account menu" />}
                >
                  <UserAvatar name={user?.name || 'User'} className="size-8" />
                  <div className="grid flex-1 overflow-hidden text-left text-sm leading-tight">
                    <span className="truncate font-semibold">{user?.name || 'User'}</span>
                    <span className="truncate text-xs text-muted-foreground">{user?.email || ''}</span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4 text-slate-500" aria-hidden />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" side="top" className="w-64">
                  <div className="flex items-center gap-2 px-1.5 py-2">
                    <UserAvatar name={user?.name || 'User'} className="size-8" />
                    <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-semibold">{user?.name}</span>
                      <span className="truncate text-xs text-muted-foreground">{user?.email}</span>
                    </div>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate('/settings/profile')} className={MENU_ITEM}>
                    <User aria-hidden /> Profile
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={onLogout} className={MENU_ITEM}>
                    <LogOut aria-hidden /> Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>

        <SidebarRail />
      </ShadcnSidebar>

      {/* ========== Main Content ========== */}
      <SidebarInset>
        <header className="sticky top-0 z-20 flex min-h-14 shrink-0 items-center gap-2 border-b border-slate-300 bg-white pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[env(safe-area-inset-top)]">
          <SidebarTrigger className="-ml-2 size-10 md:-ml-1 md:size-8" />
          <Separator orientation="vertical" className="mr-2 !h-4" />
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <span className="font-bold text-slate-900 md:hidden">TaskMan</span>
            {pageTitle && (
              <>
                <span aria-hidden className="text-slate-300 md:hidden">
                  /
                </span>
                <span className="truncate font-medium text-slate-600">{pageTitle}</span>
              </>
            )}
            {activeWorkspace && (
              <span className="hidden truncate text-slate-500 sm:inline">
                · {activeWorkspace.name}
              </span>
            )}
          </div>
          {targetSlug && (
            <div className="ml-auto flex items-center">
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                aria-label="Search"
                aria-haspopup="dialog"
                className="inline-flex size-10 items-center justify-center rounded-lg text-slate-600 outline-none hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-primary md:hidden"
              >
                <Search className="size-5" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                aria-haspopup="dialog"
                className="hidden h-9 w-64 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-500 outline-none transition-colors hover:border-slate-300 hover:bg-white focus-visible:outline-2 focus-visible:outline-primary md:flex lg:w-80"
              >
                <Search className="size-4 shrink-0" aria-hidden />
                <span className="flex-1 truncate text-left">Search tasks, pages…</span>
                <kbd className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-sans text-[11px] font-medium text-slate-500">
                  {shortcutLabel()}
                </kbd>
              </button>
              <LiveIndicator />
              <TimerPill slug={targetSlug} />
              <ThemeToggle />
              <NotificationBell slug={targetSlug} />
            </div>
          )}
        </header>
        <div id="main-content" tabIndex={-1} className="flex min-w-0 flex-1 flex-col gap-4 bg-slate-50 outline-none p-4 pb-[max(1rem,env(safe-area-inset-bottom))] max-md:pb-[calc(5rem+env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] lg:p-8">
          {children}
        </div>
      </SidebarInset>

      {/* ========== Mobile bottom navigation + global search ========== */}
      <MobileTabBar slug={targetSlug} />
      {targetSlug && (
        <CommandPalette
          open={searchOpen}
          onOpenChange={setSearchOpen}
          slug={targetSlug}
          can={can}
          permissionsLoading={permissionsLoading}
        />
      )}

      {activeWorkspace && (
        <ConfirmActionDialog
          open={leaveOpen}
          onOpenChange={setLeaveOpen}
          title={`Leave ${activeWorkspace.name}?`}
          description="You lose access to its tasks and projects and are unassigned from your tasks there. An admin can invite you again."
          confirmLabel="Leave workspace"
          busyLabel="Leaving..."
          busy={leaving}
          onConfirm={async () => {
            setLeaving(true);
            try {
              await api.delete(`/workspaces/${encodeURIComponent(activeWorkspace.slug)}/members/me`);
              setLeaveOpen(false);
              toast.success(`You left ${activeWorkspace.name}`);
              const next = workspaces.find(ws => ws._id !== activeWorkspace._id);
              navigate(next ? `/${next.slug}/dashboard` : '/onboarding');
            } catch (err) {
              toast.error(getApiErrorMessage(err, 'Could not leave the workspace.'));
            } finally {
              setLeaving(false);
            }
          }}
        />
      )}

      {/* ========== Create Workspace Modal ========== */}
      <CreateWorkspaceModal
        open={createWorkspaceOpen}
        onOpenChange={setCreateWorkspaceOpen}
        onCreated={async () => {
          try {
            const response = await api.get('/workspaces');
            setWorkspaces(response.data || []);
          } catch (err) {
            console.error('Failed to refresh workspaces:', err);
          }
        }}
      />
    </SidebarProvider>
  );
};

export default Sidebar;