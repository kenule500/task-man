import { useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import api, { getApiErrorMessage } from '../utils/api';
import { saveSession, type StoredUser } from '../utils/session';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, Field, fieldMessageId, Spinner } from '@/components/ds';
import { AuthPageShell, AuthStatusHeader } from '@/components/auth/AuthPageShell';
import { TwoFactorStep, type SecondFactorInput } from '@/components/auth/TwoFactorStep';
import PasswordField from '@/components/auth/PasswordField';
import { useFormValidation } from '@/components/auth/useFormValidation';
import {
  validateEmail, validateName, validateNewPassword, validateRequiredPassword,
} from '@/components/auth/validation';
import { ArrowRight, CheckCircle2, LayoutGrid, Mail, Shield, Smartphone } from 'lucide-react';

const INPUT =
  'h-12 rounded-xl border-slate-300 bg-white text-base text-slate-900 shadow-sm placeholder:text-slate-500 md:text-base';

type Mode = 'login' | 'signup';

const FEATURES = [
  { icon: LayoutGrid, text: 'List, board, calendar and timeline views' },
  { icon: Shield, text: 'Roles and permissions for every teammate' },
  { icon: Smartphone, text: 'Installable on your phone as an app' },
];

const apiErrorMessage = (error: unknown): string => {
  const axiosError = error as {
    response?: { data?: { message?: string; errors?: { msg: string }[]; requiresVerification?: boolean } };
  };
  const data = axiosError.response?.data;
  if (data?.requiresVerification) {
    return 'Your email is not verified yet. Open the verification link we sent you, then sign in.';
  }
  return getApiErrorMessage(error, 'Something went wrong. Please try again.');
};

