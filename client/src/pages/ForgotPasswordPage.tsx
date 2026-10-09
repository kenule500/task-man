import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, Field, fieldMessageId } from '@/components/ds';
import { AuthPageShell, AuthStatusHeader } from '@/components/auth/AuthPageShell';
import { useFormValidation } from '@/components/auth/useFormValidation';
import { validateEmail } from '@/components/auth/validation';
import { ArrowLeft, Loader2, Mail } from 'lucide-react';

const validators = { email: (value: string) => validateEmail(value) };

const ForgotPasswordPage = () => {
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
          'We could not send the link. Check your connection and try again.',
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
          title="Check your inbox"
          description={
            <>
              If an account exists for <span className="font-semibold text-slate-800">{values.email.trim()}</span>, we
              sent a password reset link. Check your spam folder too.
            </>
          }
        />
        <Link to="/login" className={buttonVariants({ variant: 'outline', className: 'h-11 w-full rounded-xl' })}>
          Back to sign in
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
        <ArrowLeft className="size-4" aria-hidden /> Back to sign in
      </Link>

      <AuthStatusHeader icon={<Mail />} title="Forgot your password?" description="Enter your email and we will send you a reset link." />

      {error && <Alert tone="error" className="mb-6">{error}</Alert>}

      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <Field label="Email address" htmlFor="email" required error={errorFor('email')}>
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
            placeholder="name@company.com"
            className="h-12 rounded-xl border-slate-300 bg-white text-base shadow-sm placeholder:text-slate-500 md:text-base"
          />
        </Field>

        <Button type="submit" disabled={loading} className="h-12 w-full rounded-xl bg-primary text-base text-white hover:bg-primary-hover">
          {loading ? (
            <>
              <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden /> Sending...
            </>
          ) : (
            'Send reset link'
          )}
        </Button>
      </form>
    </AuthPageShell>
  );
};

export default ForgotPasswordPage;
