import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { AuthPageShell, AuthStatusHeader } from '@/components/auth/AuthPageShell';
import { getStoredUser, getToken, updateStoredUser } from '../utils/session';

const JoinWorkspacePage = () => {
  const { inviteCode } = useParams<{ inviteCode: string }>();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');
  // Joining is a one-time action: guard against effect re-runs (StrictMode)
  const started = useRef<string | null>(null);

  useEffect(() => {
    if (started.current === inviteCode) return;
    started.current = inviteCode ?? null;

    const join = async () => {
      if (!getToken()) {
        // Not logged in — save code and redirect to login
        sessionStorage.setItem('pendingInvite', inviteCode || '');
        navigate('/login');
        return;
      }

      try {
        const response = await api.post('/workspaces/join', { inviteCode });
        setStatus('success');
        setMessage(`You joined ${response.data.name}.`);

        // Update stored user's active workspace
        const storedUser = getStoredUser();
        if (storedUser) {
          const workspaces = storedUser.workspaces || [];
          updateStoredUser({
            activeWorkspace: response.data._id,
            activeWorkspaceSlug: response.data.slug,
            workspaces: workspaces.includes(response.data._id) ? workspaces : [...workspaces, response.data._id],
          });
        }

        window.setTimeout(() => navigate(`/${response.data.slug}/dashboard`), 1500);
      } catch (error: unknown) {
        const axiosError = error as { response?: { data?: { message?: string } } };
        setStatus('error');
        setMessage(axiosError.response?.data?.message || 'Failed to join workspace.');
      }
    };
    join();
  }, [inviteCode, navigate]);

  return (
    <AuthPageShell>
      <div aria-live="polite" className="text-center">
        {status === 'loading' && (
          <AuthStatusHeader icon={<Loader2 />} spin title="Joining workspace" description="Please wait..." />
        )}
        {status === 'success' && (
          <AuthStatusHeader icon={<CheckCircle2 />} tone="success" title="Welcome aboard" description={`${message} Opening your dashboard...`} />
        )}
        {status === 'error' && (
          <>
            <AuthStatusHeader icon={<XCircle />} tone="danger" title="Could not join" description={message} />
            <Link to="/" className={buttonVariants({ variant: 'outline', className: 'h-11 w-full rounded-xl' })}>
              Back to home
            </Link>
          </>
        )}
      </div>
    </AuthPageShell>
  );
};

export default JoinWorkspacePage;
