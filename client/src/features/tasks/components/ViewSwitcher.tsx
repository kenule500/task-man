import type { LucideIcon } from 'lucide-react';
import { CalendarDays, ChartGantt, List, SquareKanban } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TASK_VIEWS } from '../constants';
import type { TaskView } from '../types';

const VIEW_ICONS: Record<TaskView, LucideIcon> = {
  list: List,
  board: SquareKanban,
  calendar: CalendarDays,
  timeline: ChartGantt,
};

interface ViewSwitcherProps {
  value: TaskView;
  onChange: (view: TaskView) => void;
  views?: TaskView[];
}

const ViewSwitcher = ({ value, onChange, views = TASK_VIEWS }: ViewSwitcherProps) => {
  const { t } = useTranslation('tasks');
  return (
  <Tabs value={value} onValueChange={next => onChange(next as TaskView)}>
    {/* Scrolls inside the tab list on very narrow screens, never the page */}
    <TabsList aria-label={t('view.switcher')} className="h-12 w-full justify-start overflow-x-auto [scrollbar-width:none] bg-slate-100 border border-slate-200 rounded-lg sm:h-9 sm:w-fit">
      {views.map(view => {
        const Icon = VIEW_ICONS[view];
        return (
          <TabsTrigger
            key={view}
            value={view}
            className="px-3 text-slate-500 data-active:bg-white data-active:text-slate-900 data-active:shadow-sm"
          >
            <Icon aria-hidden />
            {/* Below sm only the active view keeps its label, so all four fit in 375px */}
            <span className={cn(view !== value && 'max-sm:sr-only')}>{t(`view.${view}`)}</span>
          </TabsTrigger>
        );
      })}
    </TabsList>
  </Tabs>
  );
};

export default ViewSwitcher;
