import { useCallback, useEffect, useState } from 'react';
import { getApiErrorMessage } from '@/utils/api';
import { projectsApi } from '../api';
import type { MoveOpenTo, Project, ProjectInput, ProjectPatch, Sprint, SprintInput, SprintPatch } from '../types';

const replaceSprint = (projects: Project[], sprint: Sprint): Project[] =>
  projects.map(project => (project._id !== sprint.project
    ? project
    : {
        ...project,
        sprints: project.sprints.some(item => item._id === sprint._id)
          ? project.sprints.map(item => (item._id === sprint._id ? sprint : item))
          : [...project.sprints, sprint].sort((a, b) => a.startDate.localeCompare(b.startDate)),
      }));

/**
 * Loads a workspace's projects (each with its sprints) and exposes mutations.
 * Mutations resolve with the saved value and reject with a readable message; `error` keeps the last load error.
 * Sprint start/complete/delete change tasks on the server: callers reload tasks afterwards.
 */
export const useProjects = (workspaceSlug: string | undefined) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState('');
  const [loadedSlug, setLoadedSlug] = useState<string | null>(null);
  const loading = Boolean(workspaceSlug) && loadedSlug !== workspaceSlug;

  const reload = useCallback(async () => {
    if (!workspaceSlug) return;
    try {
      setProjects(await projectsApi.list(workspaceSlug));
      setError('');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not load projects'));
    } finally {
      setLoadedSlug(workspaceSlug);
    }
  }, [workspaceSlug]);

  useEffect(() => {
    // Loading data on mount / slug change is the purpose of this effect
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);

  /** Runs a request and turns API errors into readable messages. */
  const run = useCallback(async <T,>(request: () => Promise<T>, fallback: string): Promise<T> => {
    if (!workspaceSlug) throw new Error('No workspace selected');
    try {
      return await request();
    } catch (err) {
      throw new Error(getApiErrorMessage(err, fallback), { cause: err });
    }
  }, [workspaceSlug]);

  const slug = workspaceSlug ?? '';

  const createProject = useCallback(async (input: ProjectInput) => {
    const project = await run(() => projectsApi.create(slug, input), 'Could not create the project');
    setProjects(current => [...current, project].sort((a, b) => a.name.localeCompare(b.name)));
    return project;
  }, [run, slug]);

  const updateProject = useCallback(async (id: string, patch: ProjectPatch) => {
    const project = await run(() => projectsApi.update(slug, id, patch), 'Could not save the project');
    setProjects(current => current.map(item => (item._id === id ? project : item)));
    return project;
  }, [run, slug]);

  const deleteProject = useCallback(async (id: string) => {
    await run(() => projectsApi.remove(slug, id), 'Could not delete the project');
    setProjects(current => current.filter(item => item._id !== id));
  }, [run, slug]);

  const createSprint = useCallback(async (projectId: string, input: SprintInput) => {
    const sprint = await run(() => projectsApi.createSprint(slug, projectId, input), 'Could not create the sprint');
    setProjects(current => replaceSprint(current, sprint));
    return sprint;
  }, [run, slug]);

  const updateSprint = useCallback(async (projectId: string, sprintId: string, patch: SprintPatch) => {
    const sprint = await run(() => projectsApi.updateSprint(slug, projectId, sprintId, patch), 'Could not save the sprint');
    setProjects(current => replaceSprint(current, sprint));
    return sprint;
  }, [run, slug]);

  const startSprint = useCallback(async (projectId: string, sprintId: string) => {
    const sprint = await run(() => projectsApi.startSprint(slug, projectId, sprintId), 'Could not start the sprint');
    setProjects(current => replaceSprint(current, sprint));
    return sprint;
  }, [run, slug]);

  const completeSprint = useCallback(async (projectId: string, sprintId: string, moveOpenTo: MoveOpenTo = 'backlog') => {
    const result = await run(
      () => projectsApi.completeSprint(slug, projectId, sprintId, moveOpenTo),
      'Could not complete the sprint',
    );
    setProjects(current => replaceSprint(current, result.sprint));
    return result;
  }, [run, slug]);

  const deleteSprint = useCallback(async (projectId: string, sprintId: string) => {
    await run(() => projectsApi.removeSprint(slug, projectId, sprintId), 'Could not delete the sprint');
    setProjects(current => current.map(project => (project._id !== projectId
      ? project
      : { ...project, sprints: project.sprints.filter(sprint => sprint._id !== sprintId) })));
  }, [run, slug]);

  return {
    projects, loading, error, clearError: () => setError(''), reload,
    createProject, updateProject, deleteProject,
    createSprint, updateSprint, startSprint, completeSprint, deleteSprint,
  };
};
