import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { useEffect, useState, useRef } from 'react';
import {
  LayoutDashboard, CheckSquare, FolderKanban, Users, Calendar,
  BarChart3, HelpCircle, LogOut, ChevronsUpDown,
  Sparkles, Plus, Check, User, Settings, type LucideIcon,
} from 'lucide-react';

import {
  Sidebar as ShadcnSidebar, SidebarContent, SidebarFooter,
  SidebarGroup, SidebarGroupLabel, SidebarHeader, SidebarMenu,
  SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarRail,
  SidebarTrigger, SidebarInset, useSidebar,
} from '@/components/ui/sidebar';

import { UserAvatar } from '@/components/ds';
import { Separator } from '@/components/ui/separator';
import CreateWorkspaceModal from './CreateWorkspaceModal';
import { usePermissions } from '../hooks/usePermissions';
import api from '../utils/api';
import type { StoredUser } from '../utils/session';

interface Workspace {
  _id: string;
  name: string;
  slug: string;
  inviteCode: string;
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
  { title: 'Team Members', key: 'team', icon: Users, permission: 'users:read' },
  { title: 'Calendar', key: 'calendar', icon: Calendar, permission: null },
  { title: 'Reports', key: 'reports', icon: BarChart3, permission: 'reports:read' },
];

const navGeneral = [
  // Workspace settings require settings:manage
  { title: 'Settings', key: 'settings', icon: Settings, permission: 'settings:manage' },
  // Help is always visible
  { title: 'Help & Center', key: 'help', icon: HelpCircle, permission: null },
];

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
  onNavigate: (key: string) => void;
  can: (permission: string) => boolean;
  permissionsLoading: boolean;
}

