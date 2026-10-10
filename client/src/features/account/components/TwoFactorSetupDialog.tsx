import { useEffect, useState, type FormEvent } from 'react';
import { Check, Copy, ShieldCheck } from 'lucide-react';
import { Alert, EmptyState, Stepper, Spinner, type StepperStep } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import PasswordField from '@/components/auth/PasswordField';
import { OneTimeCodeField } from '@/components/auth/OneTimeCodeField';
import { getApiErrorMessage } from '@/utils/api';
import { twoFactorApi } from '../api';
import { formatSecret, isCompleteCode } from '../lib/twoFactor';
import type { TwoFactorSetup } from '../types';
import { QrCode } from './QrCode';
import { RecoveryCodesPanel } from './RecoveryCodesPanel';

const STEPS: StepperStep[] = [
  { id: 'scan', title: 'Scan' },
  { id: 'verify', title: 'Verify' },
  { id: 'codes', title: 'Save codes' },
  { id: 'done', title: 'Done' },
];

type Phase = 'scan' | 'verify' | 'codes' | 'done';
const PHASE_INDEX: Record<Phase, number> = { scan: 0, verify: 1, codes: 2, done: 3 };

interface SetupFlowProps {
  account: string;
  onEnabled: () => void;
  onClose: () => void;
  /** The recovery-codes step cannot be dismissed until the codes are saved */
  onLockChange: (locked: boolean) => void;
}

