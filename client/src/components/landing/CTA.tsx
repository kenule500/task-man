import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Zap } from 'lucide-react';
import { getLandingAuth } from './landingAuth';

const CTA = () => {
  const { t } = useTranslation('landing');
  const { isLoggedIn, appUrl } = getLandingAuth();

  return (
    <section aria-labelledby="cta-heading" className="px-4 py-16 sm:px-6 md:py-20">
      <div className="mx-auto max-w-4xl rounded-3xl bg-gradient-to-br from-primary to-blue-700 p-8 text-center shadow-2xl shadow-primary/30 sm:p-12">
        <div aria-hidden className="mx-auto mb-6 flex size-12 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
          <Zap className="size-6 text-white" />
        </div>
        <h2 id="cta-heading" className="mb-4 text-balance text-3xl font-bold text-white md:text-4xl">
          {isLoggedIn ? t('cta.titleBack') : t('cta.title')}
        </h2>
        <p className="mx-auto mb-8 max-w-xl text-lg text-white/90">
          {isLoggedIn ? t('cta.descriptionBack') : t('cta.description')}
        </p>
        <Link
          to={appUrl}
          className="inline-flex items-center gap-2 rounded-xl bg-white px-8 py-3.5 text-lg font-semibold text-primary shadow-lg transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          {isLoggedIn ? t('goToDashboard') : t('createAccount')} <ArrowRight className="size-5 rtl:-scale-x-100" aria-hidden />
        </Link>
      </div>
    </section>
  );
};

export default CTA;
