import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../utils/api';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, Field, fieldMessageId, Spinner } from '@/components/ds';
import { AuthPageShell, AuthStatusHeader } from '@/components/auth/AuthPageShell';
import { useFormValidation } from '@/components/auth/useFormValidation';
import { validateEmail } from '@/components/auth/validation';
import { CheckCircle2, XCircle, Loader2, ArrowRight, RefreshCw } from 'lucide-react';

const validators = { email: (value: string) => validateEmail(value) };

const VerifyEmailPage = () => {
  const { t } = useTranslation('auth');
  const { token } = useParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [resend, setResend] = useState({ email: '' });
  const [resendStatus, setResendStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [resendError, setResendError] = useState('');
  const { errorFor, touch, validateAll } = useFormValidation(resend, validators);
  // The token is single use: never send the request twice (React StrictMode re-runs effects)
  const requestedToken = useRef<string | null>(null);

  // Auto-verify on page load
  useEffect(() => {
    if (requestedToken.current === token) return;
    requestedToken.current = token ?? null;

    const verify = async () => {
      try {
        const response = await api.get(`/auth/verify-email/${token}`);
        setStatus('success');
        setMessage(response.data.message);
      } catch (error: unknown) {
        const axiosError = error as { response?: { data?: { message?: string } } };
        setStatus('error');
        setMessage(axiosError.response?.data?.message || t('verify.failed'));
      }
    };
    verify();
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle resend request
  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    setResendError('');
    if (!validateAll()) return;
    setResendStatus('sending');
    try {
      await api.post('/auth/resend-verification', { email: resend.email.trim() });
      setResendStatus('sent');
    } catch {
      setResendStatus('idle');
      setResendError(t('verify.resendError'));
    }
  };

  return (
    <AuthPageShell>
      <div aria-live="polite">
        {/* LOADING */}
        {status === 'loading' && (
          <AuthStatusHeader icon={<Loader2 />} spin title={t('verify.loadingTitle')} description={t('verify.loadingDescription')} />
        )}

        {/* SUCCESS */}
        {status === 'success' && (
          <>
            <AuthStatusHeader icon={<CheckCircle2 />} tone="success" title={t('verify.successTitle')} description={message} />
            <Link to="/login" className={buttonVariants({ className: 'h-11 w-full gap-2 rounded-xl bg-primary text-white hover:bg-primary-hover' })}>
              {t('verify.continue')} <ArrowRight className="size-4 rtl:-scale-x-100" aria-hidden />
            </Link>
          </>
        )}

        {/* ERROR */}
        {status === 'error' && (
          <>
            <AuthStatusHeader icon={<XCircle />} tone="danger" title={t('verify.errorTitle')} description={message} />

            {resendStatus === 'sent' ? (
              <Alert tone="success" className="mb-6">{t('verify.resent')}</Alert>
            ) : (
              <form onSubmit={handleResend} noValidate className="mb-6 space-y-4">
                <p className="text-sm font-semibold text-slate-800">{t('reset.requestNew')}</p>
                {resendError && <Alert tone="error">{resendError}</Alert>}
                <Field label={t('form.email')} htmlFor="email" required error={errorFor('email')}>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    required
                    inputMode="email"
                    autoComplete="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    placeholder={t('form.emailPlaceholder')}
                    value={resend.email}
                    onChange={(e) => setResend({ email: e.target.value })}
                    onBlur={() => touch('email')}
                    aria-invalid={!!errorFor('email')}
                    aria-describedby={errorFor('email') ? fieldMessageId('email') : undefined}
                    className="h-12 rounded-xl border-slate-300 bg-white text-base shadow-sm placeholder:text-slate-500 md:text-base"
                  />
                </Field>
                <Button type="submit" variant="outline" disabled={resendStatus === 'sending'} className="h-11 w-full gap-2 rounded-xl">
                  {resendStatus === 'sending' ? (
                    <>
                      <Spinner decorative /> {t('forgot.sending')}
                    </>
                  ) : (
                    <>
                      <RefreshCw className="size-4" aria-hidden /> {t('verify.resend')}
                    </>
                  )}
                </Button>
              </form>
            )}

            <Link to="/login" className={buttonVariants({ variant: 'ghost', className: 'h-11 w-full rounded-xl text-slate-700' })}>
              {t('form.backToSignIn')}
            </Link>
          </>
        )}
      </div>
    </AuthPageShell>
  );
};

export default VerifyEmailPage;