/** Mounted only while the dialog is open, so every opening starts a fresh setup (new pending secret). */
const SetupFlow = ({ account, onEnabled, onClose, onLockChange }: SetupFlowProps) => {
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [loadError, setLoadError] = useState('');
  const [phase, setPhase] = useState<Phase>('scan');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [secretCopied, setSecretCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    twoFactorApi.setup()
      .then((result) => {
        if (!cancelled) setSetup(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(getApiErrorMessage(err, 'We could not start the setup. Try again.'));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const copySecret = async () => {
    if (!setup) return;
    try {
      await navigator.clipboard.writeText(setup.secret);
      setSecretCopied(true);
      window.setTimeout(() => setSecretCopied(false), 2500);
    } catch {
      setSecretCopied(false);
    }
  };

  const verify = async (event: FormEvent) => {
    event.preventDefault();
    if (!password || !isCompleteCode(code)) {
      setError(!password ? 'Enter your password.' : 'Enter the 6-digit code from your app.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const codes = await twoFactorApi.enable({ code, password });
      setRecoveryCodes(codes);
      onLockChange(true);
      setPhase('codes');
      onEnabled();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'We could not verify that code. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  const finishCodes = () => {
    onLockChange(false);
    setPhase('done');
  };

  return (
    <>
      <DialogHeader className="space-y-1 px-4 pt-5 pr-12 sm:px-6 sm:pt-6">
        <DialogTitle className="text-lg font-bold text-slate-900">Turn on two-factor authentication</DialogTitle>
        <DialogDescription className="text-sm leading-relaxed text-slate-600">
          Sign-in will ask for a code from an authenticator app such as Google Authenticator, 1Password or Authy.
        </DialogDescription>
      </DialogHeader>

      <div className="px-4 sm:px-6">
        <Stepper steps={STEPS} current={PHASE_INDEX[phase]} size="sm" label="Two-factor setup progress" />
      </div>

      <div className="max-h-[60dvh] min-h-0 space-y-4 overflow-y-auto px-4 py-1 sm:px-6">
        {loadError ? (
          <Alert tone="error">{loadError}</Alert>
        ) : !setup ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-600" role="status">
            <Spinner decorative /> Preparing your key...
          </div>
        ) : phase === 'scan' ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-700">
              Scan this QR code with your authenticator app. On the same phone? Use the key below instead.
            </p>
            <div className="flex justify-center">
              <QrCode value={setup.otpauthUrl} label={`QR code for TaskMan, account ${account}`} />
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-medium text-slate-600">Setup key (enter it manually)</p>
              <div className="mt-1 flex items-center justify-between gap-2">
                <code className="break-all font-mono text-sm font-semibold tracking-wider text-slate-900" data-testid="two-factor-secret">
                  {formatSecret(setup.secret)}
                </code>
                <Button type="button" variant="outline" size="sm" onClick={() => void copySecret()} className="h-10 shrink-0 gap-1.5 sm:h-8">
                  {secretCopied ? <Check aria-hidden /> : <Copy aria-hidden />}
                  {secretCopied ? 'Copied' : 'Copy'}
                </Button>
              </div>
              <p role="status" className="sr-only">{secretCopied ? 'Setup key copied to clipboard' : ''}</p>
            </div>
          </div>
        ) : phase === 'verify' ? (
          <form id="two-factor-verify" onSubmit={(event) => void verify(event)} noValidate className="space-y-4">
            {error && <Alert tone="error">{error}</Alert>}
            <OneTimeCodeField
              id="setup-code"
              label="6-digit code from your app"
              value={code}
              onChange={setCode}
              autoFocus
            />
            <PasswordField
              id="setup-password"
              label="Your password"
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
              hint="We ask again to be sure it is you."
            />
          </form>
        ) : phase === 'codes' ? (
          <div className="space-y-4">
            <RecoveryCodesPanel codes={recoveryCodes} account={account} />
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-slate-800">
              <Checkbox checked={saved} onCheckedChange={(checked) => setSaved(checked === true)} />
              I have saved these recovery codes
            </label>
          </div>
        ) : (
          <EmptyState
            icon={<ShieldCheck />}
            title="Two-factor authentication is on"
            description="Next time you sign in, TaskMan asks for a code from your app. Your recovery codes work if you lose your phone."
            className="py-6 sm:py-6"
          />
        )}
      </div>

      <DialogFooter className="flex-row justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3 sm:px-6 sm:py-4 [&>button]:flex-1 sm:[&>button]:flex-none">
        {phase === 'scan' && (
          <>
            <Button type="button" variant="outline" onClick={onClose} className="h-11 sm:h-10">Cancel</Button>
            <Button type="button" disabled={!setup} onClick={() => setPhase('verify')} className="h-11 bg-primary text-white hover:bg-primary-hover sm:h-10">
              Next
            </Button>
          </>
        )}
        {phase === 'verify' && (
          <>
            <Button type="button" variant="outline" disabled={busy} onClick={() => { setError(''); setPhase('scan'); }} className="h-11 sm:h-10">
              Back
            </Button>
            <Button type="submit" form="two-factor-verify" disabled={busy} className="h-11 bg-primary text-white hover:bg-primary-hover sm:h-10">
              {busy ? <><Spinner decorative /> Verifying...</> : 'Turn on'}
            </Button>
          </>
        )}
        {phase === 'codes' && (
          <Button type="button" disabled={!saved} onClick={finishCodes} className="h-11 bg-primary text-white hover:bg-primary-hover sm:h-10">
            Continue
          </Button>
        )}
        {phase === 'done' && (
          <Button type="button" onClick={onClose} className="h-11 bg-primary text-white hover:bg-primary-hover sm:h-10">
            Done
          </Button>
        )}
      </DialogFooter>
    </>
  );
};

interface TwoFactorSetupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: string;
  onEnabled: () => void;
}

/** Enable flow: scan the QR code, enter a code, save the recovery codes, done. */
export const TwoFactorSetupDialog = ({ open, onOpenChange, account, onEnabled }: TwoFactorSetupDialogProps) => {
  const [locked, setLocked] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(next) => { if (next || !locked) onOpenChange(next); }}>
      <DialogContent
        showCloseButton={!locked}
        className="flex max-h-[100dvh] w-full max-w-full flex-col gap-4 overflow-hidden rounded-none border border-slate-200 bg-white p-0 shadow-2xl sm:max-h-[90dvh] sm:max-w-[520px] sm:rounded-xl"
      >
        <SetupFlow
          account={account}
          onEnabled={onEnabled}
          onClose={() => onOpenChange(false)}
          onLockChange={setLocked}
        />
      </DialogContent>
    </Dialog>
  );
};
