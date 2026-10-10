import { Copy } from 'lucide-react';
import { toast } from '@/components/ds';
import { cn } from '@/lib/utils';
import { useTaskKey } from '../hooks/useTaskKey';
import { copyToClipboard } from '../lib/taskKey';
import type { Task } from '../types';
import { TaskHoverCard } from './TaskHoverCards';

interface TaskKeyProps {
  task: Pick<Task, 'number' | 'project'>;
  /** Adds a "Copy key" button next to the key. */
  copyable?: boolean;
  /** Shows a preview of this task in a hover card when the key is hovered or focused. */
  preview?: Task;
  className?: string;
}

/** Small monospace task key like "WEB-12". Renders nothing for tasks without a number. */
const TaskKey = ({ task, copyable = false, preview, className }: TaskKeyProps) => {
  const key = useTaskKey(task);
  if (!key) return null;

  const copy = async () => {
    if (await copyToClipboard(key)) toast.success(`Copied ${key}`);
    else toast.error('Could not copy. Select the key and copy it manually.');
  };

  return (
    <span className={cn('inline-flex shrink-0 items-center gap-0.5', className)}>
      {preview ? (
        <TaskHoverCard
          task={preview}
          render={<span tabIndex={0} className="rounded outline-none focus-visible:outline-2 focus-visible:outline-primary" />}
        >
          <span data-testid="task-key" className="font-mono text-xs text-slate-500 tabular-nums">{key}</span>
        </TaskHoverCard>
      ) : (
        <span data-testid="task-key" className="font-mono text-xs text-slate-500 tabular-nums">{key}</span>
      )}
      {copyable && (
        <button
          type="button"
          aria-label="Copy key"
          title="Copy key"
          onClick={() => { void copy(); }}
          className="inline-flex size-8 items-center justify-center rounded text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-primary sm:size-6"
        >
          <Copy className="size-3.5" aria-hidden />
        </button>
      )}
    </span>
  );
};

export default TaskKey;
