import type { ReactElement, ReactNode } from 'react';
import { UserAvatar } from '@/components/ds';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { useTaskKey } from '../hooks/useTaskKey';
import type { Task, TaskUser } from '../types';
import { DueDate, PriorityIndicator, StatusBadge, TaskTypeIcon } from './TaskBadges';

interface UserHoverCardProps {
  user: TaskUser;
  /** The element that opens the card. Rendered as-is when it is an element (`render`), else wrapped in a span. */
  children: ReactNode;
  /** Short context line under the name, e.g. "Assignee". */
  role?: string;
}

/**
 * Preview of a person on hover or focus of their avatar. Supplementary: the name is always available
 * in text next to (or screen-reader text for) the avatar, so the card is never the only way to get it.
 */
export const UserHoverCard = ({ user, children, role = 'Assignee' }: UserHoverCardProps) => (
  <HoverCard>
    <HoverCardTrigger render={<span className="inline-flex" />} delay={400}>{children}</HoverCardTrigger>
    <HoverCardContent width="sm" side="top" align="center">
      <div className="flex items-center gap-3">
        <UserAvatar name={user.name} src={user.avatarUrl || undefined} size="lg" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{user.name}</p>
          <p className="text-xs text-muted-foreground">{role}</p>
        </div>
      </div>
    </HoverCardContent>
  </HoverCard>
);

const TaskPreview = ({ task }: { task: Task }) => {
  const key = useTaskKey(task);
  return (
    <div className="space-y-2.5">
      <div className="flex items-start gap-2">
        <TaskTypeIcon type={task.type} />
        <div className="min-w-0">
          {key && <p className="font-mono text-xs text-muted-foreground tabular-nums">{key}</p>}
          <p className="text-sm font-semibold leading-5 text-foreground">{task.title}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <StatusBadge status={task.status} className="px-2 py-0.5" />
        <PriorityIndicator priority={task.priority} />
        {task.deadline && <DueDate deadline={task.deadline} completed={task.status === 'completed'} />}
      </div>
      {(task.assignees ?? []).length > 0 && (
        <p className="truncate text-xs text-muted-foreground">
          Assigned to {(task.assignees ?? []).map(user => user.name).join(', ')}
        </p>
      )}
    </div>
  );
};

interface TaskHoverCardProps {
  task: Task;
  /**
   * The focusable trigger, e.g. `<button onClick=…>`. The card opens when it is hovered or focused;
   * children passed here are rendered inside it.
   */
  render: ReactElement;
  children: ReactNode;
}

/** Preview of a task (key, title, status, priority, due date, assignees) from its key or title in a list or breadcrumb. */
export const TaskHoverCard = ({ task, render, children }: TaskHoverCardProps) => (
  <HoverCard>
    <HoverCardTrigger render={render} delay={400}>{children}</HoverCardTrigger>
    <HoverCardContent width="md" side="bottom" align="start">
      <TaskPreview task={task} />
    </HoverCardContent>
  </HoverCard>
);
