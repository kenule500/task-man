import { GitBranch, LayoutGrid, MessageSquare, ShieldCheck, Smartphone, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const FEATURES = [
  { icon: LayoutGrid, key: 'views' },
  { icon: GitBranch, key: 'dependencies' },
  { icon: Users, key: 'roles' },
  { icon: MessageSquare, key: 'comments' },
  { icon: Smartphone, key: 'install' },
  { icon: ShieldCheck, key: 'secure' },
] as const;

const Features = () => {
  const { t } = useTranslation('landing');
  return (
  <section id="features" aria-labelledby="features-heading" className="scroll-mt-20 bg-background py-16 md:py-24">
    <div className="mx-auto max-w-7xl px-4 sm:px-6">
      <div className="mb-12 text-center md:mb-16">
        <h2 id="features-heading" className="mb-4 text-balance text-3xl font-bold text-slate-900 md:text-4xl">
          {t('features.title')}
        </h2>
        <p className="mx-auto max-w-2xl text-lg text-slate-600">
          {t('features.subtitle')}
        </p>
      </div>

      <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-8">
        {FEATURES.map(({ icon: Icon, key }) => (
          <li
            key={key}
            className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm transition-shadow hover:shadow-md sm:p-8"
          >
            <div aria-hidden className="mb-5 flex size-12 items-center justify-center rounded-xl bg-blue-50 text-primary">
              <Icon className="size-6" />
            </div>
            <h3 className="mb-2 text-xl font-bold text-slate-900">{t(`features.items.${key}.title`)}</h3>
            <p className="text-slate-600">{t(`features.items.${key}.desc`)}</p>
          </li>
        ))}
      </ul>
    </div>
  </section>
  );
};

export default Features;
