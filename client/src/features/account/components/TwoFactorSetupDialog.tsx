import { useEffect, useState, type FormEvent } from 'react';
import { Check, Copy, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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

type Phase = 'scan' | 'verify' | 'codes' | 'done';
const PHASES: Phase[] = ['scan', 'verify', 'codes', 'done'];
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
  const { t } = useTranslation('settings');
  const steps: StepperStep[] = PHASES.map((id) => ({ id, title: t(`twoFactor.setup.steps.${id}`) }));
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
        if (!cancelled) setLoadError(getApiErrorMessage(err, t('twoFactor.setup.startFailed')));
      });
    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
      setError(!password ? t('twoFactor.setup.passwordRequired') : t('twoFactor.setup.codeRequired'));
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
      setError(getApiErrorMessage(err, t('twoFactor.setup.verifyFailed')));
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
      <DialogHeader className="space-y-1 px-4 pt-5 pe-12 sm:px-6 sm:pt-6">
        <DialogTitle className="text-lg font-bold text-slate-900">{t('twoFactor.setup.title')}</DialogTitle>
        <DialogDescription className="text-sm leading-relaxed text-slate-600">
          {t('twoFactor.setup.description')}
        </DialogDescription>
      </DialogHeader>

      <div className="px-4 sm:px-6">
        <Stepper steps={steps} current={PHASE_INDEX[phase]} size="sm" label={t('twoFactor.setup.progress')} />
      </div>

      <div className="max-h-[60dvh] min-h-0 space-y-4 overflow-y-auto px-4 py-1 sm:px-6">
        {loadError ? (
          <Alert tone="error">{loadError}</Alert>
        ) : !setup ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-600" role="status">
            <Spinner decorative /> {t('twoFactor.setup.preparing')}
          </div>
        ) : phase === 'scan' ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-700">
              {t('twoFactor.setup.scan')}
            </p>
            <div className="flex justify-center">
              <QrCode value={setup.otpauthUrl} label={t('twoFactor.setup.qrLabel', { account })} />
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-medium text-slate-600">{t('twoFactor.setup.setupKey')}</p>
              <div className="mt-1 flex items-center justify-between gap-2">
                <code className="break-all font-mono text-sm font-semibold tracking-wider text-slate-900" data-testid="two-factor-secret">
                  {formatSecret(setup.secret)}
                </code>
                <Button type="button" variant="outline" size="sm" onClick={() => void copySecret()} className="h-10 shrink-0 gap-1.5 sm:h-8">
                  {secretCopied ? <Check aria-hidden /> : <Copy aria-hidden />}
                  {secretCopied ? t('common:copied') : t('common:copy')}
                </Button>
              </div>
              <p role="status" className="sr-only">{secretCopied ? t('twoFactor.setup.keyCopied') : ''}</p>
            </div>
          </div>
        ) : phase === 'verify' ? (
          <form id="two-factor-verify" onSubmit={(event) => void verify(event)} noValidate className="space-y-4">
            {error && <Alert tone="error">{error}</Alert>}
            <OneTimeCodeField
              id="setup-code"
              label={t('twoFactor.setup.codeLabel')}
              value={code}
              onChange={setCode}
              autoFocus
            />
            <PasswordField
              id="setup-password"
              label={t('twoFactor.setup.passwordLabel')}
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
              hint={t('twoFactor.setup.passwordHint')}
            />
          </form>
        ) : phase === 'codes' ? (
          <div className="space-y-4">
            <RecoveryCodesPanel codes={recoveryCodes} account={account} />
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-slate-800">
              <Checkbox checked={saved} onCheckedChange={(checked) => setSaved(checked === true)} />
              {t('twoFactor.setup.saved')}
            </label>
          </div>
        ) : (
          <EmptyState
            icon={<ShieldCheck />}
            title={t('twoFactor.setup.doneTitle')}
            description={t('twoFactor.setup.doneDescription')}
            className="py-6 sm:py-6"
          />
        )}
      </div>

      <DialogFooter className="flex-row justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3 sm:px-6 sm:py-4 [&>button]:flex-1 sm:[&>button]:flex-none">
        {phase === 'scan' && (
          <>
            <Button type="button" variant="outline" onClick={onClose} className="h-11 sm:h-10">{t('common:cancel')}</Button>
            <Button type="button" disabled={!setup} onClick={() => setPhase('verify')} className="h-11 bg-primary text-white hover:bg-primary-hover sm:h-10">
              {t('twoFactor.setup.next')}
            </Button>
          </>
        )}
        {phase === 'verify' && (
          <>
            <Button type="button" variant="outline" disabled={busy} onClick={() => { setError(''); setPhase('scan'); }} className="h-11 sm:h-10">
              {t('twoFactor.setup.back')}
            </Button>
            <Button type="submit" form="two-factor-verify" disabled={busy} className="h-11 bg-primary text-white hover:bg-primary-hover sm:h-10">
              {busy ? <><Spinner decorative /> {t('twoFactor.setup.verifying')}</> : t('twoFactor.setup.turnOn')}
            </Button>
          </>
        )}
        {phase === 'codes' && (
          <Button type="button" disabled={!saved} onClick={finishCodes} className="h-11 bg-primary text-white hover:bg-primary-hover sm:h-10">
            {t('twoFactor.setup.continue')}
          </Button>
        )}
        {phase === 'done' && (
          <Button type="button" onClick={onClose} className="h-11 bg-primary text-white hover:bg-primary-hover sm:h-10">
            {t('twoFactor.setup.done')}
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
