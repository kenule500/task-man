import { createContext, useContext } from 'react';
import type { Project } from '../types';

export interface ProjectDirectory {
  /** Workspace the projects belong to ('' outside a workspace). */
  slug: string;
  projects: Project[];
  loading: boolean;
  /** Finds a project by the name tasks reference it with (case-insensitive, trimmed). */
  byName: (name: string | undefined | null) => Project | undefined;
  /** Refetches the projects (call after creating, renaming or archiving one). */
  reload: () => Promise<void>;
}

/** What components see without a provider: no projects, so chips fall back to plain text. */
export const EMPTY_DIRECTORY: ProjectDirectory = {
  slug: '',
  projects: [],
  loading: false,
  byName: () => undefined,
  reload: async () => undefined,
};

export const ProjectsContext = createContext<ProjectDirectory>(EMPTY_DIRECTORY);

/** The workspace's projects, loaded once by `ProjectsProvider`. Safe (empty) outside the provider. */
export const useProjectDirectory = (): ProjectDirectory => useContext(ProjectsContext);