const AuthScreen = ({ mode }: { mode: Mode }) => {
  const isLogin = mode === 'login';
  const [showVerifyMessage, setShowVerifyMessage] = useState(false);
  // When the server verifies new accounts itself (no email needed), say so instead of "check your email"
  const [accountReady, setAccountReady] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // Set when the password was right and the account asks for a second step
  const [challenge, setChallenge] = useState<string | null>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionExpired = searchParams.get('expired') === '1';

  // Sign-in only needs presence; sign-up enforces the 8 character minimum
  const [validators] = useState(() => ({
    name: (value: string) => (isLogin ? '' : validateName(value)),
    email: (value: string) => validateEmail(value),
    password: (value: string) => (isLogin ? validateRequiredPassword(value) : validateNewPassword(value)),
  }));
  const { errorFor, touch, validateAll } = useFormValidation(formData, validators);

  const setField = (name: keyof typeof formData) => (value: string) =>
    setFormData((current) => ({ ...current, [name]: value }));

  /** Stores the session and routes by onboarding and workspace state. */
  const finishLogin = (data: StoredUser & { token: string }) => {
    saveSession(data.token, data);

    // Handle pending invite from the /accept-invite flow
    const pendingInviteToken = sessionStorage.getItem('pendingInviteToken');
    if (pendingInviteToken) {
      sessionStorage.removeItem('pendingInviteToken');
      navigate(`/accept-invite/${pendingInviteToken}`);
      return;
    }

    // Handle pending invite code from the /join/:code page
    const pendingInvite = sessionStorage.getItem('pendingInvite');
    if (pendingInvite) {
      sessionStorage.removeItem('pendingInvite');
      navigate(`/join/${pendingInvite}`);
      return;
    }

    // Route based on onboarding + workspace state
    if (!data.onboardingComplete) {
      navigate('/onboarding');
    } else if (data.activeWorkspaceSlug) {
      navigate(`/${data.activeWorkspaceSlug}/dashboard`);
    } else {
      // Edge case: onboarding marked complete but no workspace — send to onboarding
      navigate('/onboarding');
    }
  };

  const handleSecondFactor = async (input: SecondFactorInput) => {
    setError('');
    setLoading(true);
    try {
      const response = await api.post('/auth/login/2fa', { challenge, ...input });
      finishLogin(response.data);
    } catch (err: unknown) {
      const code = (err as { response?: { data?: { code?: string } } }).response?.data?.code;
      // An expired or used-up challenge cannot be retried: start again from the password
      if (code === 'CHALLENGE_EXPIRED' || code === 'CHALLENGE_LOCKED') setChallenge(null);
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!validateAll()) return;
    setLoading(true);

    try {
      const endpoint = isLogin ? '/auth/login' : '/auth/signup';
      const payload = { ...formData, email: formData.email.trim(), name: formData.name.trim() };
      const response = await api.post(endpoint, payload);

      if (isLogin) {
        // ===== LOGIN FLOW =====
        if (response.data.twoFactorRequired && typeof response.data.challenge === 'string') {
          setChallenge(response.data.challenge);
          return;
        }
        finishLogin(response.data);
      } else {
        // ===== SIGNUP FLOW =====
        setAccountReady(response.data?.requiresVerification === false);
        setShowVerifyMessage(true);
      }
    } catch (err: unknown) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // Second step: authenticator code or recovery code
  // ============================================================
  if (challenge) {
    return (
      <AuthPageShell>
        <TwoFactorStep
          email={formData.email.trim()}
          loading={loading}
          error={error}
          onSubmit={(input) => void handleSecondFactor(input)}
          onBack={() => {
            setChallenge(null);
            setError('');
          }}
        />
      </AuthPageShell>
    );
  }

  // ============================================================
  // "Check Your Email" screen after successful signup
  // ============================================================
  if (showVerifyMessage && accountReady) {
    return (
      <AuthPageShell>
        <AuthStatusHeader
          icon={<CheckCircle2 />}
          title="Your account is ready"
          description={
            <>
              <span className="font-semibold text-slate-800">{formData.email.trim()}</span> is verified. Sign in to set up
              your workspace.
            </>
          }
        />
        <Link
          to="/login"
          className="flex min-h-11 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-white hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          Sign in
        </Link>
      </AuthPageShell>
    );
  }

  if (showVerifyMessage) {
    return (
      <AuthPageShell>
        <AuthStatusHeader
          icon={<Mail />}
          title="Check your email"
          description={
            <>
              We sent a verification link to{' '}
              <span className="font-semibold text-slate-800">{formData.email.trim()}</span>. Open it to verify your
              account, then sign in.
            </>
          }
        />
        <Alert tone="warning" title="Can't find it?" className="mb-6">
          Check your spam folder. The link works once and expires after a while.
        </Alert>
        <Link
          to="/login"
          className="flex min-h-11 items-center justify-center rounded-lg text-sm font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary"
        >
          Back to sign in
        </Link>
      </AuthPageShell>
    );
  }

  // ============================================================
  // Main Auth Page (Login + Signup)
  // ============================================================
  return (
    <div className="relative flex min-h-dvh w-full items-center justify-center overflow-hidden bg-slate-50 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-4 lg:p-8">
      {/* Background ambient glows */}
      <div aria-hidden className="pointer-events-none absolute left-[-10%] top-[-10%] size-[500px] rounded-full bg-blue-200/40 blur-[120px]" />
      <div aria-hidden className="pointer-events-none absolute bottom-[-10%] right-[-10%] size-[500px] rounded-full bg-primary/10 blur-[120px]" />

      <main className="z-10 flex min-h-[min(650px,calc(100dvh-1.5rem))] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-white bg-white/70 shadow-2xl shadow-slate-200/50 backdrop-blur-2xl lg:min-h-[650px] lg:flex-row">
        {/* ================= LEFT PANEL - Branding ================= */}
        <aside className="relative hidden w-1/2 flex-col justify-between border-r border-white/50 bg-gradient-to-br from-white/80 to-slate-50/50 p-12 lg:flex">
          <div aria-hidden className="absolute inset-0 z-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent" />

          <div className="relative z-10">
            <Link to="/" className="group flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900 focus-visible:outline-2 focus-visible:outline-primary">
              <span aria-hidden className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-blue-400 text-sm text-white shadow-lg shadow-primary/30 motion-safe:transition-transform motion-safe:group-hover:scale-105">
                T
              </span>
              TaskMan
            </Link>
          </div>

          <div className="relative z-10 max-w-md">
            <p className="mb-4 text-4xl font-bold leading-[1.1] tracking-tight text-slate-900">
              Manage your tasks with{' '}
              <span className="bg-gradient-to-r from-primary to-blue-500 bg-clip-text text-transparent">clarity</span>{' '}
              and ease.
            </p>
            <p className="mb-10 text-lg leading-relaxed text-slate-600">
              Plan work in the view that fits it, invite your team and decide who can see and change what.
            </p>

            <ul className="space-y-5">
              {FEATURES.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-3 text-slate-700">
                  <span aria-hidden className="flex size-8 items-center justify-center rounded-lg border border-slate-100 bg-white shadow-sm">
                    <Icon className="size-5 text-primary" />
                  </span>
                  <span className="font-medium">{text}</span>
                </li>
              ))}
            </ul>
          </div>

          <p className="relative z-10 text-sm text-slate-500">© {new Date().getFullYear()} TaskMan</p>
        </aside>

        {/* ================= RIGHT PANEL - Auth Form ================= */}
        <div className="relative flex w-full items-center justify-center p-6 sm:p-8 lg:w-1/2 lg:p-12">
          <div className="w-full max-w-md">
            {/* Brand mark: the branding panel is hidden below lg */}
            <Link to="/" className="mb-6 flex items-center justify-center gap-2 text-xl font-bold tracking-tight text-slate-900 focus-visible:outline-2 focus-visible:outline-primary lg:hidden">
              <span aria-hidden className="flex size-8 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-blue-400 text-sm text-white shadow-lg shadow-primary/30">
                T
              </span>
              TaskMan
            </Link>
            <div className="mb-8 text-center">
              <h1 className="mb-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                {isLogin ? 'Welcome back' : 'Create your account'}
              </h1>
              <p className="text-slate-600">
                {isLogin ? 'Sign in to open your workspace.' : 'It takes a minute. No card needed.'}
              </p>
            </div>

            {sessionExpired && !error && (
              <Alert tone="info" className="mb-6">Your session expired. Please sign in again.</Alert>
            )}

            {error && <Alert tone="error" className="mb-6">{error}</Alert>}

            <form onSubmit={handleSubmit} noValidate className="space-y-5">
              {!isLogin && (
                <Field label="Full name" htmlFor="name" required error={errorFor('name')}>
                  <Input
                    id="name"
                    name="name"
                    type="text"
                    required
                    autoComplete="name"
                    placeholder="Ada Lovelace"
                    value={formData.name}
                    onChange={(e) => setField('name')(e.target.value)}
                    onBlur={() => touch('name')}
                    aria-invalid={!!errorFor('name')}
                    aria-describedby={errorFor('name') ? fieldMessageId('name') : undefined}
                    className={INPUT}
                  />
                </Field>
              )}

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
                  placeholder="name@company.com"
                  value={formData.email}
                  onChange={(e) => setField('email')(e.target.value)}
                  onBlur={() => touch('email')}
                  aria-invalid={!!errorFor('email')}
                  aria-describedby={errorFor('email') ? fieldMessageId('email') : undefined}
                  className={INPUT}
                />
              </Field>

              <PasswordField
                id="password"
                label="Password"
                value={formData.password}
                onChange={setField('password')}
                onBlur={() => touch('password')}
                error={errorFor('password')}
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                showStrength={!isLogin}
                footerLink={
                  isLogin ? (
                    <Link
                      to="/forgot-password"
                      className="inline-flex min-h-8 items-center font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      Forgot password?
                    </Link>
                  ) : undefined
                }
              />

              <Button
                type="submit"
                className="mt-2 h-12 w-full rounded-xl bg-primary text-base font-semibold text-white shadow-lg shadow-primary/25 hover:bg-primary-hover"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Spinner decorative />
                    {isLogin ? 'Signing in...' : 'Creating account...'}
                  </>
                ) : (
                  <>
                    {isLogin ? 'Sign in' : 'Create account'}
                    <ArrowRight className="size-4" aria-hidden />
                  </>
                )}
              </Button>
            </form>

            <p className="mt-8 text-center text-sm text-slate-600">
              {isLogin ? 'New to TaskMan? ' : 'Already have an account? '}
              <Link
                to={isLogin ? '/signup' : '/login'}
                className="inline-flex min-h-10 items-center px-1 font-semibold text-primary underline decoration-primary/30 underline-offset-4 hover:text-primary-hover focus-visible:outline-2 focus-visible:outline-primary"
              >
                {isLogin ? 'Create an account' : 'Sign in'}
              </Link>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};

/** /login and /signup share one screen; the path decides the mode (and resets the form). */
const AuthPage = () => {
  const { pathname } = useLocation();
  const mode: Mode = pathname === '/signup' ? 'signup' : 'login';
  return <AuthScreen key={mode} mode={mode} />;
};

export default AuthPage;
