import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../utils/api';
import { saveSession } from '../utils/session';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, Field, Surface } from '@/components/ds';
import {
  ArrowRight,
  CheckCircle2,
  Zap,
  Shield,
  BarChart3,
  Eye,
  EyeOff,
  Mail,
} from 'lucide-react';

const AuthPage = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [showVerifyMessage, setShowVerifyMessage] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionExpired = searchParams.get('expired') === '1';

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const endpoint = isLogin ? '/auth/login' : '/auth/signup';
      const response = await api.post(endpoint, formData);

      if (isLogin) {
        // ===== LOGIN FLOW =====
        saveSession(response.data.token, response.data);

        // Handle pending invite code from the /join/:code page
        const pendingInvite = sessionStorage.getItem('pendingInvite');
        if (pendingInvite) {
          sessionStorage.removeItem('pendingInvite');
          navigate(`/join/${pendingInvite}`);
          return;
        }

        // Route based on onboarding + workspace state
        if (!response.data.onboardingComplete) {
          navigate('/onboarding');
        } else if (response.data.activeWorkspaceSlug) {
          navigate(`/${response.data.activeWorkspaceSlug}/dashboard`);
        } else {
          // Edge case: onboarding marked complete but no workspace — send to onboarding
          navigate('/onboarding');
        }
      } else {
        // ===== SIGNUP FLOW =====
        setShowVerifyMessage(true);
      }
    } catch (error: unknown) {
      const axiosError = error as {
        response?: {
          data?: {
            message?: string;
            errors?: { msg: string }[];
            requiresVerification?: boolean;
          };
        };
      };

      if (axiosError.response?.data?.requiresVerification) {
        setError('Your email is not verified. Please check your inbox for the verification link.');
      } else {
        setError(
          axiosError.response?.data?.message ||
            axiosError.response?.data?.errors?.[0]?.msg ||
            'Something went wrong. Please try again.'
        );
      }
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // "Check Your Email" screen after successful signup
  // ============================================================
  if (showVerifyMessage) {
    return (
      <div className="min-h-dvh w-full bg-slate-50 flex items-center justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Surface padding="lg" className="border-slate-200 shadow-2xl max-w-md w-full text-center">
          <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <Mail className="w-10 h-10 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-3">Check your email</h1>
          <p className="text-slate-500 mb-8 leading-relaxed">
            We've sent a verification link to{' '}
            <span className="font-semibold text-slate-700">{formData.email}</span>.
            <br />
            Click the link to verify your account and get started.
          </p>

          <Alert tone="warning" title="Tip" className="mb-8 text-left">
            Can't find the email? Check your spam folder or resend the verification link.
          </Alert>

          <button
            onClick={() => {
              setShowVerifyMessage(false);
              setIsLogin(true);
              setFormData({ name: '', email: '', password: '' });
            }}
            className="min-h-10 px-3 text-sm text-primary font-semibold hover:underline"
          >
            Back to Login
          </button>
        </Surface>
      </div>
    );
  }

  // ============================================================
  // Main Auth Page (Login + Signup)
  // ============================================================
  return (
    <div className="min-h-dvh w-full bg-slate-50 relative overflow-hidden flex items-center justify-center p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-4 lg:p-8">
      {/* Background Ambient Glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-blue-200/40 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-primary/10 rounded-full blur-[120px] pointer-events-none"></div>

      {/* Main Glass Container */}
      <div className="w-full max-w-6xl flex flex-col lg:flex-row bg-white/60 backdrop-blur-2xl border border-white shadow-2xl shadow-slate-200/50 rounded-3xl overflow-hidden min-h-[min(650px,calc(100dvh-1.5rem))] lg:min-h-[650px] z-10">
        {/* ================= LEFT PANEL - Branding ================= */}
        <div className="hidden lg:flex w-1/2 p-12 flex-col justify-between relative bg-gradient-to-br from-white/80 to-slate-50/50 border-r border-white/50">
          <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-primary/5 via-transparent to-transparent z-0"></div>

          <div className="relative z-10">
            <Link
              to="/"
              className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2 group"
            >
              <div className="w-9 h-9 bg-gradient-to-br from-primary to-blue-400 rounded-xl flex items-center justify-center text-white text-sm shadow-lg shadow-primary/30 group-hover:scale-105 transition-transform">
                T
              </div>
              TaskMan
            </Link>
          </div>

          <div className="relative z-10 max-w-md">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold mb-6">
              <Zap className="w-3 h-3" />
              <span>New: Advanced Analytics is live</span>
            </div>

            <h2 className="text-4xl font-bold text-slate-900 mb-6 leading-[1.1] tracking-tight">
              Manage your tasks with{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-blue-500">
                clarity
              </span>{' '}
              and ease.
            </h2>
            <p className="text-slate-500 text-lg mb-10 leading-relaxed">
              Join thousands of teams already using TaskMan to organize their workflow, track
              progress, and deliver projects on time.
            </p>

            <div className="space-y-5">
              {[
                {
                  icon: <CheckCircle2 className="w-5 h-5 text-primary" />,
                  text: 'Real-time task tracking & updates',
                },
                {
                  icon: <Shield className="w-5 h-5 text-primary" />,
                  text: 'Secure team collaboration & sessions',
                },
                {
                  icon: <BarChart3 className="w-5 h-5 text-primary" />,
                  text: 'Advanced analytics dashboard',
                },
              ].map((feature, i) => (
                <div key={i} className="flex items-center gap-3 text-slate-600">
                  <div className="w-8 h-8 rounded-lg bg-white shadow-sm border border-slate-100 flex items-center justify-center">
                    {feature.icon}
                  </div>
                  <span className="font-medium">{feature.text}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="relative z-10 text-slate-400 text-sm">
            © {new Date().getFullYear()} TaskMan Inc. All rights reserved.
          </div>
        </div>

        {/* ================= RIGHT PANEL - Auth Form ================= */}
        <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-8 lg:p-12 relative">
          <div className="w-full max-w-md">
            {/* Brand mark: the branding panel is hidden below lg */}
            <Link to="/" className="mb-6 flex items-center justify-center gap-2 text-xl font-bold tracking-tight text-slate-900 lg:hidden">
              <span className="flex size-8 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-blue-400 text-sm text-white shadow-lg shadow-primary/30">
                T
              </span>
              TaskMan
            </Link>
            <div className="text-center mb-8">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 mb-2">
                {isLogin ? 'Welcome back' : 'Create an account'}
              </h1>
              <p className="text-slate-500">
                {isLogin
                  ? 'Enter your credentials to access your workspace'
                  : 'Enter your details below to get started'}
              </p>
            </div>

            {sessionExpired && !error && (
              <Alert tone="info" className="mb-6">Your session expired. Please sign in again.</Alert>
            )}

            {error && <Alert tone="error" className="mb-6">{error}</Alert>}

            <form onSubmit={handleSubmit} className="space-y-5">
              {!isLogin && (
                <Field label="Full Name" htmlFor="name" className="space-y-2">
                  <Input
                    id="name"
                    name="name"
                    type="text"
                    placeholder="John Doe"
                    required
                    value={formData.name}
                    onChange={handleChange}
                    className="h-12 bg-white/80 border-slate-200 text-slate-900 placeholder:text-slate-400 focus-visible:ring-primary/30 focus-visible:border-primary transition-all rounded-xl shadow-sm"
                  />
                </Field>
              )}

              <Field label="Email Address" htmlFor="email" className="space-y-2">
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="name@company.com"
                  required
                  value={formData.email}
                  onChange={handleChange}
                  className="h-12 bg-white/80 border-slate-200 text-slate-900 placeholder:text-slate-400 focus-visible:ring-primary/30 focus-visible:border-primary transition-all rounded-xl shadow-sm"
                />
              </Field>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-slate-700">
                    Password
                  </Label>
                  {isLogin && (
                    <Link
                      to="/forgot-password"
                      className="text-sm text-primary hover:text-blue-700 transition-colors font-medium"
                    >
                      Forgot password?
                    </Link>
                  )}
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={formData.password}
                    onChange={handleChange}
                    className="h-12 bg-white/80 border-slate-200 text-slate-900 placeholder:text-slate-400 focus-visible:ring-primary/30 focus-visible:border-primary transition-all rounded-xl shadow-sm pr-12"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-1 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 transition-colors focus-visible:outline-2 focus-visible:outline-primary"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <EyeOff className="w-5 h-5" />
                    ) : (
                      <Eye className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-12 text-base font-semibold rounded-xl bg-primary hover:bg-primary-hover text-white shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all hover:-translate-y-0.5 mt-2"
                disabled={loading}
              >
                {loading ? 'Processing...' : isLogin ? 'Sign In' : 'Create Account'}
                {!loading && <ArrowRight className="ml-2 h-4 w-4" />}
              </Button>
            </form>

            <div className="mt-8 text-center">
              <p className="text-sm text-slate-500">
                {isLogin ? "Don't have an account? " : 'Already have an account? '}
                <button
                  onClick={() => {
                    setIsLogin(!isLogin);
                    setError('');
                    setFormData({ name: '', email: '', password: '' });
                    setShowPassword(false);
                  }}
                  className="min-h-10 px-1 text-primary font-semibold hover:text-primary-hover transition-colors underline decoration-primary/30 underline-offset-4"
                >
                  {isLogin ? 'Sign up' : 'Log in'}
                </button>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;