import { useTranslation } from 'react-i18next';

const MAIN_ITEMS = ['dashboard', 'tasks', 'projects', 'team', 'calendar', 'reports'] as const;
const GENERAL_ITEMS = ['settings', 'help'] as const;

const STAT_CARDS = [
  { key: 'total', value: '12' },
  { key: 'inProgress', value: '4' },
  { key: 'completed', value: '6' },
  { key: 'pending', value: '2' },
] as const;

const TASKS = [
  { id: 1, priority: 'high', status: 'inProgress', day: 12 },
  { id: 2, priority: 'medium', status: 'pending', day: 13 },
  { id: 3, priority: 'high', status: 'inProgress', day: 14 },
  { id: 4, priority: 'medium', status: 'completed', day: 15 },
  { id: 5, priority: 'medium', status: 'inProgress', day: 16 },
  { id: 6, priority: 'low', status: 'pending', day: 17 },
  { id: 7, priority: 'low', status: 'completed', day: 18 },
] as const;

const STATUS_STYLES: Record<string, string> = {
  completed: 'bg-success-bg text-success-fg border-success-border',
  inProgress: 'bg-blue-50 text-blue-700 border-blue-100',
  pending: 'bg-slate-100 text-slate-700 border-slate-200',
};

const PRIORITY_STYLES: Record<string, string> = {
  high: 'text-danger-fg',
  medium: 'text-warning-fg',
  low: 'text-success-fg',
};

