import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { useProjectDirectory } from '@/features/projects/context/ProjectsContext';
import { useTasks } from '@/features/tasks/hooks/useTasks';
import { resolveTaskKey } from '@/features/tasks/lib/taskKey';

interface TaskMentionPickerProps {
  workspaceSlug: string;
  onPick: (key: string) => void;
}

const MAX_RESULTS = 8;

/** Searchable list of tasks; choosing one inserts its key ("WEB-12"), which links to the task once the page is saved. */
const TaskMentionPicker = ({ workspaceSlug, onPick }: TaskMentionPickerProps) => {
  const { tasks, loading } = useTasks(workspaceSlug);
  const { byName } = useProjectDirectory();
  const [query, setQuery] = useState('');

  const options = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return tasks
      .map(task => ({ id: task._id, title: task.title, key: resolveTaskKey(task, byName) }))
      .filter(option => option.key && (!needle || option.key.toLowerCase().includes(needle) || option.title.toLowerCase().includes(needle)))
      .slice(0, MAX_RESULTS);
  }, [tasks, byName, query]);

  return (
    <div className="space-y-2">
      <Input
        autoFocus
        type="search"
        aria-label="Find a task"
        placeholder="Find a task by key or title"
        value={query}
        onChange={event => setQuery(event.target.value)}
        autoComplete="off"
        className="h-11 text-base md:h-9 md:text-sm"
      />
      {loading && tasks.length === 0 ? (
        <p role="status" className="px-1 py-2 text-sm text-text-subtle">Loading tasks</p>
      ) : options.length === 0 ? (
        <p className="px-1 py-2 text-sm text-text-subtle">No task matches.</p>
      ) : (
        <ul aria-label="Tasks" className="max-h-60 space-y-0.5 overflow-y-auto">
          {options.map(option => (
            <li key={option.id}>
              <button
                type="button"
                onClick={() => onPick(option.key)}
                className="flex min-h-11 w-full items-baseline gap-2 rounded-lg px-2 py-1.5 text-left text-sm outline-none hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-focus md:min-h-9"
              >
                <span className="shrink-0 font-mono text-xs tabular-nums text-text-subtle">{option.key}</span>
                <span className="min-w-0 truncate text-text-strong">{option.title}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default TaskMentionPicker;
