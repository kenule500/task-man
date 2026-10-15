import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
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
          'We could not reset your password. The link may have expired.',
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
          title="Password updated"
          description="You can now sign in with your new password. Taking you to sign in..."
        />
        <Link to="/login" className={buttonVariants({ className: 'h-11 w-full gap-2 rounded-xl bg-primary text-white hover:bg-primary-hover' })}>
          Go to sign in <ArrowRight className="size-4" aria-hidden />
        </Link>
      </AuthPageShell>
    );
  }

  return (
    <AuthPageShell>
      <AuthStatusHeader icon={<Lock />} title="Set a new password" description="Choose a password you have not used before." />

      {error && (
        <Alert tone="error" className="mb-6">
          {error}{' '}
          <Link to="/forgot-password" className="font-semibold underline">Request a new link</Link>
        </Alert>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <PasswordField
          id="password"
          label="New password"
          value={values.password}
          onChange={(password) => setValues((current) => ({ ...current, password }))}
          onBlur={() => touch('password')}
          error={errorFor('password')}
          autoComplete="new-password"
          showStrength
        />
        <PasswordField
          id="confirmPassword"
          label="Confirm new password"
          value={values.confirmPassword}
          onChange={(confirmPassword) => setValues((current) => ({ ...current, confirmPassword }))}
          onBlur={() => touch('confirmPassword')}
          error={errorFor('confirmPassword')}
          autoComplete="new-password"
          hint="Type it again to make sure it matches."
        />

        <Button type="submit" disabled={loading} className="h-12 w-full rounded-xl bg-primary text-base text-white hover:bg-primary-hover">
          {loading ? (
            <>
              <Spinner decorative /> Updating...
            </>
          ) : (
            'Update password'
          )}
        </Button>
      </form>
    </AuthPageShell>
  );
};

export default ResetPasswordPage;
