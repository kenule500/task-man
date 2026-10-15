import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useProjectDirectory } from '@/features/projects/context/ProjectsContext';
import { parentCandidates } from '../lib/relations';
import { resolveTaskKey } from '../lib/taskKey';
import type { Task } from '../types';
import { StatusBadge } from './TaskBadges';
import TaskKey from './TaskKey';

interface ConvertToSubtaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: Task;
  /** All workspace tasks; the eligible parents are picked from them. */
  tasks: Task[];
  /** Called with the chosen parent; the dialog closes after it resolves, unless it resolves to `false` (the caller showed the error). */
  onPick: (parent: Task) => Promise<boolean | void> | void;
}

/** Picker for "Convert to subtask": top-level, non-epic tasks of the workspace, searchable by key or title. */
const ConvertToSubtaskDialog = ({ open, onOpenChange, task, tasks, onPick }: ConvertToSubtaskDialogProps) => {
  const { byName } = useProjectDirectory();
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);

  const options = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return parentCandidates(task, tasks)
      .filter(item => !needle || item.title.toLowerCase().includes(needle) || resolveTaskKey(item, byName).toLowerCase().includes(needle))
      .slice(0, 50);
  }, [task, tasks, query, byName]);

  const pick = async (parent: Task) => {
    if (busy) return;
    setBusy(true);
    try {
      const ok = await onPick(parent);
      if (ok !== false) onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[100dvh] w-full max-w-full gap-3 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Convert to subtask</DialogTitle>
          <DialogDescription className="[overflow-wrap:anywhere]">
            Choose the task that &ldquo;{task.title}&rdquo; becomes a subtask of. It takes that task&rsquo;s project, sprint and epic.
          </DialogDescription>
        </DialogHeader>
        <Input
          aria-label="Search parent tasks"
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Search by key or title"
          className="h-11 text-base sm:h-9 sm:text-sm"
        />
        {options.length === 0 ? (
          <p className="text-sm text-slate-500">No eligible tasks. A parent must be a top-level task that is not an epic.</p>
        ) : (
          <ul aria-label="Eligible parent tasks" className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
            {options.map(item => (
              <li key={item._id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => { void pick(item); }}
                  aria-label={`Make subtask of ${resolveTaskKey(item, byName)} ${item.title}`.trim()}
                  className="flex min-h-11 w-full items-center gap-2 px-3 py-1 text-left hover:bg-slate-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary disabled:opacity-60"
                >
                  <TaskKey task={item} />
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-900">{item.title}</span>
                  <StatusBadge status={item.status} className="shrink-0 px-2 py-0.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ConvertToSubtaskDialog;
