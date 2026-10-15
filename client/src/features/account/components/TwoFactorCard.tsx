import { useState } from 'react';
import { KeyRound, ShieldCheck, ShieldOff, Smartphone } from 'lucide-react';
import { Alert, SectionHeader, Surface, Tag, toast } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { getStoredUser } from '@/utils/session';
import { useTwoFactorStatus } from '../hooks/useTwoFactorStatus';
import { RecoveryCodesDialog } from './RecoveryCodesDialog';
import { TwoFactorActionDialog, type TwoFactorAction } from './TwoFactorActionDialog';
import { TwoFactorSetupDialog } from './TwoFactorSetupDialog';

const formatDate = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '';

/** "Two-factor authentication" section of the Security page. */
export const TwoFactorCard = () => {
  const { status, error, loading, reload } = useTwoFactorStatus();
  const [setupOpen, setSetupOpen] = useState(false);
  const [action, setAction] = useState<TwoFactorAction | null>(null);
  const [newCodes, setNewCodes] = useState<string[] | null>(null);
  const account = getStoredUser()?.email ?? 'your account';

  return (
    <Surface padding="lg" as="section" aria-labelledby="two-factor-heading">
      <SectionHeader
        title={<span id="two-factor-heading">Two-factor authentication</span>}
        action={
          status && (
            <Tag tone={status.enabled ? 'success' : 'neutral'}>
              {status.enabled ? <ShieldCheck className="size-3.5" aria-hidden /> : <ShieldOff className="size-3.5" aria-hidden />}
              {status.enabled ? 'On' : 'Off'}
            </Tag>
          )
        }
      />
      <p className="mb-4 text-sm text-slate-600">
        Add a second step to sign-in: a 6-digit code from an authenticator app on your phone. A stolen password alone is then not enough.
      </p>

      {loading ? (
        <div className="h-10 w-40 animate-pulse rounded-lg bg-slate-100 motion-reduce:animate-none" aria-hidden />
      ) : error ? (
        <Alert tone="error" title="Could not load this setting">
          <p>{error}</p>
          <Button type="button" variant="outline" size="sm" onClick={reload} className="mt-2 h-11 sm:h-8">
            Try again
          </Button>
        </Alert>
      ) : status?.enabled ? (
        <div className="space-y-4">
          <p className="text-sm text-slate-700">
            Turned on{status.enabledAt ? ` on ${formatDate(status.enabledAt)}` : ''}.{' '}
            <span className={status.recoveryCodesRemaining <= 2 ? 'font-medium text-warning-fg' : undefined}>
              {status.recoveryCodesRemaining} recovery code{status.recoveryCodesRemaining === 1 ? '' : 's'} left.
            </span>
          </p>
          {status.recoveryCodesRemaining <= 2 && (
            <Alert tone="warning">You are running low on recovery codes. Create new ones and store them somewhere safe.</Alert>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={() => setAction('regenerate')} className="h-11 gap-2 sm:h-10">
              <KeyRound aria-hidden /> New recovery codes
            </Button>
            <Button type="button" variant="destructive" onClick={() => setAction('disable')} className="h-11 gap-2 sm:h-10">
              <ShieldOff aria-hidden /> Turn off
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          onClick={() => setSetupOpen(true)}
          className="h-11 gap-2 bg-primary text-white hover:bg-primary-hover sm:h-10"
        >
          <Smartphone aria-hidden /> Set up two-factor authentication
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
            toast.success('Two-factor authentication is off.');
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
