import { Link, useLocation, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { User, Bell, Lock } from 'lucide-react';
import AppShell from '@/components/AppShell';
import { PageHeader } from '@/components/ds';
import { cn } from '@/lib/utils';

const sections = [
  { id: 'profile', icon: User },
  { id: 'notifications', icon: Bell },
  { id: 'security', icon: Lock },
] as const;

const SettingsLayout = () => {
  const { t } = useTranslation('settings');
  const location = useLocation();

  // Determine active section from URL
  const activeSection = location.pathname.split('/').pop() || 'profile';

  return (
    <AppShell requireOnboarding={false}>
      <PageHeader title={t('layout.title')} description={t('layout.description')} />

      {/* Two-column layout from lg; a scrollable tab row on smaller screens */}
      <div className="grid max-w-6xl grid-cols-1 gap-6 lg:grid-cols-[260px_1fr] lg:gap-8">
        <nav
          aria-label={t('layout.sections')}
          className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 lg:sticky lg:top-6 lg:mx-0 lg:h-fit lg:flex-col lg:gap-1 lg:overflow-visible lg:px-0 lg:pb-0"
        >
          {sections.map(({ id, icon: Icon }) => {
            const active = activeSection === id;
            return (
              <Link
                key={id}
                to={`/settings/${id}`}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-10 shrink-0 snap-start items-center gap-2 rounded-xl p-3 text-start transition-colors lg:w-full lg:items-start lg:gap-3',
                  'focus-visible:outline-2 focus-visible:outline-primary',
                  active ? 'bg-primary/10 text-primary-hover' : 'text-slate-600 hover:bg-slate-100',
                )}
              >
                <Icon className={cn('size-4 shrink-0 lg:mt-0.5', active ? 'text-primary' : 'text-slate-500')} aria-hidden />
                <div className="min-w-0">
                  <p className="whitespace-nowrap text-sm font-medium">{t(`layout.${id}.label`)}</p>
                  <p className={cn('mt-0.5 hidden truncate text-xs lg:block', active ? 'text-primary-hover' : 'text-slate-600')}>
                    {t(`layout.${id}.description`)}
                  </p>
                </div>
              </Link>
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
