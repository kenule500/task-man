import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { EmptyState } from '@/components/ds';
import { buttonVariants } from '@/components/ui/button';
import { TWO_FACTOR_REQUIRED_EVENT } from '@/utils/twoFactorRequired';

/**
 * Blocking screen for members of a workspace that requires two-factor authentication while their account has none.
 * It appears when any request answers 403 TWO_FACTOR_REQUIRED and covers the workspace until they set it up.
 */
const TwoFactorRequiredGate = () => {
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
          title="Turn on two-factor authentication"
          description="This workspace requires two-factor authentication. It takes about two minutes with an authenticator app, and you can come straight back."
          action={
            <Link
              to="/settings/security"
              className={buttonVariants({ className: 'h-11 bg-primary px-5 text-white hover:bg-primary-hover sm:h-10' })}
            >
              Open Security settings
            </Link>
          }
        />
      </div>
    </main>
  );
};

export default TwoFactorRequiredGate;
