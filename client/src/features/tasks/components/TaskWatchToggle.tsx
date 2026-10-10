import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { toast } from '@/components/ds';
import { cn } from '@/lib/utils';
import { getApiErrorMessage } from '../api';
import { useTaskExtras } from '../hooks/useTaskExtras';
import type { Task } from '../types';

interface TaskWatchToggleProps {
  task: Pick<Task, '_id' | 'watchers'>;
  /** The signed-in user; without one the toggle is hidden. */
  currentUserId?: string;
  /** Workspace slug; defaults to the slug of the project directory. */
  workspaceSlug?: string;
  className?: string;
}

/** "Watch / Watching" button with the number of watchers. Watching sends the same notifications as being assigned. */
const TaskWatchToggle = ({ task, currentUserId, workspaceSlug, className }: TaskWatchToggleProps) => {
  const extras = useTaskExtras(workspaceSlug);
  // The server's answer, used until the task itself carries the new list
  const [answer, setAnswer] = useState<{ base: string[] | undefined; list: string[] } | null>(null);
  const [busy, setBusy] = useState(false);

  if (!currentUserId || !extras.enabled) return null;

  const watchers = answer && answer.base === task.watchers ? answer.list : task.watchers ?? [];
  const watching = watchers.includes(currentUserId);

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const list = await extras.setWatching(task, !watching);
      setAnswer({ base: task.watchers, list });
    } catch (err) {
      toast.error(getApiErrorMessage(err, watching ? 'Could not stop watching.' : 'Could not watch the task.'));
    } finally {
      setBusy(false);
    }
  };

  const Icon = watching ? EyeOff : Eye;
  return (
    <button
      type="button"
      onClick={() => { void toggle(); }}
      disabled={busy}
      title={watching ? 'Stop watching this task' : 'Get notified about comments and completion'}
      className={cn(
        'inline-flex min-h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-60 sm:min-h-7',
        watching ? 'border-primary/30 bg-blue-50 text-blue-700 hover:bg-blue-100' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {watching ? 'Watching' : 'Watch'}
      <span className="tabular-nums text-slate-500" aria-hidden>{watchers.length}</span>
      <span className="sr-only">{watchers.length === 1 ? '1 watcher' : `${watchers.length} watchers`}</span>
    </button>
  );
};

export default TaskWatchToggle;
