import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Laptop } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, EmptyState, SectionHeader, SkeletonCards, Surface, toast } from '@/components/ds';
import ConfirmActionDialog from '@/components/ConfirmActionDialog';
import { getApiErrorMessage } from '@/utils/api';
import { clearSession } from '@/utils/session';
import { useSessions } from '../hooks/useSessions';
import type { AccountSession } from '../types';
import { deviceLabel } from '../lib/userAgent';
import { SessionList } from './SessionList';

type Pending = { kind: 'current'; session: AccountSession } | { kind: 'others' } | null;

/** "Signed-in devices" section of the Security page. */
export const SignedInDevices = () => {
  const { t } = useTranslation('settings');
  const navigate = useNavigate();
  const { sessions, loading, error, reload, revoke, revokeOthers } = useSessions();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [pending, setPending] = useState<Pending>(null);

  const others = sessions.filter((session) => !session.current).length;

  const signOut = async (session: AccountSession) => {
    setBusyId(session._id);
    try {
      await revoke(session._id);
      if (session.current) {
        clearSession();
        navigate('/login');
        return;
      }
      toast.success(t('devices.signedOutDevice', { device: deviceLabel(session.userAgent) }));
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, t('devices.signOutFailed')));
    } finally {
      setBusyId(null);
      setPending(null);
    }
  };

  const signOutOthers = async () => {
    setBulkBusy(true);
    try {
      const revoked = await revokeOthers();
      toast.success(t('devices.signedOutOthers', { count: revoked }));
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, t('devices.signOutOthersFailed')));
    } finally {
      setBulkBusy(false);
      setPending(null);
    }
  };

  const onSignOut = (session: AccountSession) => {
    if (session.current) setPending({ kind: 'current', session });
    else void signOut(session);
  };

  return (
    <Surface padding="lg" aria-labelledby="signed-in-devices-heading">
      <SectionHeader
        title={<span id="signed-in-devices-heading">{t('devices.title')}</span>}
        count={loading || error ? undefined : sessions.length}
        className="flex-wrap"
        action={
          <Button
            type="button"
            variant="outline"
            disabled={loading || others === 0 || bulkBusy}
            onClick={() => setPending({ kind: 'others' })}
            className="h-11 w-full sm:h-9 sm:w-auto"
          >
            {t('devices.signOutOthers')}
          </Button>
        }
      />

      {loading ? (
        <SkeletonCards count={2} columns="" />
      ) : error ? (
        <Alert tone="error" title={t('devices.loadFailed')}>
          <p>{error}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void reload()} className="mt-2 h-11 sm:h-8">
            {t('common:retry')}
          </Button>
        </Alert>
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={<Laptop />}
          title={t('devices.emptyTitle')}
          description={t('devices.emptyDescription')}
          className="py-10 sm:py-10"
        />
      ) : (
        <SessionList sessions={sessions} busyId={busyId} onSignOut={onSignOut} />
      )}

      <p className="mt-4 text-xs text-slate-600">
        {t('devices.footer')}
      </p>

      <ConfirmActionDialog
        open={pending?.kind === 'others'}
        onOpenChange={(open) => !open && !bulkBusy && setPending(null)}
        title={t('devices.confirmOthersTitle')}
        description={t('devices.confirmOthersDescription')}
        confirmLabel={t('devices.confirmOthersConfirm')}
        busyLabel={t('devices.signingOut')}
        busy={bulkBusy}
        onConfirm={() => void signOutOthers()}
      />
      <ConfirmActionDialog
        open={pending?.kind === 'current'}
        onOpenChange={(open) => !open && busyId === null && setPending(null)}
        title={t('devices.confirmCurrentTitle')}
        description={t('devices.confirmCurrentDescription')}
        confirmLabel={t('devices.signOut')}
        busyLabel={t('devices.signingOut')}
        busy={busyId !== null}
        onConfirm={() => pending?.kind === 'current' && void signOut(pending.session)}
      />
    </Surface>
  );
};
