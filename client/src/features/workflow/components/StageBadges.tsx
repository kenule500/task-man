import { cn } from '@/lib/utils';
import { STAGE_COLOR_META, resolveStage } from '../lib/stages';
import type { WorkflowStage } from '../types';
import type { Task } from '@/features/tasks/types';
import { useWorkflow } from '../hooks/useWorkflow';

export const StageDot = ({ stage, className }: { stage: Pick<WorkflowStage, 'color'>; className?: string }) => (
  <span aria-hidden className={cn('inline-block size-2 shrink-0 rounded-full', STAGE_COLOR_META[stage.color].dot, className)} />
);

/** Stage name with its colored dot, on the neutral pill of the other badges (color is never the only signal). */
export const StageBadge = ({ stage, className }: { stage: WorkflowStage; className?: string }) => (
  <span
    className={cn(
      'inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700',
      className,
    )}
  >
    <StageDot stage={stage} />
    {stage.name}
  </span>
);

/** The stage of a task as a badge, resolved with the workspace workflow of the current route. */
export const TaskStageBadge = ({ task, className }: { task: Pick<Task, 'status'> & { stage?: string }; className?: string }) => {
  const { stages } = useWorkflow();
  return <StageBadge stage={resolveStage(task, stages)} className={className} />;
};
