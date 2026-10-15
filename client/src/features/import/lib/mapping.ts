import type { TaskStatus, TaskType } from '@/features/tasks/types';
import { isValidProjectKey, suggestProjectKey, type Project } from '@/features/projects';
import type { CommitMapping, ImportPreview, MappingDraft } from '../types';

export interface StageChoice {
  key: string;
  name: string;
  group: TaskStatus;
}

/** The stage a status group lands in by default: the first stage of that group. */
export const stageForGroup = (stages: readonly StageChoice[], group: TaskStatus): string =>
  (stages.find(stage => stage.group === group) ?? stages[0])?.key ?? group;

/** A first guess for every choice, so a typical import needs no changes. */
export const initialMapping = (
  preview: ImportPreview,
  options: { canCreateProject: boolean; projects: readonly Project[]; suggestedName?: string },
): MappingDraft => {
  const open = options.projects.filter(project => !project.archived);
  const mode: MappingDraft['mode'] = options.canCreateProject || open.length === 0 ? 'new' : 'existing';
  const newName = options.suggestedName ?? '';
  return {
    mode,
    existingProject: open[0]?.name ?? '',
    newName,
    newKey: suggestProjectKey(newName),
    statusMap: Object.fromEntries(preview.statuses.map(status => [status.name, stageForGroup(preview.stages, status.suggested)])),
    userMap: Object.fromEntries(preview.people.map(person => [person.identifier, person.memberId])),
    typeMap: Object.fromEntries(preview.types.map(type => [type.name, type.suggested])) as Record<string, TaskType>,
    createSprints: preview.sprints.length > 0,
    includeComments: preview.comments > 0,
  };
};

export interface MappingProblems {
  project?: string;
  key?: string;
}

/** Problems that block the import; an empty object means the mapping can be sent. */
export const mappingProblems = (
  draft: MappingDraft,
  options: { canCreateProject: boolean; projects: readonly Project[] },
): MappingProblems => {
  const problems: MappingProblems = {};
  if (draft.mode === 'existing') {
    if (!options.projects.some(project => !project.archived && project.name === draft.existingProject)) {
      problems.project = 'Choose the project that receives the tasks.';
    }
    return problems;
  }
  const name = draft.newName.trim();
  if (!options.canCreateProject) problems.project = 'You can import into an existing project only.';
  else if (!name) problems.project = 'Give the new project a name.';
  else if (name.length > 60) problems.project = 'Project names can be at most 60 characters.';
  else if (options.projects.some(project => project.name.toLowerCase() === name.toLowerCase())) {
    problems.project = 'A project with this name already exists. Choose it from the list instead.';
  }
  if (draft.newKey && !isValidProjectKey(draft.newKey)) problems.key = 'Use 2 to 6 letters or numbers.';
  return problems;
};

export const hasMappingProblems = (problems: MappingProblems): boolean => Object.keys(problems).length > 0;

/** The request body for the commit call. */
export const buildCommitMapping = (draft: MappingDraft): CommitMapping => ({
  project: draft.mode === 'existing'
    ? draft.existingProject
    : { name: draft.newName.trim(), ...(draft.newKey ? { key: draft.newKey } : {}) },
  statusMap: draft.statusMap,
  userMap: draft.userMap,
  typeMap: draft.typeMap,
  createSprints: draft.createSprints,
  includeComments: draft.includeComments,
});

/** Name for a new project taken from the file ("backlog-export.csv" becomes "Backlog export"). */
export const projectNameFromFile = (filename: string): string => {
  const base = filename.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  if (!base) return '';
  return (base.charAt(0).toUpperCase() + base.slice(1)).slice(0, 60);
};

/** How many people are mapped to a member, and how many are left unassigned. */
export const peopleSummary = (preview: ImportPreview, draft: MappingDraft): { mapped: number; unassigned: number } => {
  let mapped = 0;
  for (const person of preview.people) if (draft.userMap[person.identifier]) mapped++;
  return { mapped, unassigned: preview.people.length - mapped };
};
