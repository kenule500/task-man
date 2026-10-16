import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyRound, ShieldCheck, ShieldOff, Smartphone } from 'lucide-react';
import { Alert, SectionHeader, Surface, Tag, toast } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { getStoredUser } from '@/utils/session';
import { useTwoFactorStatus } from '../hooks/useTwoFactorStatus';
import { RecoveryCodesDialog } from './RecoveryCodesDialog';
import { TwoFactorActionDialog, type TwoFactorAction } from './TwoFactorActionDialog';
import { TwoFactorSetupDialog } from './TwoFactorSetupDialog';
import { currentLocale } from '@/i18n/format';

const formatDate = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString(currentLocale(), { year: 'numeric', month: 'short', day: 'numeric' }) : '';

/** "Two-factor authentication" section of the Security page. */
export const TwoFactorCard = () => {
  const { t } = useTranslation('settings');
  const { status, error, loading, reload } = useTwoFactorStatus();
  const [setupOpen, setSetupOpen] = useState(false);
  const [action, setAction] = useState<TwoFactorAction | null>(null);
  const [newCodes, setNewCodes] = useState<string[] | null>(null);
  const account = getStoredUser()?.email ?? t('twoFactor.yourAccount');

  return (
    <Surface padding="lg" as="section" aria-labelledby="two-factor-heading">
      <SectionHeader
        title={<span id="two-factor-heading">{t('twoFactor.title')}</span>}
        action={
          status && (
            <Tag tone={status.enabled ? 'success' : 'neutral'}>
              {status.enabled ? <ShieldCheck className="size-3.5" aria-hidden /> : <ShieldOff className="size-3.5" aria-hidden />}
              {status.enabled ? t('twoFactor.on') : t('twoFactor.off')}
            </Tag>
          )
        }
      />
      <p className="mb-4 text-sm text-slate-600">
        {t('twoFactor.description')}
      </p>

      {loading ? (
        <div className="h-10 w-40 animate-pulse rounded-lg bg-slate-100 motion-reduce:animate-none" aria-hidden />
      ) : error ? (
        <Alert tone="error" title={t('twoFactor.loadFailed')}>
          <p>{error}</p>
          <Button type="button" variant="outline" size="sm" onClick={reload} className="mt-2 h-11 sm:h-8">
            {t('common:retry')}
          </Button>
        </Alert>
      ) : status?.enabled ? (
        <div className="space-y-4">
          <p className="text-sm text-slate-700">
            {status.enabledAt ? t('twoFactor.turnedOnDate', { date: formatDate(status.enabledAt) }) : t('twoFactor.turnedOn')}{' '}
            <span className={status.recoveryCodesRemaining <= 2 ? 'font-medium text-warning-fg' : undefined}>
              {t('twoFactor.codesLeft', { count: status.recoveryCodesRemaining })}
            </span>
          </p>
          {status.recoveryCodesRemaining <= 2 && (
            <Alert tone="warning">{t('twoFactor.lowCodes')}</Alert>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={() => setAction('regenerate')} className="h-11 gap-2 sm:h-10">
              <KeyRound aria-hidden /> {t('twoFactor.newCodes')}
            </Button>
            <Button type="button" variant="destructive" onClick={() => setAction('disable')} className="h-11 gap-2 sm:h-10">
              <ShieldOff aria-hidden /> {t('twoFactor.turnOff')}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          onClick={() => setSetupOpen(true)}
          className="h-11 gap-2 bg-primary text-white hover:bg-primary-hover sm:h-10"
        >
          <Smartphone aria-hidden /> {t('twoFactor.setUp')}
        </Button>
      )}

      {setupOpen && (
        <TwoFactorSetupDialog
          open
          onOpenChange={setSetupOpen}
          account={account}
          onEnabled={reload}
        />
      )}
      {action && (
        <TwoFactorActionDialog
          key={action}
          action={action}
          onClose={() => setAction(null)}
          onDisabled={() => {
            setAction(null);
            reload();
            toast.success(t('twoFactor.isOff'));
          }}
          onRegenerated={(codes) => {
            setAction(null);
            setNewCodes(codes);
            reload();
          }}
        />
      )}
      {newCodes && <RecoveryCodesDialog codes={newCodes} account={account} onClose={() => setNewCodes(null)} />}
    </Surface>
  );
};
