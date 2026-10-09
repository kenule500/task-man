// Public surface of the projects module (projects → sprints → tasks → subtasks)
export * from './types';
export { projectsApi } from './api';
export { useProjects } from './hooks/useProjects';

export * from './lib/appearance';
export * from './lib/burndown';
export * from './lib/grouping';
export * from './lib/icons';
export * from './lib/limits';
export * from './lib/projectKey';
export * from './lib/sprintStats';
export * from './lib/summary';
export * from './lib/velocity';

export { default as ProjectFolderCard } from './components/ProjectFolderCard';
export { default as ProjectIcon } from './components/ProjectIcon';
export { default as NewProjectCard } from './components/NewProjectCard';
export { default as ProjectFormDialog } from './components/ProjectFormDialog';
export { default as SprintFormDialog } from './components/SprintFormDialog';
export { default as CompleteSprintDialog } from './components/CompleteSprintDialog';
export { default as SprintCard } from './components/SprintCard';
export { default as ProjectWorkspace, type SprintActions } from './components/ProjectWorkspace';
export { default as BurndownChart } from './components/BurndownChart';
export { default as VelocityChart } from './components/VelocityChart';
