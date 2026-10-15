import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, ChevronRight, Inbox, LayoutGrid, Zap } from 'lucide-react';
import {
  SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuAction, SidebarMenuButton, SidebarMenuItem, SidebarMenuSub,
  SidebarMenuSubButton, SidebarMenuSubItem, useSidebar,
} from '@/components/ui/sidebar';
import { scopeHref } from '@/features/tasks/lib/scope';
import { useProjectDirectory } from '../context/ProjectsContext';
import ProjectFolderIcon from './ProjectFolderIcon';

/** Projects shown in the sidebar before "All projects". */
export const SIDEBAR_PROJECT_LIMIT = 6;

interface SidebarProjectsProps {
  slug: string;
  /** Whether the user may read projects (the group is hidden otherwise). */
  canRead: boolean;
}

/** Where the quick links of a project lead; `match` tells whether the current URL is that page. */
interface ProjectLink {
  key: string;
  label: string;
  icon: typeof LayoutGrid;
  href: string;
}

/** True when `href` (path and query) is the page shown: same path and the same values for the params it names. */
const isCurrent = (href: string, pathname: string, search: string): boolean => {
  const [path, query = ''] = href.split('?');
  if (path !== pathname) return false;
  const wanted = new URLSearchParams(query);
  const current = new URLSearchParams(search);
  return ['project', 'sprint', 'tab'].every(name => (wanted.get(name) ?? null) === (current.get(name) ?? null));
};

/**
 * Collapsible "Projects" group of the sidebar: up to six active projects as folders, then a link to all of them.
 * In the icon-only sidebar the group label disappears and only the folders remain, with tooltips.
 */
const SidebarProjects = ({ slug, canRead }: SidebarProjectsProps) => {
  const { projects } = useProjectDirectory();
  const { pathname, search } = useLocation();
  const { isMobile, state, setOpenMobile } = useSidebar();
  const [expanded, setExpanded] = useState(true);
  // Projects whose quick links the user opened or closed; the project being viewed starts open
  const [opened, setOpened] = useState<Record<string, boolean>>({});

  const active = projects.filter(project => !project.archived);
  if (!canRead || !slug || active.length === 0) return null;

  const visible = active.slice(0, SIDEBAR_PROJECT_LIMIT);
  const root = `/${slug}/projects`;
  const closeSheet = () => {
    if (isMobile) setOpenMobile(false);
  };
  // The icon rail has no room for a toggle, so its folders are always listed
  const showList = expanded || (state === 'collapsed' && !isMobile);

  return (
    <SidebarGroup data-testid="sidebar-projects">
      <SidebarGroupLabel
        render={
          <button
            type="button"
            aria-expanded={showList}
            aria-controls="sidebar-projects-list"
            onClick={() => setExpanded(open => !open)}
            className="w-full cursor-pointer justify-between hover:bg-sidebar-accent hover:text-sidebar-accent-foreground max-md:h-10"
          />
        }
      >
        <span>Projects</span>
        <ChevronRight aria-hidden className={showList ? 'rotate-90 transition-transform' : 'transition-transform'} />
      </SidebarGroupLabel>

      {showList && (
        <SidebarMenu id="sidebar-projects-list">
          {visible.map(project => {
            const href = `${root}/${project._id}`;
            const isActive = pathname === href || pathname.startsWith(`${href}/`);
            const activeSprint = project.sprints.find(sprint => sprint.status === 'active');
            const links: ProjectLink[] = [
              ...(activeSprint ? [{
                key: 'board', label: 'Active sprint board', icon: LayoutGrid,
                href: scopeHref(slug, { view: 'board', project: project.name, sprint: 'active' }),
              }] : []),
              { key: 'backlog', label: 'Backlog', icon: Inbox, href: `${href}?tab=backlog` },
              { key: 'epics', label: 'Epics', icon: Zap, href: `${href}?tab=epics` },
            ];
            const linksOpen = opened[project._id] ?? isActive;
            const linksId = `sidebar-project-links-${project._id}`;
            return (
              <SidebarMenuItem key={project._id}>
                <SidebarMenuButton
                  isActive={isActive}
                  tooltip={project.name}
                  className="max-md:h-10"
                  render={
                    <Link
                      to={href}
                      aria-current={isActive ? 'page' : undefined}
                      onClick={closeSheet}
                      className="w-full"
                    >
                      <ProjectFolderIcon size="sm" color={project.color} icon={project.icon} />
                      <span>{project.name}</span>
                    </Link>
                  }
                />
                <SidebarMenuAction
                  aria-expanded={linksOpen}
                  aria-controls={linksOpen ? linksId : undefined}
                  aria-label={`${linksOpen ? 'Hide' : 'Show'} ${project.name} links`}
                  onClick={() => setOpened(current => ({ ...current, [project._id]: !linksOpen }))}
                  className="size-6 max-md:top-2.5"
                >
                  <ChevronRight aria-hidden className={linksOpen ? 'rotate-90 transition-transform' : 'transition-transform'} />
                </SidebarMenuAction>
                {linksOpen && (
                  <SidebarMenuSub id={linksId} aria-label={`${project.name} shortcuts`}>
                    {links.map(({ key, label, icon: Icon, href: to }) => {
                      const current = isCurrent(to, pathname, search);
                      return (
                        <SidebarMenuSubItem key={key}>
                          <SidebarMenuSubButton
                            isActive={current}
                            className="max-md:h-9"
                            render={
                              <Link to={to} aria-current={current ? 'page' : undefined} onClick={closeSheet}>
                                <Icon aria-hidden />
                                <span>{label}</span>
                              </Link>
                            }
                          />
                        </SidebarMenuSubItem>
                      );
                    })}
                  </SidebarMenuSub>
                )}
              </SidebarMenuItem>
            );
          })}
          <SidebarMenuItem className="group-data-[collapsible=icon]:hidden">
            <SidebarMenuButton
              isActive={pathname === root}
              className="text-sidebar-foreground/70 max-md:h-10"
              render={
                <Link
                  to={root}
                  aria-current={pathname === root ? 'page' : undefined}
                  onClick={closeSheet}
                  className="w-full"
                >
                  <ArrowRight aria-hidden />
                  <span>All projects</span>
                </Link>
              }
            />
          </SidebarMenuItem>
        </SidebarMenu>
      )}
    </SidebarGroup>
  );
};

export default SidebarProjects;
