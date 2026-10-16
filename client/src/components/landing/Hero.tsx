import { Link } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { getLandingAuth } from './landingAuth';

const Hero = () => {
  const { t } = useTranslation('landing');
  const { isLoggedIn, appUrl } = getLandingAuth();

  return (
    <section aria-labelledby="hero-heading" className="relative mt-28 flex flex-col items-center px-4 text-center md:mt-40">
      <div aria-hidden className="absolute left-1/2 top-0 -z-10 h-[400px] w-[min(800px,100vw)] -translate-x-1/2 rounded-full bg-blue-100/50 opacity-70 blur-3xl" />

      <p className="mb-6 inline-block rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-700 animate-fade-in-up motion-reduce:animate-none!">
        {t('hero.badge')}
      </p>

      <h1
        id="hero-heading"
        className="max-w-4xl text-balance text-4xl font-extrabold leading-tight tracking-tight text-slate-900 animate-fade-in-up motion-reduce:animate-none! animation-delay-100 sm:text-5xl md:text-7xl"
      >
        <Trans t={t} i18nKey="hero.title" components={{ g: <span className="bg-gradient-to-r from-primary to-blue-500 bg-clip-text text-transparent" /> }} />
      </h1>

      <p className="mt-6 max-w-2xl text-lg text-slate-600 animate-fade-in-up motion-reduce:animate-none! animation-delay-200 md:text-xl">
        {t('hero.subtitle')}
      </p>

      <div className="mt-10 flex w-full flex-col items-stretch gap-3 animate-fade-in-up motion-reduce:animate-none! animation-delay-300 sm:w-auto sm:flex-row sm:gap-4">
        <Link
          to={appUrl}
          className="rounded-xl bg-primary px-8 py-3.5 text-lg font-semibold text-white shadow-lg shadow-blue-500/30 transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {isLoggedIn ? t('goToDashboard') : t('createAccount')}
        </Link>
        <a
          href="#features"
          className="rounded-xl border border-slate-300 bg-white px-8 py-3.5 text-lg font-semibold text-slate-800 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {t('hero.seeInside')}
        </a>
      </div>

      {!isLoggedIn && (
        <p className="mt-4 text-sm text-slate-600 animate-fade-in-up motion-reduce:animate-none! animation-delay-300">
          {t('hero.note')}
        </p>
      )}
    </section>
  );
};

export default Hero;