const DashboardMockup = () => {
  const { t } = useTranslation('landing');

  return (
    <figure aria-hidden="true" className="mx-auto mt-12 w-full max-w-6xl px-4 animate-fade-in-up motion-reduce:animate-none! animation-delay-300 md:mt-20">
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-tr from-primary/20 via-blue-200/20 to-transparent blur-3xl -z-10"></div>

        <div className="bg-white rounded-2xl shadow-2xl shadow-slate-300/50 border border-slate-200 overflow-hidden">
          {/* Browser Bar */}
          <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 border-b border-slate-200">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-danger-dot"></div>
              <div className="w-3 h-3 rounded-full bg-warning-dot"></div>
              <div className="w-3 h-3 rounded-full bg-success-dot"></div>
            </div>
            <div className="flex-1 mx-4">
              <div className="bg-white rounded-md border border-slate-200 px-3 py-1 text-xs text-slate-500 text-center">
                yourteam.taskman.app/tasks
              </div>
            </div>
          </div>

          {/* Dashboard Content */}
          <div className="flex bg-slate-50">
            {/* Sidebar */}
            <div className="hidden md:flex w-56 bg-white border-e border-slate-200 p-4 flex-col">
              <div className="flex items-center gap-2 mb-6 px-2">
                <div className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center text-white text-xs font-bold">T</div>
                <div>
                  <div className="font-bold text-slate-900 text-xs leading-tight">TaskMan</div>
                  <div className="text-[9px] text-slate-500 leading-tight">{t('mockup.workspace')}</div>
                </div>
              </div>

              <div className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider mb-2 px-2">{t('mockup.mainMenu')}</div>
              <div className="flex flex-col gap-0.5 mb-5">
                {MAIN_ITEMS.map((item, i) => (
                  <div
                    key={item}
                    className={`flex items-center gap-3 px-3 py-1.5 rounded-lg text-[11px] font-medium ${
                      i === 0 ? 'bg-primary/10 text-primary-hover' : 'text-slate-500'
                    }`}
                  >
                    <div className={`w-3 h-3 rounded ${i === 0 ? 'bg-primary' : 'bg-slate-300'}`}></div>
                    {t(`mockup.items.${item}`)}
                  </div>
                ))}
              </div>

              <div className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider mb-2 px-2">{t('mockup.general')}</div>
              <div className="flex flex-col gap-0.5 mb-5">
                {GENERAL_ITEMS.map((item) => (
                  <div key={item} className="flex items-center gap-3 px-3 py-1.5 rounded-lg text-[11px] font-medium text-slate-500">
                    <div className="w-3 h-3 rounded bg-slate-300"></div>
                    {t(`mockup.items.${item}`)}
                  </div>
                ))}
              </div>

              <div className="flex-1"></div>

              <div className="border-t border-slate-100 pt-3 mt-2">
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary text-[10px] font-bold flex-shrink-0">A</div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-semibold text-slate-900 truncate">Ada Lovelace</div>
                    <div className="text-[9px] text-slate-500 truncate">ada@example.com</div>
                  </div>
                  <svg className="w-3 h-3 text-slate-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 p-5">
              <div className="flex justify-between items-center mb-5">
                <div>
                  <div className="text-lg font-bold text-slate-900">{t('mockup.title')}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{t('mockup.subtitle')}</div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="hidden sm:block bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-500 w-40">{t('mockup.search')}</div>
                  <div className="bg-primary text-white rounded-lg px-3 py-1.5 text-xs font-medium">{t('mockup.addTask')}</div>
                </div>
              </div>

              {/* Stat Cards */}
              <div className="grid grid-cols-4 gap-3 mb-5">
                {STAT_CARDS.map((card) => (
                  <div key={card.key} className="bg-white rounded-xl border border-slate-100 p-3">
                    <div className="text-[10px] font-semibold text-slate-500 mb-2">{t(`mockup.stats.${card.key}`)}</div>
                    <div className="flex items-end justify-between">
                      <span className="text-xl font-bold text-slate-900">{card.value}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Task Table */}
              <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
                <div className="grid grid-cols-12 gap-2 px-4 py-2.5 border-b border-slate-100 bg-slate-50/50 text-[9px] font-semibold text-slate-500 uppercase tracking-wider">
                  <div className="col-span-1"></div>
                  <div className="col-span-5">{t('mockup.columns.name')}</div>
                  <div className="col-span-2">{t('mockup.columns.priority')}</div>
                  <div className="col-span-2">{t('mockup.columns.status')}</div>
                  <div className="col-span-2">{t('mockup.columns.due')}</div>
                </div>

                {TASKS.map((task) => (
                  <div key={task.id} className="grid grid-cols-12 gap-2 px-4 py-2.5 border-b border-slate-50 last:border-0 items-center text-xs">
                    <div className="col-span-1">
                      <div className="w-3 h-3 rounded border border-slate-300"></div>
                    </div>
                    <div className="col-span-5 text-slate-800 font-medium truncate">{t(`mockup.tasks.${task.id}`)}</div>
                    <div className="col-span-2">
                      <span className={`text-[10px] font-semibold ${PRIORITY_STYLES[task.priority]}`}>
                        {t(`mockup.priorities.${task.priority}`)}
                      </span>
                    </div>
                    <div className="col-span-2">
                      <span className={`text-[9px] font-medium px-2 py-0.5 rounded-md border ${STATUS_STYLES[task.status]}`}>
                        {t(`mockup.statuses.${task.status}`)}
                      </span>
                    </div>
                    <div className="col-span-2 text-slate-500 text-[10px]">{t('mockup.date', { day: task.day })}</div>
                  </div>
                ))}

                {/* Pagination */}
                <div className="flex justify-between items-center px-4 py-2.5 bg-slate-50/50 border-t border-slate-100">
                  <div className="text-[9px] text-slate-500">{t('mockup.showing')}</div>
                  <div className="flex items-center gap-1">
                    <div className="w-5 h-5 rounded border border-slate-200 bg-white flex items-center justify-center text-slate-500 text-[10px]">‹</div>
                    <div className="w-5 h-5 rounded bg-primary text-white flex items-center justify-center text-[10px] font-medium">1</div>
                    <div className="w-5 h-5 rounded border border-slate-200 bg-white flex items-center justify-center text-slate-600 text-[10px]">2</div>
                    <div className="w-5 h-5 rounded border border-slate-200 bg-white flex items-center justify-center text-slate-600 text-[10px]">›</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <figcaption className="mt-4 text-center text-xs text-slate-600">
        {t('mockup.caption')}
      </figcaption>
    </figure>
  );
};

export default DashboardMockup;