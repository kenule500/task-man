import { useState, type FormEvent } from 'react';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
import { Alert, Field, fieldMessageId, Spinner } from '@/components/ds';
import { AuthStatusHeader } from '@/components/auth/AuthPageShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { OneTimeCodeField } from '@/components/auth/OneTimeCodeField';
import {
  isCompleteCode, isCompleteRecoveryCode, normalizeRecoveryInput,
} from '@/features/account/lib/twoFactor';

export interface SecondFactorInput {
  code?: string;
  recoveryCode?: string;
}

interface TwoFactorStepProps {
  email: string;
  loading: boolean;
  error: string;
  onSubmit: (input: SecondFactorInput) => void;
  onBack: () => void;
}

/** Second step of sign-in: the 6-digit authenticator code, or a recovery code instead. */
export const TwoFactorStep = ({ email, loading, error, onSubmit, onBack }: TwoFactorStepProps) => {
  const { t } = useTranslation('auth');
  const [useRecovery, setUseRecovery] = useState(false);
  const [code, setCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [touched, setTouched] = useState(false);

  const complete = useRecovery ? isCompleteRecoveryCode(recoveryCode) : isCompleteCode(code);
  const invalid = touched && !complete;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (!complete) return;
    onSubmit(useRecovery ? { recoveryCode } : { code });
  };

  const switchMode = () => {
    setUseRecovery((current) => !current);
    setTouched(false);
  };

  return (
    <>
      <AuthStatusHeader
        icon={<ShieldCheck />}
        title={t('twoFactor.title')}
        description={
          useRecovery
            ? t('twoFactor.recoveryDescription')
            : email
              ? <Trans t={t} i18nKey="twoFactor.appDescriptionFor" values={{ email }} components={{ e: <span className="font-semibold text-slate-800" /> }} />
              : t('twoFactor.appDescription')
        }
      />

      {error && <Alert tone="error" className="mb-6">{error}</Alert>}

      <form onSubmit={submit} noValidate className="space-y-5">
        {useRecovery ? (
          <Field
            label={t('twoFactor.recoveryLabel')}
            htmlFor="recovery-code"
            error={invalid ? t('twoFactor.recoveryError') : undefined}
            hint={t('twoFactor.recoveryHint')}
          >
            <Input
              id="recovery-code"
              name="recovery-code"
              type="text"
              autoComplete="off"
              autoCapitalize="none"
              autoFocus
              spellCheck={false}
              placeholder="abcd-efgh"
              value={recoveryCode}
              onChange={(event) => setRecoveryCode(normalizeRecoveryInput(event.target.value))}
              aria-invalid={invalid}
              aria-describedby={fieldMessageId('recovery-code')}
              className="h-12 rounded-xl border-slate-300 bg-white text-center font-mono text-lg tracking-widest text-slate-900 shadow-sm placeholder:tracking-normal placeholder:text-slate-500 md:text-lg"
            />
          </Field>
        ) : (
          <OneTimeCodeField
            id="two-factor-code"
            label={t('twoFactor.codeLabel')}
            value={code}
            onChange={setCode}
            error={invalid ? t('twoFactor.codeError') : undefined}
            autoFocus
          />
        )}

        <Button
          type="submit"
          disabled={loading}
          className="h-12 w-full rounded-xl bg-primary text-base font-semibold text-white shadow-lg shadow-primary/25 hover:bg-primary-hover"
        >
          {loading ? (
            <>
              <Spinner decorative /> {t('twoFactor.verifying')}
            </>
          ) : (
            <>
              {t('twoFactor.verify')} <ArrowRight className="size-4 rtl:-scale-x-100" aria-hidden />
            </>
          )}
        </Button>
      </form>

      <div className="mt-6 flex flex-col items-center gap-1 text-sm">
        <button
          type="button"
          onClick={switchMode}
          className="inline-flex min-h-10 items-center px-2 font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary"
        >
          {useRecovery ? t('twoFactor.useApp') : t('twoFactor.useRecovery')}
        </button>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-10 items-center px-2 text-slate-600 hover:underline focus-visible:outline-2 focus-visible:outline-primary"
        >
          {t('twoFactor.back')}
        </button>
      </div>
    </>
  );
};