const NavGroup = ({
  label,
  items,
  isActive,
  onNavigate,
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
                <button
                  onClick={() => {
                    if (isMobile) setOpenMobile(false);
                    onNavigate(key);
                  }}
                  className="w-full"
                >
                  <Icon />
                  <span>{title}</span>
                </button>
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

  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);

  const workspaceRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

  // Target slug for navigation
  const targetSlug =
    workspaceSlug ||
    user?.activeWorkspaceSlug ||
    activeWorkspace?.slug ||
    '';

  const isActive = (key: string) => location.pathname === `/${targetSlug}/${key}`;

  // Page context for the top bar (visible on mobile, where the sidebar is hidden)
  const section =
    location.pathname.split('/')[1] === 'settings'
      ? 'settings'
      : location.pathname.split('/')[2];
  const pageTitle =
    [...navMain, ...navGeneral].find((item) => item.key === section)?.title ?? '';

  // Click-outside detection
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (workspaceRef.current && !workspaceRef.current.contains(e.target as Node)) {
        setWorkspaceOpen(false);
      }
      if (userRef.current && !userRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
    setWorkspaceOpen(false);
    navigate(`/${ws.slug}/dashboard`);
  };

  const handleNav = (key: string) => {
    if (!targetSlug) {
      navigate('/onboarding');
      return;
    }
    navigate(`/${targetSlug}/${key}`);
  };

  const handleGoToProfile = () => {
    setUserMenuOpen(false);
    navigate('/settings/profile');
  };

  const handleLogoutClick = () => {
    setUserMenuOpen(false);
    onLogout();
  };

  const handleOpenCreateWorkspace = () => {
    setWorkspaceOpen(false);
    setCreateWorkspaceOpen(true);
  };

  return (
    <SidebarProvider>
      <ShadcnSidebar collapsible="icon" className="border-r border-gray-300">
        {/* ========== Workspace Switcher ========== */}
        <SidebarHeader className="pt-[max(0.5rem,env(safe-area-inset-top))]">
          <SidebarMenu>
            <SidebarMenuItem>
              <div className="relative" ref={workspaceRef}>
                <SidebarMenuButton
                  size="lg"
                  onClick={() => setWorkspaceOpen(!workspaceOpen)}
                  className="cursor-pointer"
                >
                  <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-white">
                    <Sparkles className="size-4" />
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-bold">
                      {loadingWorkspaces ? 'Loading...' : activeWorkspace?.name || 'No workspace'}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {workspaces.length} {workspaces.length === 1 ? 'workspace' : 'workspaces'}
                    </span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4" />
                </SidebarMenuButton>

                {workspaceOpen && (
                  <div className="absolute top-full left-0 mt-1 w-64 bg-white rounded-lg border border-slate-200 shadow-lg py-1 z-50">
                    <div className="px-3 py-2 text-xs font-medium text-slate-500">
                      My Workspaces
                    </div>
                    <div className="h-px bg-slate-100 mx-1" />

                    {workspaces.map((ws) => (
                      <button
                        key={ws._id}
                        onClick={() => handleSwitchWorkspace(ws)}
                        className="w-full flex items-center gap-2 px-3 py-2.5 md:py-2 text-sm text-left hover:bg-slate-50 cursor-pointer"
                      >
                        <div className="w-6 h-6 rounded-md bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                          {ws.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="flex-1 truncate">{ws.name}</span>
                        {activeWorkspace?._id === ws._id && (
                          <Check className="w-4 h-4 text-primary flex-shrink-0" />
                        )}
                      </button>
                    ))}

                    <div className="h-px bg-slate-100 mx-1" />

                    <button
                      onClick={handleOpenCreateWorkspace}
                      className="w-full flex items-center gap-2 px-3 py-2.5 md:py-2 text-sm text-left hover:bg-slate-50 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      Create workspace
                    </button>
                  </div>
                )}
              </div>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        {/* ========== Navigation ========== */}
        <SidebarContent>
          <NavGroup
            label="Main Menu"
            items={navMain}
            isActive={isActive}
            onNavigate={handleNav}
            can={can}
            permissionsLoading={permissionsLoading}
          />
          <NavGroup
            label="General"
            items={navGeneral}
            isActive={isActive}
            onNavigate={handleNav}
            can={can}
            permissionsLoading={permissionsLoading}
          />
        </SidebarContent>

        {/* ========== User Footer ========== */}
        <SidebarFooter className="border-t border-slate-100 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <SidebarMenu>
            <SidebarMenuItem>
              <div className="relative" ref={userRef}>
                <SidebarMenuButton
                  size="lg"
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="cursor-pointer"
                >
                  <UserAvatar name={user?.name || 'User'} className="size-8" />
                  <div className="grid flex-1 text-left text-sm leading-tight overflow-hidden">
                    <span className="truncate font-semibold">{user?.name || 'User'}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {user?.email || 'user@taskman.com'}
                    </span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4 text-slate-400" />
                </SidebarMenuButton>

                {userMenuOpen && (
                  <div className="absolute bottom-full left-0 mb-1 w-64 bg-white rounded-lg border border-slate-200 shadow-lg py-1 z-50">
                    <div className="flex items-center gap-2 px-3 py-2">
                      <UserAvatar name={user?.name || 'User'} className="size-8" />
                      <div className="grid flex-1 text-left text-sm leading-tight min-w-0">
                        <span className="truncate font-semibold">{user?.name}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {user?.email}
                        </span>
                      </div>
                    </div>

                    <div className="h-px bg-slate-100 mx-1" />

                    <button
                      onClick={handleGoToProfile}
                      className="w-full flex items-center gap-2 px-3 py-2.5 md:py-2 text-sm text-left hover:bg-slate-50 cursor-pointer"
                    >
                      <User className="w-4 h-4" />
                      Profile
                    </button>

                    <div className="h-px bg-slate-100 mx-1" />

                    <button
                      onClick={handleLogoutClick}
                      className="w-full flex items-center gap-2 px-3 py-2.5 md:py-2 text-sm text-left text-red-600 hover:bg-red-50 cursor-pointer"
                    >
                      <LogOut className="w-4 h-4" />
                      Log out
                    </button>
                  </div>
                )}
              </div>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>

        <SidebarRail />
      </ShadcnSidebar>

      {/* ========== Main Content ========== */}
      <SidebarInset>
        <header className="sticky top-0 z-20 flex min-h-14 shrink-0 items-center gap-2 border-b border-gray-300 bg-white pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[env(safe-area-inset-top)]">
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
              <span className="hidden truncate text-slate-400 sm:inline">
                · {activeWorkspace.name}
              </span>
            )}
          </div>
        </header>
        <div className="flex min-w-0 flex-1 flex-col gap-4 bg-slate-50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] lg:p-8">
          {children}
        </div>
      </SidebarInset>

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