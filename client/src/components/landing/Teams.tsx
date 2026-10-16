import { KeyRound, Mail, UserMinus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { roleDisplayName } from '@/components/settings/rbac';

// The five system roles shipped with every workspace (server/src/config/permissions.ts)
const SYSTEM_ROLES = ['Product Owner', 'Scrum Master', 'Developer', 'Team Member', 'Viewer'];

const STEPS = [
  { icon: Mail, key: 'invite' },
  { icon: KeyRound, key: 'custom' },
  { icon: UserMinus, key: 'access' },
] as const;

const Teams = () => {
  const { t } = useTranslation('landing');
  return (
  <section id="teams" aria-labelledby="teams-heading" className="scroll-mt-20 border-t border-slate-100 bg-white py-16 md:py-24">
    <div className="mx-auto max-w-7xl px-4 sm:px-6">
      <div className="mx-auto grid max-w-5xl items-center gap-10 md:grid-cols-2 md:gap-12">
        <div>
          <p className="mb-6 inline-block rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-700">
            {t('teams.badge')}
          </p>
          <h2 id="teams-heading" className="mb-6 text-balance text-3xl font-bold leading-tight text-slate-900 md:text-4xl">
            {t('teams.title')}
          </h2>
          <p className="mb-6 text-lg text-slate-600">
            {t('teams.description')}
          </p>
          <ul className="flex flex-wrap gap-2" aria-label={t('teams.builtInRoles')}>
            {SYSTEM_ROLES.map((role) => (
              <li key={role} className="rounded-md border border-slate-200 bg-slate-100 px-2.5 py-1 text-sm font-medium text-slate-700">
                {roleDisplayName({ name: role, isSystem: true })}
              </li>
            ))}
            <li className="rounded-md border border-blue-100 bg-blue-50 px-2.5 py-1 text-sm font-medium text-blue-700">
              {t('teams.ownRoles')}
            </li>
          </ul>
        </div>

        <ul className="space-y-4">
          {STEPS.map(({ icon: Icon, key }) => (
            <li key={key} className="flex items-start gap-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm sm:p-6">
              <div aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-primary">
                <Icon className="size-5" />
              </div>
              <div>
                <h3 className="mb-1 font-bold text-slate-900">{t(`teams.steps.${key}.title`)}</h3>
                <p className="text-sm text-slate-600">{t(`teams.steps.${key}.desc`)}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  </section>
  );
};

export default Teams;
