const DashboardMockup = () => {
  const sidebarMain = [
    { label: 'Dashboard', active: true },
    { label: 'Tasks', active: false },
    { label: 'Projects', active: false },
    { label: 'Team Members', active: false },
    { label: 'Calendar', active: false },
    { label: 'Reports', active: false },
  ];

  const sidebarGeneral = [
    { label: 'Settings' },
    { label: 'Help & Center' },
  ];

  const statCards = [
    { label: 'Total Tasks', value: '12' },
    { label: 'In Progress', value: '4' },
    { label: 'Completed', value: '6' },
    { label: 'Pending', value: '2' },
  ];

  const tasks = [
    { title: 'Design new landing page', priority: 'High', status: 'In Progress', date: 'Mar 12' },
    { title: 'Update brand colors', priority: 'Medium', status: 'Pending', date: 'Mar 13' },
    { title: 'Checkout flow redesign', priority: 'High', status: 'In Progress', date: 'Mar 14' },
    { title: 'API integration testing', priority: 'Medium', status: 'Completed', date: 'Mar 15' },
    { title: 'Design system audit', priority: 'Medium', status: 'In Progress', date: 'Mar 16' },
    { title: 'Email template QA', priority: 'Low', status: 'Pending', date: 'Mar 17' },
    { title: 'User research interviews', priority: 'Low', status: 'Completed', date: 'Mar 18' },
  ];

  const statusStyles: Record<string, string> = {
    'Completed': 'bg-emerald-50 text-emerald-700 border-emerald-100',
    'In Progress': 'bg-blue-50 text-blue-700 border-blue-100',
    'Pending': 'bg-slate-100 text-slate-700 border-slate-200',
  };

  const priorityStyles: Record<string, string> = {
    'High': 'text-red-600',
    'Medium': 'text-amber-600',
    'Low': 'text-emerald-600',
  };

  return (
    <figure aria-hidden="true" className="mx-auto mt-12 w-full max-w-6xl px-4 animate-fade-in-up motion-reduce:animate-none! animation-delay-300 md:mt-20">
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-tr from-primary/20 via-blue-200/20 to-transparent blur-3xl -z-10"></div>

        <div className="bg-white rounded-2xl shadow-2xl shadow-slate-300/50 border border-slate-200 overflow-hidden">
          {/* Browser Bar */}
          <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 border-b border-slate-200">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-400"></div>
              <div className="w-3 h-3 rounded-full bg-amber-400"></div>
              <div className="w-3 h-3 rounded-full bg-emerald-400"></div>
            </div>
            <div className="flex-1 mx-4">
              <div className="bg-white rounded-md border border-slate-200 px-3 py-1 text-xs text-slate-400 text-center">
                yourteam.taskman.app/tasks
              </div>
            </div>
          </div>

          {/* Dashboard Content */}
          <div className="flex bg-slate-50">
            {/* Sidebar */}
            <div className="hidden md:flex w-56 bg-white border-r border-slate-200 p-4 flex-col">
              <div className="flex items-center gap-2 mb-6 px-2">
                <div className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center text-white text-xs font-bold">T</div>
                <div>
                  <div className="font-bold text-slate-900 text-xs leading-tight">TaskMan</div>
                  <div className="text-[9px] text-slate-400 leading-tight">Workspace</div>
                </div>
              </div>

              <div className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider mb-2 px-2">Main Menu</div>
              <div className="flex flex-col gap-0.5 mb-5">
                {sidebarMain.map((item, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-3 px-3 py-1.5 rounded-lg text-[11px] font-medium ${
                      item.active ? 'bg-primary/10 text-primary' : 'text-slate-500'
                    }`}
                  >
                    <div className={`w-3 h-3 rounded ${item.active ? 'bg-primary' : 'bg-slate-300'}`}></div>
                    {item.label}
                  </div>
                ))}
              </div>

              <div className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider mb-2 px-2">General</div>
              <div className="flex flex-col gap-0.5 mb-5">
                {sidebarGeneral.map((item, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-1.5 rounded-lg text-[11px] font-medium text-slate-500">
                    <div className="w-3 h-3 rounded bg-slate-300"></div>
                    {item.label}
                  </div>
                ))}
              </div>

              <div className="flex-1"></div>

              <div className="border-t border-slate-100 pt-3 mt-2">
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary text-[10px] font-bold flex-shrink-0">A</div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-semibold text-slate-900 truncate">Ada Lovelace</div>
                    <div className="text-[9px] text-slate-400 truncate">ada@example.com</div>
                  </div>
                  <svg className="w-3 h-3 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 p-5">
              <div className="flex justify-between items-center mb-5">
                <div>
                  <div className="text-lg font-bold text-slate-900">My Tasks</div>
                  <div className="text-xs text-slate-400 mt-0.5">Manage and track all your tasks</div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="hidden sm:block bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-400 w-40">Search tasks...</div>
                  <div className="bg-primary text-white rounded-lg px-3 py-1.5 text-xs font-medium">+ Add Task</div>
                </div>
              </div>

              {/* Stat Cards */}
              <div className="grid grid-cols-4 gap-3 mb-5">
                {statCards.map((card, i) => (
                  <div key={i} className="bg-white rounded-xl border border-slate-100 p-3">
                    <div className="text-[10px] font-semibold text-slate-500 mb-2">{card.label}</div>
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
                  <div className="col-span-5">Task Name</div>
                  <div className="col-span-2">Priority</div>
                  <div className="col-span-2">Status</div>
                  <div className="col-span-2">Due Date</div>
                </div>

                {tasks.map((task, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 px-4 py-2.5 border-b border-slate-50 last:border-0 items-center text-xs">
                    <div className="col-span-1">
                      <div className="w-3 h-3 rounded border border-slate-300"></div>
                    </div>
                    <div className="col-span-5 text-slate-800 font-medium truncate">{task.title}</div>
                    <div className="col-span-2">
                      <span className={`text-[10px] font-semibold ${priorityStyles[task.priority]}`}>
                        {task.priority}
                      </span>
                    </div>
                    <div className="col-span-2">
                      <span className={`text-[9px] font-medium px-2 py-0.5 rounded-md border ${statusStyles[task.status]}`}>
                        {task.status}
                      </span>
                    </div>
                    <div className="col-span-2 text-slate-500 text-[10px]">{task.date}</div>
                  </div>
                ))}

                {/* Pagination */}
                <div className="flex justify-between items-center px-4 py-2.5 bg-slate-50/50 border-t border-slate-100">
                  <div className="text-[9px] text-slate-500">Showing 7 of 12 tasks</div>
                  <div className="flex items-center gap-1">
                    <div className="w-5 h-5 rounded border border-slate-200 bg-white flex items-center justify-center text-slate-400 text-[10px]">‹</div>
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
      <figcaption className="mt-4 text-center text-xs text-gray-600">
        Illustration with sample data.
      </figcaption>
    </figure>
  );
};

export default DashboardMockup;