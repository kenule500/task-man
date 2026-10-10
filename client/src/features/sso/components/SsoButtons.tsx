import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ssoStartUrl } from '../api';
import { markSsoPending } from '../lib';
import { useSsoProviders } from '../hooks/useSsoProviders';
import { ProviderIcon } from './ProviderIcon';

/**
 * "Continue with Google / Microsoft" for the sign-in and sign-up forms, with an "or" divider.
 * Renders nothing unless the server has at least one provider configured.
 */
export const SsoButtons = ({ redirect }: { redirect?: string }) => {
  const providers = useSsoProviders();
  if (providers.length === 0) return null;

  return (
    <div className="mt-6" data-testid="sso-buttons">
      <div className="mb-5 flex items-center" role="separator" aria-label="or">
        <span aria-hidden className="h-px flex-1 bg-slate-200" />
        <span aria-hidden className="px-3 text-xs font-medium uppercase tracking-wide text-slate-500">or</span>
        <span aria-hidden className="h-px flex-1 bg-slate-200" />
      </div>
      <div className="space-y-3">
        {providers.map((provider) => (
          <a
            key={provider.id}
            href={ssoStartUrl(provider.id, redirect)}
            onClick={() => markSsoPending(provider.id)}
            className={cn(
              buttonVariants({ variant: 'outline' }),
              'h-12 w-full gap-2.5 rounded-xl border-slate-300 bg-white text-base font-semibold text-slate-800 shadow-sm hover:bg-slate-50',
            )}
          >
            <ProviderIcon provider={provider.id} />
            Continue with {provider.label}
          </a>
        ))}
      </div>
    </div>
  );
};
