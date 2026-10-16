import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import api from '../utils/api';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, Field, fieldMessageId, Spinner } from '@/components/ds';
import { AuthPageShell, AuthStatusHeader } from '@/components/auth/AuthPageShell';
import { useFormValidation } from '@/components/auth/useFormValidation';
import { validateEmail } from '@/components/auth/validation';
import { ArrowLeft, Mail } from 'lucide-react';

const validators = { email: (value: string) => validateEmail(value) };

const ForgotPasswordPage = () => {
  const { t } = useTranslation('auth');
  const [values, setValues] = useState({ email: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const { errorFor, touch, validateAll } = useFormValidation(values, validators);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!validateAll()) return;
    setLoading(true);

    try {
      await api.post('/auth/forgot-password', { email: values.email.trim() });
      setSent(true);
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { message?: string; errors?: { msg: string }[] } } };
      setError(
        axiosError.response?.data?.message ||
          axiosError.response?.data?.errors?.[0]?.msg ||
          t('forgot.error'),
      );
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <AuthPageShell>
        <AuthStatusHeader
          icon={<Mail />}
          title={t('forgot.sentTitle')}
          description={<Trans t={t} i18nKey="forgot.sentDescription" values={{ email: values.email.trim() }} components={{ e: <span className="font-semibold text-slate-800" /> }} />}
        />
        <Link to="/login" className={buttonVariants({ variant: 'outline', className: 'h-11 w-full rounded-xl' })}>
          {t('form.backToSignIn')}
        </Link>
      </AuthPageShell>
    );
  }

  return (
    <AuthPageShell>
      <Link
        to="/login"
        className="mb-6 inline-flex min-h-10 items-center gap-2 text-sm text-slate-600 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-primary"
      >
        <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden /> {t('form.backToSignIn')}
      </Link>

      <AuthStatusHeader icon={<Mail />} title={t('forgot.title')} description={t('forgot.description')} />

      {error && <Alert tone="error" className="mb-6">{error}</Alert>}

      <form onSubmit={handleSubmit} noValidate className="space-y-5">
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
            value={values.email}
            onChange={(e) => setValues({ email: e.target.value })}
            onBlur={() => touch('email')}
            aria-invalid={!!errorFor('email')}
            aria-describedby={errorFor('email') ? fieldMessageId('email') : undefined}
            placeholder={t('form.emailPlaceholder')}
            className="h-12 rounded-xl border-slate-300 bg-white text-base shadow-sm placeholder:text-slate-500 md:text-base"
          />
        </Field>

        <Button type="submit" disabled={loading} className="h-12 w-full rounded-xl bg-primary text-base text-white hover:bg-primary-hover">
          {loading ? (
            <>
              <Spinner decorative /> {t('forgot.sending')}
            </>
          ) : (
            t('forgot.submit')
          )}
        </Button>
      </form>
    </AuthPageShell>
  );
};

export default ForgotPasswordPage;
