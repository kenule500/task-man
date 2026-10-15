// Public surface of the workflow module (stages: board columns mapped to the three status groups)
export * from './types';
export { workflowApi } from './api';
export { useWorkflow, resetWorkflowCache, type UseWorkflow } from './hooks/useWorkflow';
export * from './lib/stages';
export { StageBadge, StageDot, TaskStageBadge } from './components/StageBadges';
export { StageRow } from './components/StageRow';
export { BoardPreview } from './components/BoardPreview';
export { DeleteStageDialog } from './components/DeleteStageDialog';
