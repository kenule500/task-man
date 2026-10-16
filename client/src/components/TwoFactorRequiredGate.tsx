import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ShieldAlert } from 'lucide-react';
import { EmptyState } from '@/components/ds';
import { buttonVariants } from '@/components/ui/button';
import { TWO_FACTOR_REQUIRED_EVENT } from '@/utils/twoFactorRequired';

/**
 * Blocking screen for members of a workspace that requires two-factor authentication while their account has none.
 * It appears when any request answers 403 TWO_FACTOR_REQUIRED and covers the workspace until they set it up.
 */
const TwoFactorRequiredGate = () => {
  const { t } = useTranslation('nav');
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    const onRequired = () => setBlocked(true);
    window.addEventListener(TWO_FACTOR_REQUIRED_EVENT, onRequired);
    return () => window.removeEventListener(TWO_FACTOR_REQUIRED_EVENT, onRequired);
  }, []);

  if (!blocked) return null;

  return (
    <main className="fixed inset-0 z-(--z-modal) flex items-center justify-center overflow-y-auto bg-slate-50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-100 bg-white shadow-sm">
        <EmptyState
          icon={<ShieldAlert />}
          title={t('twoFactorGate.title')}
          description={t('twoFactorGate.description')}
          action={
            <Link
              to="/settings/security"
              className={buttonVariants({ className: 'h-11 bg-primary px-5 text-white hover:bg-primary-hover sm:h-10' })}
            >
              {t('twoFactorGate.action')}
            </Link>
          }
        />
      </div>
    </main>
  );
};

export default TwoFactorRequiredGate;
