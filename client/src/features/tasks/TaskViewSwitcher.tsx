import { List, Kanban, Calendar, GanttChartSquare } from 'lucide-react';

export type TaskView = 'list' | 'board' | 'calendar' | 'timeline';

const VIEWS: { key: TaskView; label: string; icon: typeof List }[] = [
  { key: 'list', label: 'List', icon: List },
  { key: 'board', label: 'Board', icon: Kanban },
  { key: 'calendar', label: 'Calendar', icon: Calendar },
  { key: 'timeline', label: 'Timeline', icon: GanttChartSquare },
];

interface TaskViewSwitcherProps {
  view: TaskView;
  onChange: (view: TaskView) => void;
}

const TaskViewSwitcher = ({ view, onChange }: TaskViewSwitcherProps) => {
  return (
    <div role="tablist" aria-label="Task views" className="inline-flex items-center gap-0.5 bg-slate-100 rounded-lg p-1">
      {VIEWS.map(({ key, label, icon: Icon }) => {
        const active = view === key;
        return (
          <button
            key={key}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(key)}
            className={`flex items-center gap-1.5 h-8 px-3 rounded-md text-sm font-medium transition-colors ${
              active
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Icon className="w-4 h-4" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        );
      })}
    </div>
  );
};

export default TaskViewSwitcher;
