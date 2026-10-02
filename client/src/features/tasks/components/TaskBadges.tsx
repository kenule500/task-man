import { AlertTriangle, ArrowDown, ArrowUp, Calendar, Minus, UserRound } from 'lucide-react';
import { isPast, isToday } from 'date-fns';
import type { TaskMember, TaskPriority, TaskStatus } from '../types';
import { formatStatusLabel } from '../types';
import { getAvatarColor, getLabelStyle } from '../labelColors';

const PRIORITY_STYLES: Record<TaskPriority, { className: string; icon: typeof ArrowUp; label: string }> = {
  high: { className: 'text-red-600 bg-red-50 border-red-100', icon: ArrowUp, label: 'High' },
  medium: { className: 'text-amber-600 bg-amber-50 border-amber-100', icon: Minus, label: 'Medium' },
  low: { className: 'text-emerald-600 bg-emerald-50 border-emerald-100', icon: ArrowDown, label: 'Low' },
};

export const PriorityBadge = ({ priority }: { priority: TaskPriority }) => {
  const { className, icon: Icon, label } = PRIORITY_STYLES[priority];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border ${className}`}>
      <Icon className="w-3 h-3" /> {label}
    </span>
  );
};

const STATUS_STYLES: Record<TaskStatus, string> = {
  pending: 'bg-slate-100 text-slate-700 border-slate-200',
  'in-progress': 'bg-blue-50 text-blue-700 border-blue-100',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-100',
};

export const StatusBadge = ({ status }: { status: TaskStatus }) => (
  <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium border ${STATUS_STYLES[status]}`}>
    {formatStatusLabel(status)}
  </span>
);

export const LabelPill = ({ label }: { label: string }) => {
  const { bg, text } = getLabelStyle(label);
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${bg} ${text}`}>
      {label}
    </span>
  );
};

const AVATAR_DIMENSIONS: Record<'sm' | 'md', string> = {
  sm: 'w-6 h-6 text-[10px]',
  md: 'w-8 h-8 text-xs',
};

const ICON_DIMENSIONS: Record<'sm' | 'md', string> = {
  sm: 'w-3 h-3',
  md: 'w-4 h-4',
};

const SingleAvatar = ({ member, size }: { member: TaskMember; size: 'sm' | 'md' }) => {
  const initial = member?.name?.trim()?.charAt(0)?.toUpperCase();
  return (
    <div
      title={member?.name || 'Unnamed'}
      aria-label={member?.name || 'Unnamed'}
      style={{ backgroundColor: getAvatarColor(member?.name || member?._id || '?') }}
      className={`${AVATAR_DIMENSIONS[size]} rounded-full text-white font-semibold flex items-center justify-center flex-shrink-0 ring-2 ring-white`}
    >
      {initial || <UserRound className={ICON_DIMENSIONS[size]} />}
    </div>
  );
};

export const AssigneeAvatarGroup = ({
  assignees, size = 'sm', max = 3,
}: { assignees: TaskMember[]; size?: 'sm' | 'md'; max?: number }) => {
  if (assignees.length === 0) {
    return (
      <div
        title="Unassigned"
        aria-label="Unassigned"
        className={`${AVATAR_DIMENSIONS[size]} rounded-full bg-slate-100 text-slate-400 flex items-center justify-center flex-shrink-0 ring-2 ring-white`}
      >
        <UserRound className={ICON_DIMENSIONS[size]} />
      </div>
    );
  }

  const visible = assignees.slice(0, max);
  const overflow = assignees.length - visible.length;

  return (
    <div
      className="flex items-center -space-x-2"
      aria-label={`Assigned to ${assignees.map(a => a.name).join(', ')}`}
    >
      {visible.map(member => <SingleAvatar key={member._id} member={member} size={size} />)}
      {overflow > 0 && (
        <div
          title={assignees.slice(max).map(a => a.name).join(', ')}
          className={`${AVATAR_DIMENSIONS[size]} rounded-full bg-slate-200 text-slate-600 font-semibold flex items-center justify-center flex-shrink-0 ring-2 ring-white`}
        >
          +{overflow}
        </div>
      )}
    </div>
  );
};

export const DueDateLabel = ({ deadline, status }: { deadline?: string; status: TaskStatus }) => {
  if (!deadline) {
    return <span className="text-xs text-slate-400">No due date</span>;
  }
  const date = new Date(deadline);
  const overdue = status !== 'completed' && isPast(date) && !isToday(date);
  const dueToday = status !== 'completed' && isToday(date);

  return (
    <span className={`inline-flex items-center gap-1 text-xs ${overdue ? 'text-red-600 font-medium' : dueToday ? 'text-amber-600 font-medium' : 'text-slate-500'}`}>
      {overdue ? <AlertTriangle className="w-3 h-3" /> : <Calendar className="w-3 h-3" />}
      {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
      {overdue && ' · Overdue'}
      {dueToday && ' · Today'}
    </span>
  );
};
