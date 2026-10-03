import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../utils/api';
import { Button } from '@/components/ui/button';
import { Alert, Surface } from '@/components/ds';
import { CheckCircle2, XCircle, Loader2, ArrowRight, RefreshCw } from 'lucide-react';

const VerifyEmailPage = () => {
  const { token } = useParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [resendEmail, setResendEmail] = useState('');
  const [resendStatus, setResendStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [showResend, setShowResend] = useState(false);

  // Auto-verify on page load
  useEffect(() => {
    const verify = async () => {
      try {
        const response = await api.get(`/auth/verify-email/${token}`);
        setStatus('success');
        setMessage(response.data.message);
      } catch (error: unknown) {
        const axiosError = error as { response?: { data?: { message?: string } } };
        setStatus('error');
        setMessage(axiosError.response?.data?.message || 'Verification failed');
        setShowResend(true);
      }
    };
    verify();
  }, [token]);

  // Handle resend request
  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resendEmail) return;
    setResendStatus('sending');
    try {
      await api.post('/auth/resend-verification', { email: resendEmail });
      setResendStatus('sent');
    } catch  {
      setResendStatus('idle');
      alert('Failed to resend. Please try again.');
    }
  };

  return (
    <div className="min-h-dvh flex items-center justify-center bg-slate-50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <Surface padding="lg" className="max-w-md w-full border-slate-200 shadow-xl text-center">
        
        {/* LOADING */}
        {status === 'loading' && (
          <>
            <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Verifying your email</h1>
            <p className="text-slate-500">Please wait while we verify your account...</p>
          </>
        )}

        {/* SUCCESS */}
        {status === 'success' && (
          <>
            <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-8 h-8 text-emerald-600" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Email Verified!</h1>
            <p className="text-slate-500 mb-8">{message}</p>
            <Link to="/login">
              <Button className="w-full h-11 rounded-xl gap-2 bg-primary hover:bg-primary-hover text-white">
                Continue to Login <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </>
        )}

        {/* ERROR */}
        {status === 'error' && (
          <>
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <XCircle className="w-8 h-8 text-red-600" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Link Invalid or Expired</h1>
            <p className="text-slate-500 mb-6">{message}</p>

            {/* Resend Form */}
            {showResend && resendStatus === 'idle' && (
              <form onSubmit={handleResend} className="space-y-3 mb-6">
                <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">
                  Request a new link
                </p>
                <input
                  type="email"
                  required
                  placeholder="your@email.com"
                  value={resendEmail}
                  onChange={(e) => setResendEmail(e.target.value)}
                  className="w-full h-11 px-4 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                />
                <Button type="submit" variant="outline" className="w-full h-11 rounded-xl gap-2">
                  <RefreshCw className="w-4 h-4" /> Resend Verification Email
                </Button>
              </form>
            )}

            {resendStatus === 'sending' && (
              <div className="mb-6 p-3 text-sm text-slate-500 bg-slate-50 rounded-lg flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Sending...
              </div>
            )}

            {resendStatus === 'sent' && (
              <Alert tone="success" className="mb-6 text-left">Verification email sent! Check your inbox.</Alert>
            )}

            <Link to="/login">
              <Button variant="outline" className="w-full h-11 rounded-xl">
                Back to Login
              </Button>
            </Link>
          </>
        )}
      </Surface>
    </div>
  );
};

export default VerifyEmailPage;