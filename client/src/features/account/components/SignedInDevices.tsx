import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
      toast.success(`Signed out ${deviceLabel(session.userAgent)}.`);
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'Could not sign out that device. Try again.'));
    } finally {
      setBusyId(null);
      setPending(null);
    }
  };

  const signOutOthers = async () => {
    setBulkBusy(true);
    try {
      const revoked = await revokeOthers();
      toast.success(revoked === 1 ? 'Signed out 1 other device.' : `Signed out ${revoked} other devices.`);
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'Could not sign out your other devices. Try again.'));
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
        title={<span id="signed-in-devices-heading">Signed-in devices</span>}
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
            Sign out all other devices
          </Button>
        }
      />

      {loading ? (
        <SkeletonCards count={2} columns="" />
      ) : error ? (
        <Alert tone="error" title="Could not load devices">
          <p>{error}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void reload()} className="mt-2 h-11 sm:h-8">
            Try again
          </Button>
        </Alert>
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={<Laptop />}
          title="No active devices"
          description="Devices appear here while their sign-in is still valid."
          className="py-10 sm:py-10"
        />
      ) : (
        <SessionList sessions={sessions} busyId={busyId} onSignOut={onSignOut} />
      )}

      <p className="mt-4 text-xs text-slate-600">
        Sessions expire after 1 hour of inactivity of the access token. Changing your password signs out other devices.
      </p>

      <ConfirmActionDialog
        open={pending?.kind === 'others'}
        onOpenChange={(open) => !open && !bulkBusy && setPending(null)}
        title="Sign out all other devices?"
        description="Every device except this one will be signed out and will need to log in again."
        confirmLabel="Sign out other devices"
        busyLabel="Signing out..."
        busy={bulkBusy}
        onConfirm={() => void signOutOthers()}
      />
      <ConfirmActionDialog
        open={pending?.kind === 'current'}
        onOpenChange={(open) => !open && busyId === null && setPending(null)}
        title="Sign out this device?"
        description="This signs this browser out. You will be taken to the login page."
        confirmLabel="Sign out"
        busyLabel="Signing out..."
        busy={busyId !== null}
        onConfirm={() => pending?.kind === 'current' && void signOut(pending.session)}
      />
    </Surface>
  );
};
