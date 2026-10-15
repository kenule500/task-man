import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { usePermissions } from '@/hooks/usePermissions';
import { useProjects } from '../hooks/useProjects';
import type { Project } from '../types';
import { ProjectsContext, type ProjectDirectory } from './ProjectsContext';

const normalizeName = (name: string) => name.trim().toLowerCase();

/**
 * Loads the workspace's projects once (when the user may read them) and shares them, so any
 * component can show a project's folder icon from the name on a task. Mount inside the router and
 * the permission provider.
 */
const ProjectsProvider = ({ slug, children }: { slug: string | undefined; children: ReactNode }) => {
  const { can } = usePermissions();
  const canRead = can('projects:read');
  const { projects: loaded, loading, reload } = useProjects(canRead ? slug : undefined);
  const projects = useMemo<Project[]>(() => (canRead ? loaded : []), [canRead, loaded]);

  // Projects created or archived on the projects pages show up once the user moves on
  const { pathname } = useLocation();
  const previous = useRef(pathname);
  useEffect(() => {
    const root = `/${slug}/projects`;
    const inProjects = (path: string) => path === root || path.startsWith(`${root}/`);
    const wasInProjects = inProjects(previous.current);
    previous.current = pathname;
    if (canRead && wasInProjects && !inProjects(pathname)) void reload();
  }, [pathname, slug, canRead, reload]);

  const value = useMemo<ProjectDirectory>(() => {
    const index = new Map(projects.map(project => [normalizeName(project.name), project]));
    return {
      slug: slug ?? '',
      projects,
      loading: canRead && loading,
      byName: name => (name ? index.get(normalizeName(name)) : undefined),
      reload,
    };
  }, [projects, slug, canRead, loading, reload]);

  return <ProjectsContext.Provider value={value}>{children}</ProjectsContext.Provider>;
};

export default ProjectsProvider;
