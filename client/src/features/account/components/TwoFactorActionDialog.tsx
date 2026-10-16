import { useState, type FormEvent } from 'react';
import { KeyRound, ShieldOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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

const ICONS = { disable: <ShieldOff />, regenerate: <KeyRound /> } as const;

/** Password plus an authenticator code (or, to turn it off, a recovery code). */
export const TwoFactorActionDialog = ({ action, onClose, onDisabled, onRegenerated }: TwoFactorActionDialogProps) => {
  const { t } = useTranslation('settings');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const recovering = action === 'disable' && useRecovery;
    if (!password) return setError(t('twoFactor.setup.passwordRequired'));
    if (recovering ? !isCompleteRecoveryCode(recoveryCode) : !isCompleteCode(code)) {
      return setError(recovering ? t('twoFactor.action.recoveryRequired') : t('twoFactor.setup.codeRequired'));
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
      setError(getApiErrorMessage(err, t('twoFactor.action.failed')));
      setBusy(false);
    }
  };

  return (
    <FormDialog
      open
      onOpenChange={(open) => !open && !busy && onClose()}
      icon={ICONS[action]}
      title={t(`twoFactor.action.${action}.title`)}
      description={t(`twoFactor.action.${action}.description`)}
      onSubmit={(event) => void submit(event)}
      submitLabel={t(`twoFactor.action.${action}.submit`)}
      submittingLabel={t(`twoFactor.action.${action}.submitting`)}
      submitting={busy}
      error={error}
    >
      <PasswordField
        id={`${action}-password`}
        label={t('twoFactor.setup.passwordLabel')}
        value={password}
        onChange={setPassword}
        autoComplete="current-password"
      />
      {useRecovery ? (
        <Field label={t('twoFactor.action.recoveryLabel')} htmlFor="action-recovery-code" hint={t('twoFactor.action.recoveryHint')}>
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
        <OneTimeCodeField id={`${action}-code`} label={t('twoFactor.setup.codeLabel')} value={code} onChange={setCode} />
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
          {useRecovery ? t('twoFactor.action.useApp') : t('twoFactor.action.useRecovery')}
        </button>
      )}
    </FormDialog>
  );
};
