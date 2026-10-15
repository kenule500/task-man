import { useState, type FormEvent } from 'react';
import { ArrowRight, ShieldCheck } from 'lucide-react';
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
        title="Enter the 6-digit code"
        description={
          useRecovery
            ? 'Enter one of the recovery codes you saved when you turned on two-factor authentication.'
            : <>Open your authenticator app and enter the code{email ? <> for <span className="font-semibold text-slate-800">{email}</span></> : null}.</>
        }
      />

      {error && <Alert tone="error" className="mb-6">{error}</Alert>}

      <form onSubmit={submit} noValidate className="space-y-5">
        {useRecovery ? (
          <Field
            label="Recovery code"
            htmlFor="recovery-code"
            error={invalid ? 'Enter the 8-character code, like abcd-efgh.' : undefined}
            hint="Each recovery code works once."
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
            label="Authentication code"
            value={code}
            onChange={setCode}
            error={invalid ? 'Enter the 6-digit code.' : undefined}
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
              <Spinner decorative /> Verifying...
            </>
          ) : (
            <>
              Verify and sign in <ArrowRight className="size-4" aria-hidden />
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
          {useRecovery ? 'Use my authenticator app instead' : 'Use a recovery code instead'}
        </button>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-10 items-center px-2 text-slate-600 hover:underline focus-visible:outline-2 focus-visible:outline-primary"
        >
          Back to sign in
        </button>
      </div>
    </>
  );
};
