import type { ReactNode } from 'react';
import type { Task } from '@/features/tasks';
import TaskRow from './TaskRow';

interface TaskListProps {
  label: string;
  tasks: Task[];
  subtasks: Map<string, Task[]>;
  canWrite: boolean;
  onOpen: (task: Task) => void;
  onToggleSubtask: (subtask: Task, done: boolean) => void;
  /** Control shown at the right of each row. */
  renderTrailing?: (task: Task) => ReactNode;
  /** Shown instead of the list when there are no tasks. */
  empty: ReactNode;
}

/** List of story / task / bug rows with their subtasks. */
const TaskList = ({ label, tasks, subtasks, canWrite, onOpen, onToggleSubtask, renderTrailing, empty }: TaskListProps) =>
  tasks.length === 0 ? (
    <>{empty}</>
  ) : (
    <ul aria-label={label}>
      {tasks.map(task => (
        <TaskRow
          key={task._id}
          task={task}
          subtasks={subtasks.get(task._id)}
          canWrite={canWrite}
          onOpen={onOpen}
          onToggleSubtask={onToggleSubtask}
          trailing={renderTrailing?.(task)}
        />
      ))}
    </ul>
  );

export default TaskList;
