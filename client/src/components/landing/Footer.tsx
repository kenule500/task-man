import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const LINK =
  'inline-flex min-h-10 items-center rounded px-1 transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-primary';

const Footer = () => {
  const { t } = useTranslation('landing');
  return (
  <footer className="border-t border-slate-100 bg-white py-10 md:py-12">
    <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-4 sm:px-6 md:flex-row">
      <div className="flex items-center gap-2">
        <span aria-hidden className="flex size-6 items-center justify-center rounded bg-primary text-xs font-bold text-white">T</span>
        <span className="text-lg font-bold text-slate-900">TaskMan</span>
      </div>

      <nav aria-label={t('footer.label')}>
        <ul className="flex flex-wrap items-center justify-center gap-x-5 text-sm text-slate-600">
          <li><a href="#features" className={LINK}>{t('nav.features')}</a></li>
          <li><a href="#teams" className={LINK}>{t('nav.teams')}</a></li>
          <li><Link to="/design-system" className={LINK}>{t('footer.designSystem')}</Link></li>
          <li><Link to="/login" className={LINK}>{t('nav.signIn')}</Link></li>
        </ul>
      </nav>

      <p className="text-sm text-slate-600">© {new Date().getFullYear()} TaskMan</p>
    </div>
  </footer>
  );
};

export default Footer;
