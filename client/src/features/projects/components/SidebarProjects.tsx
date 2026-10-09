import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, ChevronRight } from 'lucide-react';
import {
  SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from '@/components/ui/sidebar';
import { useProjectDirectory } from '../context/ProjectsContext';
import ProjectFolderIcon from './ProjectFolderIcon';

/** Projects shown in the sidebar before "All projects". */
export const SIDEBAR_PROJECT_LIMIT = 6;

interface SidebarProjectsProps {
  slug: string;
  /** Whether the user may read projects (the group is hidden otherwise). */
  canRead: boolean;
}

/**
 * Collapsible "Projects" group of the sidebar: up to six active projects as folders, then a link to all of them.
 * In the icon-only sidebar the group label disappears and only the folders remain, with tooltips.
 */
const SidebarProjects = ({ slug, canRead }: SidebarProjectsProps) => {
  const { projects } = useProjectDirectory();
  const { pathname } = useLocation();
  const { isMobile, state, setOpenMobile } = useSidebar();
  const [expanded, setExpanded] = useState(true);

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
