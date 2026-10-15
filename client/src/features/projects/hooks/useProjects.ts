import { useCallback, useEffect, useRef, useState, type SetStateAction } from 'react';
import { fetchCached, getCached, projectsKey, setCached, subscribe } from '@/lib/queryCache';
import { getApiErrorMessage } from '@/utils/api';
import { useLiveRefresh } from '@/features/live/hooks/useLiveRefresh';
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
  // Stale-while-revalidate: cached projects show at once (no skeleton) and are refreshed in the background
  const [projects, rawSetProjects] = useState<Project[]>(
    () => (workspaceSlug ? getCached<Project[]>(projectsKey(workspaceSlug)) : undefined) ?? [],
  );
  const [error, setError] = useState('');
  const [loadedSlug, setLoadedSlug] = useState<string | null>(
    () => (workspaceSlug && getCached(projectsKey(workspaceSlug)) ? workspaceSlug : null),
  );
  const loading = Boolean(workspaceSlug) && loadedSlug !== workspaceSlug;

  // Switching workspace: adopt that workspace's cached list during render, so there is no skeleton flash
  const [seenSlug, setSeenSlug] = useState(workspaceSlug);
  if (seenSlug !== workspaceSlug) {
    setSeenSlug(workspaceSlug);
    const cached = workspaceSlug ? getCached<Project[]>(projectsKey(workspaceSlug)) : undefined;
    if (cached && workspaceSlug) {
      rawSetProjects(cached);
      setLoadedSlug(workspaceSlug);
    }
  }

  // Local changes counted so a slower background refresh never overwrites them
  const changesRef = useRef(0);
  // False after a failed load without cached data: an empty fallback must not be cached as real data
  const cacheableRef = useRef(true);
  const setProjects = useCallback((update: SetStateAction<Project[]>) => {
    changesRef.current += 1;
    rawSetProjects(update);
  }, []);

  const projectsRef = useRef(projects);
  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);

  /** Loads the list; `force` skips sharing an in-flight request (needed after a mutation). */
  const load = useCallback(async (force: boolean) => {
    if (!workspaceSlug) return;
    const changesAtStart = changesRef.current;
    try {
      const list = await fetchCached(projectsKey(workspaceSlug), () => projectsApi.list(workspaceSlug), force);
      cacheableRef.current = true;
      if (force) setProjects(list);
      else if (changesRef.current === changesAtStart) rawSetProjects(list);
      setError('');
    } catch (err) {
      if (!getCached(projectsKey(workspaceSlug))) cacheableRef.current = false;
      setError(getApiErrorMessage(err, 'Could not load projects'));
    } finally {
      setLoadedSlug(workspaceSlug);
    }
  }, [workspaceSlug, setProjects]);

  const reload = useCallback(() => load(true), [load]);

  // Teammates changed projects or sprints (live feed): refetch once, debounced; local edits in flight win
  const refreshFromLive = useCallback(() => load(false), [load]);
  useLiveRefresh(workspaceSlug, 'projects', refreshFromLive);

  useEffect(() => {
    // Loading data on mount / slug change is the purpose of this effect
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(false);
  }, [load]);

  // Keep the shared cache in step with what the UI shows (after loads and mutations)
  useEffect(() => {
    if (!workspaceSlug || loadedSlug !== workspaceSlug || !cacheableRef.current) return;
    setCached(projectsKey(workspaceSlug), projects);
  }, [projects, loadedSlug, workspaceSlug]);

  // Another screen using the same workspace wrote newer data: follow it
  useEffect(() => {
    if (!workspaceSlug) return;
    const key = projectsKey(workspaceSlug);
    return subscribe(key, () => {
      const next = getCached<Project[]>(key);
      if (next && next !== projectsRef.current) rawSetProjects(next);
    });
  }, [workspaceSlug]);

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
  }, [run, slug, setProjects]);

  const updateProject = useCallback(async (id: string, patch: ProjectPatch) => {
    const project = await run(() => projectsApi.update(slug, id, patch), 'Could not save the project');
    setProjects(current => current.map(item => (item._id === id ? project : item)));
    return project;
  }, [run, slug, setProjects]);

  const deleteProject = useCallback(async (id: string) => {
    await run(() => projectsApi.remove(slug, id), 'Could not delete the project');
    setProjects(current => current.filter(item => item._id !== id));
  }, [run, slug, setProjects]);

  const createSprint = useCallback(async (projectId: string, input: SprintInput) => {
    const sprint = await run(() => projectsApi.createSprint(slug, projectId, input), 'Could not create the sprint');
    setProjects(current => replaceSprint(current, sprint));
    return sprint;
  }, [run, slug, setProjects]);

  const updateSprint = useCallback(async (projectId: string, sprintId: string, patch: SprintPatch) => {
    const sprint = await run(() => projectsApi.updateSprint(slug, projectId, sprintId, patch), 'Could not save the sprint');
    setProjects(current => replaceSprint(current, sprint));
    return sprint;
  }, [run, slug, setProjects]);

  const startSprint = useCallback(async (projectId: string, sprintId: string) => {
    const sprint = await run(() => projectsApi.startSprint(slug, projectId, sprintId), 'Could not start the sprint');
    setProjects(current => replaceSprint(current, sprint));
    return sprint;
  }, [run, slug, setProjects]);

  const completeSprint = useCallback(async (projectId: string, sprintId: string, moveOpenTo: MoveOpenTo = 'backlog') => {
    const result = await run(
      () => projectsApi.completeSprint(slug, projectId, sprintId, moveOpenTo),
      'Could not complete the sprint',
    );
    setProjects(current => replaceSprint(current, result.sprint));
    return result;
  }, [run, slug, setProjects]);

  const deleteSprint = useCallback(async (projectId: string, sprintId: string) => {
    await run(() => projectsApi.removeSprint(slug, projectId, sprintId), 'Could not delete the sprint');
    setProjects(current => current.map(project => (project._id !== projectId
      ? project
      : { ...project, sprints: project.sprints.filter(sprint => sprint._id !== sprintId) })));
  }, [run, slug, setProjects]);

  return {
    projects, loading, error, clearError: () => setError(''), reload,
    createProject, updateProject, deleteProject,
    createSprint, updateSprint, startSprint, completeSprint, deleteSprint,
  };
};
