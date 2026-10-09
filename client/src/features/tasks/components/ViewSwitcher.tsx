import type { LucideIcon } from 'lucide-react';
import { CalendarDays, ChartGantt, List, SquareKanban } from 'lucide-react';
import { cn } from '@/lib/utils';
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
    {/* Scrolls inside the tab list on very narrow screens, never the page */}
    <TabsList aria-label="Task views" className="h-12 w-full justify-start overflow-x-auto [scrollbar-width:none] bg-slate-100 border border-slate-200 rounded-lg sm:h-9 sm:w-fit">
      {views.map(view => {
        const { label, icon: Icon } = VIEW_META[view];
        return (
          <TabsTrigger
            key={view}
            value={view}
            className="px-3 text-slate-500 data-active:bg-white data-active:text-slate-900 data-active:shadow-sm"
          >
            <Icon aria-hidden />
            {/* Below sm only the active view keeps its label, so all four fit in 375px */}
            <span className={cn(view !== value && 'max-sm:sr-only')}>{label}</span>
          </TabsTrigger>
        );
      })}
    </TabsList>
  </Tabs>
);

export default ViewSwitcher;
