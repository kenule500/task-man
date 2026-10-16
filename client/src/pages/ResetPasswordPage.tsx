import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../utils/api';
import { Button, buttonVariants } from '@/components/ui/button';
import { Alert, Spinner } from '@/components/ds';
import { AuthPageShell, AuthStatusHeader } from '@/components/auth/AuthPageShell';
import PasswordField from '@/components/auth/PasswordField';
import { useFormValidation } from '@/components/auth/useFormValidation';
import { validateConfirmPassword, validateNewPassword } from '@/components/auth/validation';
import { Lock, CheckCircle2, ArrowRight } from 'lucide-react';

const validators = {
  password: (value: string) => validateNewPassword(value),
  confirmPassword: (value: string, all: { password: string; confirmPassword: string }) =>
    validateConfirmPassword(value, all.password),
};

const ResetPasswordPage = () => {
  const { t } = useTranslation('auth');
  const { token } = useParams();
  const navigate = useNavigate();
  const [values, setValues] = useState({ password: '', confirmPassword: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const { errorFor, touch, validateAll } = useFormValidation(values, validators);

  // Send the user on to sign in after a short pause (cleared if they leave first)
  useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(() => navigate('/login'), 3000);
    return () => window.clearTimeout(timer);
  }, [success, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!validateAll()) return;
    setLoading(true);

    try {
      await api.post(`/auth/reset-password/${token}`, { password: values.password });
      setSuccess(true);
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { message?: string; errors?: { msg: string }[] } } };
      setError(
        axiosError.response?.data?.message ||
          axiosError.response?.data?.errors?.[0]?.msg ||
          t('reset.error'),
      );
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <AuthPageShell>
        <AuthStatusHeader
          icon={<CheckCircle2 />}
          tone="success"
          title={t('reset.successTitle')}
          description={t('reset.successDescription')}
        />
        <Link to="/login" className={buttonVariants({ className: 'h-11 w-full gap-2 rounded-xl bg-primary text-white hover:bg-primary-hover' })}>
          {t('reset.goToSignIn')} <ArrowRight className="size-4 rtl:-scale-x-100" aria-hidden />
        </Link>
      </AuthPageShell>
    );
  }

  return (
    <AuthPageShell>
      <AuthStatusHeader icon={<Lock />} title={t('reset.title')} description={t('reset.description')} />

      {error && (
        <Alert tone="error" className="mb-6">
          {error}{' '}
          <Link to="/forgot-password" className="font-semibold underline">{t('reset.requestNew')}</Link>
        </Alert>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <PasswordField
          id="password"
          label={t('reset.newPassword')}
          value={values.password}
          onChange={(password) => setValues((current) => ({ ...current, password }))}
          onBlur={() => touch('password')}
          error={errorFor('password')}
          autoComplete="new-password"
          showStrength
        />
        <PasswordField
          id="confirmPassword"
          label={t('reset.confirmPassword')}
          value={values.confirmPassword}
          onChange={(confirmPassword) => setValues((current) => ({ ...current, confirmPassword }))}
          onBlur={() => touch('confirmPassword')}
          error={errorFor('confirmPassword')}
          autoComplete="new-password"
          hint={t('reset.confirmHint')}
        />

        <Button type="submit" disabled={loading} className="h-12 w-full rounded-xl bg-primary text-base text-white hover:bg-primary-hover">
          {loading ? (
            <>
              <Spinner decorative /> {t('reset.updating')}
            </>
          ) : (
            t('reset.submit')
          )}
        </Button>
      </form>
    </AuthPageShell>
  );
};

export default ResetPasswordPage;
