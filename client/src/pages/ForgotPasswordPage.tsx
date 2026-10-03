import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, Field, Surface } from '@/components/ds';
import { ArrowLeft, Mail } from 'lucide-react';

const ForgotPasswordPage = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
    } catch (error: unknown) {
      const axiosError = error as { 
        response?: { 
          data?: { 
            message?: string; 
            errors?: { msg: string }[] 
          } 
        } 
      };
      setError(
        axiosError.response?.data?.message || 
        axiosError.response?.data?.errors?.[0]?.msg || 
        'Something went wrong'
      );
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-slate-50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Surface padding="lg" className="max-w-md w-full border-slate-200 shadow-xl text-center">
          <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <Mail className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Check your inbox</h1>
          <p className="text-slate-500 mb-8">
            If an account exists for <span className="font-semibold text-slate-700">{email}</span>, we've sent a password reset link. Check your email inbox and spam folder.
          </p>
          <Link to="/login">
            <Button variant="outline" className="w-full h-11 rounded-xl">
              Back to Login
            </Button>
          </Link>
        </Surface>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-slate-50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <Surface padding="lg" className="max-w-md w-full border-slate-200 shadow-xl">
        <Link to="/login" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 mb-6">
          <ArrowLeft className="w-4 h-4" /> Back to Login
        </Link>

        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Mail className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Forgot your password?</h1>
          <p className="text-slate-500 text-sm">Enter your email and we'll send you a reset link.</p>
        </div>

        {error && <Alert tone="error" className="mb-6">{error}</Alert>}

        <form onSubmit={handleSubmit} className="space-y-5">
          <Field label="Email Address" htmlFor="email">
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              className="h-11 bg-slate-50 border-slate-200 rounded-lg"
            />
          </Field>

          <Button 
            type="submit" 
            disabled={loading}
            className="w-full h-11 rounded-xl bg-primary hover:bg-primary-hover text-white"
          >
            {loading ? 'Sending...' : 'Send Reset Link'}
          </Button>
        </form>
      </Surface>
    </div>
  );
};

export default ForgotPasswordPage;