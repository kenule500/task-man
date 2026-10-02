import type { LucideIcon } from 'lucide-react';
import { CalendarDays, ChartGantt, List, SquareKanban } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TASK_VIEWS } from '../constants';
import type { TaskView } from '../types';

const VIEW_META: Record<TaskView, { label: string; icon: LucideIcon }> = {
  list: { label: 'List', icon: List },
  board: { label: 'Board', icon: SquareKanban },
  calendar: { label: 'Calendar', icon: CalendarDays },
  timeline: { label: 'Timeline', icon: ChartGantt },
};

interface ViewSwitcherProps {
  value: TaskView;
  onChange: (view: TaskView) => void;
  views?: TaskView[];
}

const ViewSwitcher = ({ value, onChange, views = TASK_VIEWS }: ViewSwitcherProps) => (
  <Tabs value={value} onValueChange={next => onChange(next as TaskView)}>
    <TabsList aria-label="Task views" className="h-9 bg-slate-100 border border-slate-200 rounded-lg">
      {views.map(view => {
        const { label, icon: Icon } = VIEW_META[view];
        return (
          <TabsTrigger
            key={view}
            value={view}
            className="px-3 text-slate-500 data-active:bg-white data-active:text-slate-900 data-active:shadow-sm"
          >
            <Icon aria-hidden />
            {label}
          </TabsTrigger>
        );
      })}
    </TabsList>
  </Tabs>
);

export default ViewSwitcher;
