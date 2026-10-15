import { useState, type FormEvent } from 'react';
import { KeyRound, ShieldOff } from 'lucide-react';
import FormDialog from '@/components/FormDialog';
import { Field, fieldMessageId } from '@/components/ds';
import { Input } from '@/components/ui/input';
import PasswordField from '@/components/auth/PasswordField';
import { OneTimeCodeField } from '@/components/auth/OneTimeCodeField';
import { getApiErrorMessage } from '@/utils/api';
import { twoFactorApi } from '../api';
import { isCompleteCode, isCompleteRecoveryCode, normalizeRecoveryInput } from '../lib/twoFactor';

export type TwoFactorAction = 'disable' | 'regenerate';

interface TwoFactorActionDialogProps {
  action: TwoFactorAction;
  onClose: () => void;
  /** Called after turning two-factor off */
  onDisabled: () => void;
  /** Called with the new recovery codes */
  onRegenerated: (codes: string[]) => void;
}

const COPY = {
  disable: {
    icon: <ShieldOff />,
    title: 'Turn off two-factor authentication',
    description: 'Confirm with your password and a code. Your account will be protected by your password alone.',
    submit: 'Turn off',
    submitting: 'Turning off...',
  },
  regenerate: {
    icon: <KeyRound />,
    title: 'Get new recovery codes',
    description: 'Your old recovery codes stop working. Confirm with your password and a code from your app.',
    submit: 'Create new codes',
    submitting: 'Creating...',
  },
} as const;

/** Password plus an authenticator code (or, to turn it off, a recovery code). */
export const TwoFactorActionDialog = ({ action, onClose, onDisabled, onRegenerated }: TwoFactorActionDialogProps) => {
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const copy = COPY[action];

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const recovering = action === 'disable' && useRecovery;
    if (!password) return setError('Enter your password.');
    if (recovering ? !isCompleteRecoveryCode(recoveryCode) : !isCompleteCode(code)) {
      return setError(recovering ? 'Enter the 8-character recovery code, like abcd-efgh.' : 'Enter the 6-digit code from your app.');
    }
    setBusy(true);
    setError('');
    try {
      if (action === 'disable') {
        await twoFactorApi.disable(recovering ? { password, recoveryCode } : { password, code });
        onDisabled();
      } else {
        onRegenerated(await twoFactorApi.regenerateRecoveryCodes({ password, code }));
      }
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'That did not work. Check your password and code, then try again.'));
      setBusy(false);
    }
  };

  return (
    <FormDialog
      open
      onOpenChange={(open) => !open && !busy && onClose()}
      icon={copy.icon}
      title={copy.title}
      description={copy.description}
      onSubmit={(event) => void submit(event)}
      submitLabel={copy.submit}
      submittingLabel={copy.submitting}
      submitting={busy}
      error={error}
    >
      <PasswordField
        id={`${action}-password`}
        label="Your password"
        value={password}
        onChange={setPassword}
        autoComplete="current-password"
      />
      {useRecovery ? (
        <Field label="Recovery code" htmlFor="action-recovery-code" hint="Each recovery code works once.">
          <Input
            id="action-recovery-code"
            type="text"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="abcd-efgh"
            value={recoveryCode}
            onChange={(event) => setRecoveryCode(normalizeRecoveryInput(event.target.value))}
            aria-describedby={fieldMessageId('action-recovery-code')}
            className="h-12 rounded-xl border-slate-300 bg-white text-center font-mono text-lg tracking-widest md:text-lg"
          />
        </Field>
      ) : (
        <OneTimeCodeField id={`${action}-code`} label="6-digit code from your app" value={code} onChange={setCode} />
      )}
      {action === 'disable' && (
        <button
          type="button"
          onClick={() => {
            setUseRecovery((current) => !current);
            setError('');
          }}
          className="inline-flex min-h-10 items-center text-sm font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary"
        >
          {useRecovery ? 'Use my authenticator app instead' : 'Use a recovery code instead'}
        </button>
      )}
    </FormDialog>
  );
};
