import { useLocation, useNavigate, Outlet } from 'react-router-dom';
import { User, Bell, Lock } from 'lucide-react';
import AppShell from '@/components/AppShell';
import { PageHeader } from '@/components/ds';
import { cn } from '@/lib/utils';

const sections = [
  { id: 'profile', label: 'Profile', description: 'Your public information', icon: User },
  { id: 'notifications', label: 'Notifications', description: 'Email & push preferences', icon: Bell },
  { id: 'security', label: 'Security', description: 'Password & account safety', icon: Lock },
];

const SettingsLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();

  // Determine active section from URL
  const activeSection = location.pathname.split('/').pop() || 'profile';

  return (
    <AppShell requireOnboarding={false}>
      <PageHeader title="Settings" description="Manage your account and preferences" />

      {/* Two-column layout from lg; a scrollable tab row on smaller screens */}
      <div className="grid max-w-6xl grid-cols-1 gap-6 lg:grid-cols-[260px_1fr] lg:gap-8">
        <nav
          aria-label="Settings sections"
          className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 lg:sticky lg:top-6 lg:mx-0 lg:h-fit lg:flex-col lg:gap-1 lg:overflow-visible lg:px-0 lg:pb-0"
        >
          {sections.map(({ id, label, description, icon: Icon }) => {
            const active = activeSection === id;
            return (
              <button
                key={id}
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => navigate(`/settings/${id}`)}
                className={cn(
                  'flex min-h-10 shrink-0 snap-start items-center gap-2 rounded-xl p-3 text-left transition-colors lg:w-full lg:items-start lg:gap-3',
                  'focus-visible:outline-2 focus-visible:outline-primary',
                  active ? 'bg-primary/10 text-primary' : 'text-slate-600 hover:bg-slate-100',
                )}
              >
                <Icon className={cn('size-4 shrink-0 lg:mt-0.5', active ? 'text-primary' : 'text-slate-400')} aria-hidden />
                <div className="min-w-0">
                  <p className="whitespace-nowrap text-sm font-medium">{label}</p>
                  <p className={cn('mt-0.5 hidden truncate text-xs lg:block', active ? 'text-primary/70' : 'text-slate-400')}>
                    {description}
                  </p>
                </div>
              </button>
            );
          })}
        </nav>

        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    </AppShell>
  );
};

export default SettingsLayout;
